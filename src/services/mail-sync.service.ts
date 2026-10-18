import type { gmail_v1 } from "@googleapis/gmail";
import { gmailFor, GmailAccessRevokedError, isGmailNotFound } from "../lib/gmail/client";
import {
  getCurrentHistoryId,
  HistoryExpiredError,
  listAddedInboxMessageIds,
  listInboxMessageIdsSince,
} from "../lib/gmail/history";
import { fetchIncomingMessage, type IncomingMessage } from "../lib/gmail/message";
import { redis } from "../lib/redis-connection";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { MailAccountService } from "./mail-account.service";
import { TriageService } from "./triage.service";

const LOCK_TTL_SECONDS = 120;
const FETCH_CONCURRENCY = 5;
const FALLBACK_OVERLAP_MS = 5 * 60 * 1000;

const lockKey = (accountId: string) => `sync-lock:${accountId}`;

interface SyncableAccount {
  id: string;
  userId: string;
  email: string;
  refreshTokenEnc: string;
  historyId: string | null;
  lastSyncedAt: Date | null;
  handledLabelId: string | null;
  replyLabelId: string | null;
}

export class MailSyncService {
  private mailAccountRepo = new MailAccountRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountService = new MailAccountService();
  private triageService = new TriageService();

  async syncAllAccounts() {
    try {
      const accounts = await this.mailAccountRepo.findActiveForSync();
      let added = 0;
      let failed = 0;

      for (const account of accounts) {
        try {
          added += await this.syncAccount(account);
        } catch (error) {
          failed += 1;
          console.error(`[sync] ${account.id} failed:`, (error as Error).message);
        }
      }

      return { accounts: accounts.length, added, failed };
    } catch (error) {
      throw error;
    }
  }

  private async syncAccount(account: SyncableAccount) {
    // The in-process timer and the platform cron can both fire; whoever holds the lock does the work.
    const acquired = await redis.set(lockKey(account.id), "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) return 0;

    try {
      const client = await gmailFor(account);
      const startedAt = new Date();

      if (!account.historyId) {
        await this.saveCursor(account, await getCurrentHistoryId(client), startedAt);
        return 0;
      }

      const { ids, historyId } = await this.findNewMessageIds(client, account);
      const added = await this.storeNew(client, account, ids);
      await this.saveCursor(account, historyId, startedAt);
      await this.triageService.triagePending(client, account);

      return added;
    } catch (error) {
      if (error instanceof GmailAccessRevokedError) {
        await this.mailAccountService.markNeedsReauth(account.userId, account);
        return 0;
      }
      throw error;
    } finally {
      await redis.del(lockKey(account.id));
    }
  }

  private async findNewMessageIds(client: gmail_v1.Gmail, account: SyncableAccount) {
    try {
      return await listAddedInboxMessageIds(client, account.historyId!);
    } catch (error) {
      if (!(error instanceof HistoryExpiredError)) throw error;

      // Capture the new cursor first, so mail landing during the catch-up shows up in the next history read.
      const historyId = await getCurrentHistoryId(client);
      const since = new Date((account.lastSyncedAt ?? new Date()).getTime() - FALLBACK_OVERLAP_MS);
      return { ids: await listInboxMessageIdsSince(client, since), historyId };
    }
  }

  private async storeNew(client: gmail_v1.Gmail, account: SyncableAccount, ids: string[]) {
    if (ids.length === 0) return 0;

    const known = await this.emailMessageRepo.findExistingGmailIds(account.id, account.userId, ids);
    const unseen = ids.filter(id => !known.has(id));
    const incoming: IncomingMessage[] = [];
    let retryLater: unknown = null;

    for (let index = 0; index < unseen.length; index += FETCH_CONCURRENCY) {
      const batch = unseen.slice(index, index + FETCH_CONCURRENCY);
      const results = await Promise.allSettled(batch.map(id => fetchIncomingMessage(client, id)));

      for (const result of results) {
        if (result.status === "fulfilled") {
          if (result.value) incoming.push(result.value);
        } else if (!isGmailNotFound(result.reason)) {
          retryLater = result.reason;
        }
      }
    }

    const { count } = incoming.length
      ? await this.emailMessageRepo.createMany(
          incoming.map(message => ({ ...message, userId: account.userId, mailAccountId: account.id })),
        )
      : { count: 0 };

    // Throwing keeps the cursor where it was, so the next run retries what failed;
    // what was stored is skipped by the unique key.
    if (retryLater) throw retryLater;

    return count;
  }

  private async saveCursor(account: SyncableAccount, historyId: string, lastSyncedAt: Date) {
    await this.mailAccountRepo.updateSyncCursor(account.id, account.userId, { historyId, lastSyncedAt });
  }
}
