import { randomBytes } from "node:crypto";
import { decrypt, encrypt } from "../lib/crypto";
import { AccountLimitError, NotFoundError, OAuthCallbackError } from "../lib/errors";
import { forgetAccessToken, getAccessToken, gmailFor, GmailAccessRevokedError } from "../lib/gmail/client";
import { getCurrentHistoryId } from "../lib/gmail/history";
import { ensureHeedLabels } from "../lib/gmail/labels";
import { buildAuthUrl, exchangeCode, GMAIL_SCOPE, revokeToken } from "../lib/gmail/oauth";
import { redis } from "../lib/redis-connection";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { NotificationService } from "./notification.service";

export const MAX_MAIL_ACCOUNTS = 5;

const STATE_TTL_SECONDS = 600;
const ACCESS_CHECK_TIMEOUT_MS = 5000;

const stateKey = (state: string) => `oauth-state:${state}`;

interface PendingConnect {
  userId: string;
  returnUrl?: string;
}

const withTimeout = function <T>(promise: Promise<T>, ms: number) {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timed out")), ms)),
  ]);
};

export class MailAccountService {
  private mailAccountRepo = new MailAccountRepository();
  private notificationService = new NotificationService();

  async getAccounts(userId: string) {
    try {
      const accounts = await this.mailAccountRepo.findManyByUser(userId);

      const checked = await Promise.all(
        accounts.map(async account => {
          if (account.status !== "ACTIVE") return account;
          const stillGranted = await this.checkAccess(userId, account);
          return stillGranted ? account : { ...account, status: "NEEDS_REAUTH" as const };
        }),
      );

      return checked.map(({ refreshTokenEnc: _secret, ...account }) => account);
    } catch (error) {
      throw error;
    }
  }

  async startConnect(userId: string, options: { loginHint?: string; returnUrl?: string }) {
    try {
      const count = await this.mailAccountRepo.countByUser(userId);
      if (count >= MAX_MAIL_ACCOUNTS && !options.loginHint) throw new AccountLimitError();

      const state = randomBytes(32).toString("hex");
      const pending: PendingConnect = { userId, ...(options.returnUrl && { returnUrl: options.returnUrl }) };
      await redis.set(stateKey(state), JSON.stringify(pending), "EX", STATE_TTL_SECONDS);

      return { url: buildAuthUrl(state, options.loginHint) };
    } catch (error) {
      throw error;
    }
  }

  async completeConnect(input: { code?: string; state?: string; error?: string }) {
    const stored = input.state ? await redis.getdel(stateKey(input.state)) : null;
    const pending = stored ? (JSON.parse(stored) as PendingConnect) : null;
    const fail = (code: string) => new OAuthCallbackError(code, pending?.returnUrl);

    try {
      if (input.error) throw fail("OAUTH_CANCELLED");
      if (!pending) throw fail("OAUTH_STATE_INVALID");
      if (!input.code) throw fail("OAUTH_FAILED");

      const { userId } = pending;
      const grant = await exchangeCode(input.code);

      if (!grant.scopes.includes(GMAIL_SCOPE)) {
        if (grant.refreshToken) await revokeToken(grant.refreshToken);
        throw fail("GMAIL_SCOPE_MISSING");
      }

      const existing = await this.mailAccountRepo.findByEmail(userId, grant.email);

      if (!existing) {
        const count = await this.mailAccountRepo.countByUser(userId);
        if (count >= MAX_MAIL_ACCOUNTS) {
          if (grant.refreshToken) await revokeToken(grant.refreshToken);
          throw fail("ACCOUNT_LIMIT");
        }
      }

      const refreshTokenEnc = grant.refreshToken ? encrypt(grant.refreshToken) : existing?.refreshTokenEnc;
      if (!refreshTokenEnc) throw fail("OAUTH_FAILED");

      const account = await this.mailAccountRepo.upsert({
        userId,
        email: grant.email,
        googleSub: grant.sub,
        refreshTokenEnc,
      });

      await forgetAccessToken(account.id);
      await this.prepareMailbox(userId, account);

      return { email: account.email, returnUrl: pending.returnUrl };
    } catch (error) {
      if (error instanceof OAuthCallbackError) throw error;
      console.error("[gmail] connect failed:", (error as Error).message);
      throw fail("OAUTH_FAILED");
    }
  }

  // Account deletion: a failed revoke must not block the delete, so each grant is settled on its own.
  async revokeAll(userId: string) {
    const accounts = await this.mailAccountRepo.findManyByUser(userId);

    await Promise.allSettled(
      accounts.map(async (account) => {
        await revokeToken(decrypt(account.refreshTokenEnc));
        await forgetAccessToken(account.id);
      }),
    );
  }

  async disconnect(id: string, userId: string) {
    try {
      const account = await this.mailAccountRepo.findById(id, userId);
      if (!account) throw new NotFoundError("Mail account not found");

      await revokeToken(decrypt(account.refreshTokenEnc));
      await forgetAccessToken(account.id);
      await this.mailAccountRepo.delete(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async markNeedsReauth(userId: string, account: { id: string; email: string }) {
    try {
      await this.mailAccountRepo.updateStatus(account.id, userId, "NEEDS_REAUTH");
      await this.notificationService.notify({
        userId,
        type: "ACCOUNT_NEEDS_REAUTH",
        title: "Reconnect your Gmail",
        body: `Heed lost access to ${account.email}. Reconnect it to keep your inbox handled.`,
        entityType: "mail-account",
        entityId: account.id,
      });
    } catch (error) {
      throw error;
    }
  }

  private async checkAccess(userId: string, account: { id: string; email: string; refreshTokenEnc: string }) {
    try {
      await withTimeout(getAccessToken(account), ACCESS_CHECK_TIMEOUT_MS);
      return true;
    } catch (error) {
      if (!(error instanceof GmailAccessRevokedError)) return true;

      await this.markNeedsReauth(userId, account);
      return false;
    }
  }

  // Labels are only needed once triage runs and the sync sets its own cursor when
  // missing, so neither failure may fail the connection.
  private async prepareMailbox(
    userId: string,
    account: { id: string; refreshTokenEnc: string; historyId: string | null },
  ) {
    try {
      const client = await gmailFor(account);
      await this.mailAccountRepo.updateLabels(account.id, userId, await ensureHeedLabels(client));

      if (!account.historyId) {
        await this.mailAccountRepo.updateSyncCursor(account.id, userId, {
          historyId: await getCurrentHistoryId(client),
          lastSyncedAt: new Date(),
        });
      }
    } catch (error) {
      console.error("[gmail] could not prepare mailbox:", (error as Error).message);
    }
  }
}
