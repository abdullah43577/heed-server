import { baseLayout } from "./layout";

export function passwordChangedTemplate({ name }: { name: string }) {
  const content = `
    <h2 style="margin:0 0 12px; color:#18181b; font-size:20px;">Your password was changed</h2>
    <p style="margin:0 0 24px; color:#52525b; font-size:14px; line-height:1.5;">
      Hi ${name}, the password on your Heed account was just changed. If this
      was you, there is nothing else to do.
    </p>
    <p style="margin:0 0 12px; color:#52525b; font-size:14px; line-height:1.5;">
      <strong>If this wasn't you</strong>, reset your password immediately from
      the sign-in screen and check that your email account is secure.
    </p>
    <p style="margin:0; color:#a1a1aa; font-size:12px;">
      This is a security notification and cannot be turned off.
    </p>
  `;
  return baseLayout(content);
}
