import { baseLayout, paragraph, stepsBlock } from "./layout";

export function welcomeTemplate({ name }: { name: string }) {
  return baseLayout({
    eyebrow: "Welcome",
    title: `Welcome to Heed, ${name}`,
    body:
      paragraph("Connect your Gmail and Heed will start reading the mail that doesn't need you, so you only see what does.") +
      stepsBlock([
        { title: "Connect a Gmail account", detail: "Profile, then Gmail accounts. Up to five." },
        { title: "Heed reads new mail", detail: "Updates and receipts are marked read for you. Anything unclear is left alone." },
        { title: "You only reply", detail: "When someone is waiting on you, a draft is ready. Nothing is sent until you tap Send." },
      ]),
  });
}
