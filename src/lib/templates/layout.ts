export function baseLayout(content: string) {
  return `
  <!DOCTYPE html>
  <html>
    <body style="margin:0; padding:0; background-color:#f4f4f5; font-family:Helvetica,Arial,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 0;">
        <tr>
          <td align="center">
            <table width="480" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:12px; overflow:hidden; border:1px solid #e4e4e7;">
              <tr>
                <td style="background:#18181b; padding:24px; text-align:center;">
                  <span style="color:#ffffff; font-size:20px; font-weight:600; letter-spacing:-0.02em;">Heed</span>
                </td>
              </tr>
              <tr>
                <td style="padding:32px;">
                  ${content}
                </td>
              </tr>
              <tr>
                <td style="padding:20px 32px; background:#fafafa; text-align:center;">
                  <span style="color:#a1a1aa; font-size:12px;">© ${new Date().getFullYear()} Heed. All rights reserved.</span>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
  </html>`;
}
