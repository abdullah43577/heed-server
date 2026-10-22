import { getEnv } from "../get-env";

const ACCENT = "#0E7A63";
const WARN = "#B45309";
const WARN_TINT = "#FDF1E3";
const ACCENT_TINT = "#E7F4EF";
const INK = "#0B0D12";
const MUTED = "#4B5563";
const SUBTLE = "#6B7280";
const LINE = "#ECEDF0";
const BORDER = "#E5E7EB";
const CANVAS = "#F4F5F7";
const FONT = "Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

// Gmail strips inline SVG, so the mark is a PNG the server hosts (public/, mounted at /static).
const assetBase = function () {
  const explicit = getEnv("PUBLIC_URL");
  if (explicit) return explicit.replace(/\/$/, "");
  const redirect = getEnv("GOOGLE_REDIRECT_URI");
  try {
    return redirect ? new URL(redirect).origin : "";
  } catch {
    return "";
  }
};

export const paragraph = (html: string) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:22px;color:${MUTED};">${html}</p>`;

export const codeBlock = function (code: string) {
  const digits = code
    .split("")
    .map(
      digit =>
        `<td style="padding:0 4px;"><div style="width:44px;height:52px;line-height:52px;text-align:center;border:1px solid ${BORDER};border-radius:8px;background:#F7F8FA;font-size:24px;font-weight:700;color:${INK};">${digit}</div></td>`,
    )
    .join("");

  return `
    <table cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 8px;"><tr>${digits}</tr></table>
    <p style="margin:0;text-align:center;font-size:12px;line-height:18px;color:${SUBTLE};">This code expires in 10 minutes.</p>`;
};

export const stepsBlock = function (steps: { title: string; detail: string }[]) {
  const rows = steps
    .map((step, index) => {
      const divider = index > 0 ? `border-top:1px solid ${LINE};` : "";
      return `
      <tr>
        <td style="padding:12px 0 12px 14px;vertical-align:top;width:24px;${divider}">
          <div style="width:24px;height:24px;line-height:24px;border-radius:12px;background:${ACCENT_TINT};color:${ACCENT};font-size:12px;font-weight:700;text-align:center;">${index + 1}</div>
        </td>
        <td style="padding:12px 14px 12px 12px;${divider}">
          <div style="font-size:14px;font-weight:600;color:${INK};">${step.title}</div>
          <div style="font-size:13px;line-height:19px;color:${MUTED};margin-top:2px;">${step.detail}</div>
        </td>
      </tr>`;
    })
    .join("");

  return `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 4px;border:1px solid ${LINE};border-radius:10px;border-collapse:separate;">${rows}</table>`;
};

export const warningBlock = (html: string) => `
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0;">
    <tr><td style="background:${WARN_TINT};border-radius:10px;padding:12px 14px;font-size:13px;line-height:19px;color:${INK};">${html}</td></tr>
  </table>`;

interface LayoutParts {
  eyebrow: string;
  title: string;
  body: string;
  note?: string;
  tone?: "accent" | "warn";
}

export function baseLayout({ eyebrow, title, body, note, tone = "accent" }: LayoutParts) {
  const base = assetBase();
  const mark = base
    ? `<img src="${base}/static/heed-mark.png" width="28" height="28" alt="" style="display:block;border:0;border-radius:8px;">`
    : `<div style="width:28px;height:28px;border-radius:8px;background:${ACCENT};"></div>`;

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:${CANVAS};font-family:${FONT};">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${CANVAS};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table width="520" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;width:100%;">
            <tr>
              <td align="center" style="padding-bottom:24px;">
                <table cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td>${mark}</td>
                    <td style="padding-left:8px;font-size:16px;font-weight:600;color:${INK};letter-spacing:-0.01em;">Heed</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="background:#FFFFFF;border:1px solid ${BORDER};border-radius:12px;padding:32px;">
                <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${tone === "warn" ? WARN : ACCENT};">${eyebrow}</p>
                <h1 style="margin:0 0 12px;font-size:21px;line-height:28px;font-weight:600;color:${INK};letter-spacing:-0.01em;">${title}</h1>
                ${body}
                ${note ? `<p style="margin:20px 0 0;padding-top:16px;border-top:1px solid ${LINE};font-size:12px;line-height:18px;color:${SUBTLE};">${note}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:20px 0 0;font-size:12px;line-height:19px;color:${SUBTLE};">
                Heed reads the mail that doesn't need you.<br>&copy; ${new Date().getFullYear()} Heed
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
