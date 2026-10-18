import { BadRequestError, EmailNotVerifiedError, ForbiddenError, NotFoundError, UnauthorizedError } from "../lib/errors";
import { generateAccessToken, generateRefreshToken } from "../lib/generate-token";
import { comparePassword, hashPassword } from "../lib/hash-password";
import { UserRepository } from "../repositories/user.repository";
import type { SignInFormValues, SignUpFormValues } from "../schemas/auth";
import crypto from "crypto";
import { redis } from "../lib/redis-connection";
import { otpAttempts } from "../lib/rate-limit";
import { MailService } from "./mail.service";
import { NotificationService } from "./notification.service";
import type { UpdateProfile, UpdateSettings } from "../schemas/profile";

export class AuthService {
  private userRepo = new UserRepository();
  private mailService = new MailService();
  private notificationService = new NotificationService();
  private static generateOTP = () => crypto.randomInt(100000, 1000000).toString();

  // Matches the client's resend countdown so the two never disagree.
  private static readonly VERIFY_OTP_COOLDOWN_SECONDS = 60;

  // `throttle` is set only on the login path: tapping Sign in repeatedly must not stack codes,
  // and the explicit Resend route is rate limited instead.
  private async issueVerificationOtp(user: { id: string; email: string; first_name: string | null; last_name: string | null }, options?: { throttle?: boolean }) {
    if (options?.throttle) {
      const cooldownKey = `email-verify-cooldown:${user.id}`;

      // NX + EX in one call: set only if absent, and expire it. Checking then
      // setting would let two concurrent sign-ins both find it empty.
      const claimed = await redis.set(cooldownKey, "1", "EX", AuthService.VERIFY_OTP_COOLDOWN_SECONDS, "NX");

      if (!claimed) return false;
    }

    const otp = AuthService.generateOTP();
    const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

    await redis.set(`email-verify:${user.id}`, hashedOtp, "EX", 600);

    await this.mailService.sendVerifyEmail(user.email, {
      name: user.first_name ?? user.last_name ?? "User",
      otp,
    });

    return true;
  }

  async register(data: SignUpFormValues) {
    try {
      const existingUser = await this.userRepo.findByEmail(data.email);

      if (existingUser) throw new BadRequestError("User already exists");

      const hashedPassword = await hashPassword(data.password);

      const { deviceToken, deviceType, ...rest } = data;

      const user = await this.userRepo.createUser({
        ...rest,
        ...(deviceToken && { deviceToken }),
        ...(deviceType && { deviceType }),
        password: hashedPassword,
        has_onboarded: true,
      });

      await this.issueVerificationOtp(user);

      return user;
    } catch (error) {
      throw error;
    }
  }

