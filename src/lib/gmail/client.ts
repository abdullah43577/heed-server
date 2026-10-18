import { gmail, type gmail_v1 } from "@googleapis/gmail";
import { decrypt, encrypt } from "../crypto";
import { redis } from "../redis-connection";
import { createOAuthClient } from "./oauth";

export class GmailAccessRevokedError extends Error {
  constructor() {
    super("Google no longer grants access to this mailbox");
    this.name = "GmailAccessRevokedError";
  }
}

interface TokenSource {
  id: string;
  refreshTokenEnc: string;
}

const tokenKey = (accountId: string) => `gmail-token:${accountId}`;

export const isGmailNotFound = function (error: unknown) {
  const failure = error as { status?: number; response?: { status?: number } };
  return (failure.status ?? failure.response?.status) === 404;
};

const isInvalidGrant = function (error: unknown) {
  const data = (error as { response?: { data?: { error?: string } } }).response?.data;
  return data?.error === "invalid_grant" || String((error as Error).message).includes("invalid_grant");
};

export const forgetAccessToken = async function (accountId: string) {
  await redis.del(tokenKey(accountId));
};

export const getAccessToken = async function (account: TokenSource) {
  const cached = await redis.get(tokenKey(account.id));
  if (cached) return decrypt(cached);

  const client = createOAuthClient();
  client.setCredentials({ refresh_token: decrypt(account.refreshTokenEnc) });

  try {
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Google returned no access token");

    const expiresAt = client.credentials.expiry_date ?? Date.now() + 3_600_000;
    const ttlSeconds = Math.max(60, Math.floor((expiresAt - Date.now()) / 1000) - 120);
    await redis.set(tokenKey(account.id), encrypt(token), "EX", ttlSeconds);

    return token;
  } catch (error) {
    if (isInvalidGrant(error)) throw new GmailAccessRevokedError();
    throw error;
  }
};

export const gmailFor = async function (account: TokenSource): Promise<gmail_v1.Gmail> {
  const auth = createOAuthClient();
  auth.setCredentials({ access_token: await getAccessToken(account) });
  return gmail({ version: "v1", auth });
};
