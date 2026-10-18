import { sendMail } from "../lib/send-mail";
import { forgotPasswordTemplate } from "../lib/templates/forgot-password";
import { passwordChangedTemplate } from "../lib/templates/password-changed";
import { verifyEmailTemplate } from "../lib/templates/verify-email";
import { welcomeTemplate } from "../lib/templates/welcome";

export class MailService {
  async sendForgotPassword(to: string, data: { name: string; otp: string }) {
    return sendMail({
      email: to,
      subject: "Reset your Heed password",
      message: forgotPasswordTemplate(data),
    });
  }

  async sendPasswordChanged(to: string, data: { name: string }) {
    return sendMail({
      email: to,
      subject: "Your Heed password was changed",
      message: passwordChangedTemplate(data),
    });
  }

  async sendVerifyEmail(to: string, data: { name: string; otp: string }) {
    return sendMail({
      email: to,
      subject: "Verify your Heed account",
      message: verifyEmailTemplate(data),
    });
  }

  async sendWelcome(to: string, data: { name: string }) {
    return sendMail({
      email: to,
      subject: "Welcome to Heed",
      message: welcomeTemplate(data),
    });
  }
}
