import { baseLayout, paragraph, warningBlock } from "./layout";

export function passwordChangedTemplate({ name }: { name: string }) {
  return baseLayout({
    eyebrow: "Security",
    tone: "warn",
    title: "Your password was changed",
    body:
      paragraph(`Hi ${name}, the password on your Heed account was just changed. If this was you, there is nothing else to do.`) +
      warningBlock(
        "<strong>If this wasn't you</strong>, reset your password from the sign-in screen straight away and check that your email account is secure.",
      ),
    note: "This is a security notification and cannot be turned off.",
  });
}
