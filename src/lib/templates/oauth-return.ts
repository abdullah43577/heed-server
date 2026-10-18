const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export const oauthReturnPage = function (appUrl: string, succeeded: boolean) {
  const href = escapeAttribute(appUrl);
  const title = succeeded ? "Gmail connected" : "Gmail not connected";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="refresh" content="0;url=${href}" />
    <title>${title}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        background: #FAFAFB; color: #17171A; }
      main { text-align: center; padding: 24px; }
      a { display: inline-block; margin-top: 20px; padding: 14px 24px; border-radius: 14px;
        background: #0E7A63; color: #FFFFFF; text-decoration: none; font-weight: 600; }
      @media (prefers-color-scheme: dark) { body { background: #0F0F12; color: #F4F4F6; } a { background: #1F9E80; } }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <a href="${href}">Return to Heed</a>
    </main>
  </body>
</html>`;
};
