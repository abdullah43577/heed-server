import { OAuth2Client } from "google-auth-library";
import { getEnv } from "../get-env";

const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = getEnv([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REDIRECT_URI",
]);

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";

const SCOPES = ["openid", "email", GMAIL_SCOPE];

export const createOAuthClient = function () {
  return new OAuth2Client({
    ...(GOOGLE_CLIENT_ID && { clientId: GOOGLE_CLIENT_ID }),
    ...(GOOGLE_CLIENT_SECRET && { clientSecret: GOOGLE_CLIENT_SECRET }),
    ...(GOOGLE_REDIRECT_URI && { redirectUri: GOOGLE_REDIRECT_URI }),
  });
};

export const buildAuthUrl = function (state: string, loginHint?: string) {
  return createOAuthClient().generateAuthUrl({
    access_type: "offline",
    // A refresh token is only issued alongside a fresh consent screen.
    prompt: "consent select_account",
    include_granted_scopes: true,
    scope: SCOPES,
    state,
    ...(loginHint && { login_hint: loginHint }),
  });
};

export interface GoogleGrant {
  email: string;
  sub: string;
  refreshToken: string | null;
  scopes: string[];
}

export const exchangeCode = async function (code: string): Promise<GoogleGrant> {
  const client = createOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token) throw new Error("Google returned no id_token");

  const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: GOOGLE_CLIENT_ID! });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.sub) throw new Error("Google id_token carried no email");

  return {
    email: payload.email.toLowerCase(),
    sub: payload.sub,
    refreshToken: tokens.refresh_token ?? null,
    scopes: (tokens.scope ?? "").split(" ").filter(Boolean),
  };
};

export const revokeToken = async function (token: string) {
  try {
    await createOAuthClient().revokeToken(token);
  } catch (error) {
    console.error("[gmail] token revoke failed:", (error as Error).message);
  }
};
