import { baseLayout, codeBlock, paragraph } from "./layout";

export function verifyEmailTemplate({ name, otp }: { name: string; otp: string }) {
  return baseLayout({
    eyebrow: "Verification",
    title: "Verify your email",
    body: paragraph(`Hi ${name}, welcome to Heed. Enter the code below in the app to verify your email.`) + codeBlock(otp),
    note: "If you didn't create a Heed account, you can safely ignore this email.",
  });
}
