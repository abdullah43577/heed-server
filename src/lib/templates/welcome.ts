import { baseLayout } from "./layout";

export function welcomeTemplate({ name }: { name: string }) {
  const content = `
    <h2 style="margin:0 0 12px; color:#18181b; font-size:20px;">Welcome to Heed, ${name}</h2>
    <p style="margin:0; color:#52525b; font-size:14px; line-height:1.5;">
      Connect your Gmail and Heed will start reading the mail that doesn't need you, so you only see what does.
    </p>
  `;
  return baseLayout(content);
}
