import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { validateAccessToken, validateRefreshToken } from "../lib/validate-token";
import { rateLimit } from "../lib/rate-limit";

const router = Router();
const authController = new AuthController();

// Keyed on IP and the submitted email, so rotating IPs against one account is capped too.
const emailFromBody = (req: { body?: { email?: string } }) => req.body?.email?.toLowerCase();

const otpLimiter = rateLimit({
  keyPrefix: "otp",
  windowSeconds: 600,
  max: 10,
  identify: emailFromBody,
  message: "Too many attempts. Please wait a few minutes and try again.",
});

const issueLimiter = rateLimit({
  keyPrefix: "otp-issue",
  windowSeconds: 600,
  max: 3,
  identify: emailFromBody,
  message: "Too many requests. Please wait a few minutes before requesting another code.",
});

const loginLimiter = rateLimit({
  keyPrefix: "login",
  windowSeconds: 900,
  max: 10,
  identify: emailFromBody,
  message: "Too many sign-in attempts. Please try again later.",
});

router.get("/", authController.testApi.bind(authController));
router.post("/signup", issueLimiter, authController.createUser.bind(authController));
router.post("/verify-email", otpLimiter, authController.verifyEmail.bind(authController));
router.post("/resend-verification-otp", issueLimiter, authController.resendVerificationOtp.bind(authController));
router.post("/signin", loginLimiter, authController.loginUser.bind(authController));
router.post("/forgot-password", issueLimiter, authController.forgotPassword.bind(authController));
router.post("/reset-password", otpLimiter, authController.resetPassword.bind(authController));
router.get("/profile", validateAccessToken, authController.getProfile.bind(authController));
router.patch("/profile", validateAccessToken, authController.updateProfile.bind(authController));
router.post("/profile/settings", validateAccessToken, authController.updateProfileSettings.bind(authController));
router.delete("/account", validateAccessToken, authController.deleteAccount.bind(authController));
router.post("/token", validateRefreshToken, authController.generateNewToken.bind(authController));

export { router as authRouter };
