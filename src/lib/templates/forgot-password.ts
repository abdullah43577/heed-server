import { baseLayout, codeBlock, paragraph } from "./layout";

export function forgotPasswordTemplate({ name, otp }: { name: string; otp: string }) {
  return baseLayout({
    eyebrow: "Password reset",
    title: "Reset your password",
    body: paragraph(`Hi ${name}, use the code below to reset your Heed password.`) + codeBlock(otp),
    note: "If you didn't request this, you can safely ignore this email. Your password stays the same.",
  });
}
