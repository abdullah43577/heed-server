import { baseLayout } from "./layout";

export function verifyEmailTemplate({ name, otp }: { name: string; otp: string }) {
  const content = `
    <h2 style="margin:0 0 12px; color:#18181b; font-size:20px;">Verify your email</h2>
    <p style="margin:0 0 24px; color:#52525b; font-size:14px; line-height:1.5;">
      Hi ${name}, welcome to Heed. Enter the code below in the app to verify your email. This code expires in 10 minutes.
    </p>
    <div style="text-align:center; margin:24px 0;">
      <span style="display:inline-block; background:#f4f4f5; border-radius:8px; padding:16px 24px; font-size:28px; font-weight:700; letter-spacing:8px; color:#18181b;">
        ${otp}
      </span>
    </div>
  `;
  return baseLayout(content);
}