  async verifyEmail(email: string, otp: string) {
    try {
      const user = await this.userRepo.findByEmail(email);
      if (!user) throw new NotFoundError("User not found");

      const stored = await redis.get(`email-verify:${user.id}`);
      if (!stored) throw new BadRequestError("OTP expired or invalid");

      const hashedInput = crypto.createHash("sha256").update(otp).digest("hex");
      if (hashedInput !== stored) throw new BadRequestError("Invalid OTP");

      await redis.del(`email-verify:${user.id}`);
      await this.userRepo.updateUser(user.id, { has_validated_email: true });

      await this.mailService.sendWelcome(user.email, {
        name: user.first_name ?? user.last_name ?? "User",
      });

      await this.notificationService.notify({
        userId: user.id,
        type: "SYSTEM",
        title: "Welcome to Heed",
        body: "Connect a Gmail account and Heed will start reading the mail that doesn't need you.",
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  async resendVerificationOtp(email: string) {
    try {
      const user = await this.userRepo.findByEmail(email);
      if (!user) throw new NotFoundError("User not found");

      if (user.has_validated_email) throw new BadRequestError("Email is already verified");

      await this.issueVerificationOtp(user);

      return true;
    } catch (error) {
      throw error;
    }
  }

  async login(data: SignInFormValues) {
    try {
      const user = await this.userRepo.findByEmail(data.email);

      if (!user) throw new BadRequestError("Invalid credentials");

      const isMatch = await comparePassword(data.password, user.password);

      if (!isMatch) {
        await this.userRepo.incrementFailedLogin(user.id, user.failedLoginAttempts);

        throw new BadRequestError("Invalid credentials");
      }

      await this.userRepo.resetLoginAttempts(user.id);

      if (user.account_status !== "ACTIVE") {
        throw new ForbiddenError("This account has been suspended. Contact support if you think this is a mistake.");
      }

      // Checked only after the password, so only someone holding the credentials can trigger this
      // mail; a wrong password still gets a flat "Invalid credentials".
      if (!user.has_validated_email) {
        const sent = await this.issueVerificationOtp(user, { throttle: true });

        throw new EmailNotVerifiedError(
          sent
            ? "Your email isn't verified yet. We've sent a new code to your inbox."
            : "Your email isn't verified yet. Enter the code we already sent to your inbox.",
        );
      }

      const accessToken = generateAccessToken({
        id: user.id,
      });

      const refreshToken = generateRefreshToken({
        id: user.id,
      });

      return {
        user,
        tokens: {
          accessToken,
          refreshToken,
        },
      };
    } catch (error) {
      throw error;
    }
  }

  // Always reports success, even for an unknown address, so it cannot be used to enumerate accounts.
  async forgotPassword(email: string) {
    try {
      const user = await this.userRepo.findByEmail(email);

      if (!user) return true;

      const otp = AuthService.generateOTP();
      const hashedOtp = crypto.createHash("sha256").update(otp).digest("hex");

      await redis.set(`password-reset:${user.id}`, hashedOtp, "EX", 600);

      await this.mailService.sendForgotPassword(user.email, {
        name: user.first_name ?? user.last_name ?? "User",
        otp,
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  // An unknown address and a wrong code return the same error, so this cannot enumerate accounts.
  async resetPassword(email: string, otp: string, newPassword: string) {
    try {
      const user = await this.userRepo.findByEmail(email);
      const invalid = new BadRequestError("That code is invalid or has expired");

      if (!user) throw invalid;

      // A six-digit code is only 1,000,000 possibilities. Without an attempt
      // cap the reset flow is a viable route to account takeover.
      if (await otpAttempts.isExhausted("password-reset", user.id)) {
        await redis.del(`password-reset:${user.id}`);
        throw new BadRequestError("Too many incorrect codes. Request a new one.");
      }

      const stored = await redis.get(`password-reset:${user.id}`);
      if (!stored) throw invalid;

      const hashedInput = crypto.createHash("sha256").update(otp).digest("hex");

      if (hashedInput !== stored) {
        await otpAttempts.record("password-reset", user.id, 600);
        throw invalid;
      }

      const hashedPassword = await hashPassword(newPassword);
      await this.userRepo.updateUser(user.id, {
        password: hashedPassword,
        failedLoginAttempts: 0,
        isLocked: false,
      });

      await redis.del(`password-reset:${user.id}`);
      await otpAttempts.clear("password-reset", user.id);

      await this.mailService.sendPasswordChanged(user.email, {
        name: user.first_name ?? user.last_name ?? "User",
      });

      return true;
    } catch (error) {
      throw error;
    }
  }

  // Hard delete: every owned model cascades on userId, so this one delete removes everything.
  async deleteAccount(userId: string, password: string) {
    try {
      const user = await this.userRepo.findUniqueUser({ id: userId }, { id: true, password: true });

      if (!user) throw new NotFoundError("User not found");

      const isMatch = await comparePassword(password, user.password);
      if (!isMatch) throw new BadRequestError("Password Invalid");

      await this.userRepo.deleteUser(userId);

      return true;
    } catch (error) {
      throw error;
    }
  }

  async getProfile(userId: string) {
    try {
      const user = await this.userRepo.findById(userId, {
        id: true,
        first_name: true,
        last_name: true,
        email: true,
        has_validated_email: true,
        lastLogin: true,
        account_status: true,
        has_onboarded: true,
        deviceToken: true,
        deviceType: true,
        createdAt: true,
        updatedAt: true,
        settings: true,
      });

      if (!user) throw new NotFoundError("User not found!");

      return user;
    } catch (error) {
      throw error;
    }
  }

  async updateProfile(userId: string, data: UpdateProfile) {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) throw new NotFoundError("User not found!");

      const { password, ...rest } = await this.userRepo.updateUser(userId, {
        ...(data.first_name && { first_name: data.first_name }),
        ...(data.last_name && { last_name: data.last_name }),
      });

      return rest;
    } catch (error) {
      throw error;
    }
  }

  async updateProfileSettings(userId: string, data: UpdateSettings) {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) throw new NotFoundError("User not found!");

      return await this.userRepo.upsertUserSettings(userId, {
        ...(data.theme && { theme: data.theme }),
        ...(data.notifications !== undefined && { notifications: data.notifications }),
      });
    } catch (error) {
      throw error;
    }
  }

  async generateNewToken(userId: string) {
    try {
      const user = await this.userRepo.findById(userId);
      if (!user) throw new NotFoundError("User not found");
      if (user.account_status !== "ACTIVE") throw new UnauthorizedError("This account is no longer active.");

      const accessToken = generateAccessToken({ id: userId });
      const refreshToken = generateRefreshToken({ id: userId });

      return { accessToken, refreshToken };
    } catch (error) {
      throw error;
    }
  }
}
