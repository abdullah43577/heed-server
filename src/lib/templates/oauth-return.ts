const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STROKE = 'stroke="var(--fg)" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';

const envelope = `<rect x="40" y="40" width="80" height="54" rx="6" fill="var(--surface)" ${STROKE}/><path d="m43 44 37 26 37-26" ${STROKE}/>`;

const connectedArt = `<circle cx="80" cy="62" r="50" fill="var(--tint)"/>${envelope}<circle cx="116" cy="40" r="12" fill="var(--accent)"/><path d="m110.5 40.5 4 4 7.5-8" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M32 31v10M27 36h10" stroke="var(--accent)" stroke-width="1.75" stroke-linecap="round"/>`;

const failedArt = `<circle cx="80" cy="62" r="50" fill="var(--warn-tint)"/>${envelope}<circle cx="116" cy="40" r="12" fill="var(--warn)"/><path d="M116 34v7" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/><circle cx="116" cy="45.6" r="1.4" fill="#FFFFFF"/>`;

export const oauthReturnPage = function (appUrl: string, succeeded: boolean) {
  const href = escapeAttribute(appUrl);
  const title = succeeded ? "Gmail connected" : "Gmail not connected";
  const detail = succeeded
    ? "Taking you back to Heed. Your inbox will be watched from now on."
    : "Nothing was changed. Go back to Heed to see what happened and try again.";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${href}" />
    <title>${title}</title>
    <style>
      :root { --canvas: #FFFFFF; --surface: #FFFFFF; --fg: #0B0D12; --fg-muted: #4B5563; --fg-subtle: #6B7280;
        --accent: #0E7A63; --tint: #E7F4EF; --warn: #B45309; --warn-tint: #FDF1E3; }
      @media (prefers-color-scheme: dark) {
        :root { --canvas: #0E0F12; --surface: #15171B; --fg: #F2F3F5; --fg-muted: #A9AFBA; --fg-subtle: #8A909C;
          --accent: #1F9E80; --tint: #12302A; --warn: #F0A34A; --warn-tint: #3A2A14; }
      }
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: var(--canvas); color: var(--fg); -webkit-font-smoothing: antialiased; }
      main { text-align: center; padding: 24px 36px; max-width: 360px; }
      h1 { margin: 20px 0 6px; font-size: 18px; font-weight: 600; letter-spacing: -0.01em; }
      p { margin: 0; font-size: 13px; line-height: 19px; color: var(--fg-muted); }
      a { display: inline-flex; align-items: center; height: 44px; margin-top: 24px; padding: 0 20px; border-radius: 8px;
        background: var(--accent); color: #FFFFFF; text-decoration: none; font-size: 14px; font-weight: 600; }
      small { display: block; margin-top: 14px; font-size: 12px; color: var(--fg-subtle); }
    </style>
  </head>
  <body>
    <main>
      <svg width="176" height="132" viewBox="0 0 160 120" fill="none" aria-hidden="true">${succeeded ? connectedArt : failedArt}</svg>
      <h1>${title}</h1>
      <p>${detail}</p>
      <a href="${href}">Return to Heed</a>
      <small>If nothing happens, tap the button.</small>
    </main>
  </body>
</html>`;
};
