import { baseLayout } from "./layout";

export function forgotPasswordTemplate({ name, otp }: { name: string; otp: string }) {
  const content = `
    <h2 style="margin:0 0 12px; color:#18181b; font-size:20px;">Reset your password</h2>
    <p style="margin:0 0 24px; color:#52525b; font-size:14px; line-height:1.5;">
      Hi ${name}, use the code below to reset your Heed password. This code expires in 10 minutes.
    </p>
    <div style="text-align:center; margin:24px 0;">
      <span style="display:inline-block; background:#f4f4f5; border-radius:8px; padding:16px 24px; font-size:28px; font-weight:700; letter-spacing:8px; color:#18181b;">
        ${otp}
      </span>
    </div>
    <p style="margin:0; color:#a1a1aa; font-size:12px;">
      If you didn't request this, you can safely ignore this email.
    </p>
  `;
  return baseLayout(content);
}
