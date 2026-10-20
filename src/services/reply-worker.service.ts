import type { gmail_v1 } from "@googleapis/gmail";
import { Prisma } from "../generated/prisma/client";
import { assertAiQuota, consumeAiQuota } from "../lib/ai-quota";
import { AiQuotaExceededError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError } from "../lib/gmail/client";
import { buildReplyRaw, computeRecipients, sendRaw } from "../lib/gmail/compose";
import { modifyLabels } from "../lib/gmail/message";
import { fetchReplyHeaders } from "../lib/gmail/thread";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { ReplyDraftRepository } from "../repositories/reply-draft.repository";
import { DraftingService } from "./drafting.service";
import { MailAccountService } from "./mail-account.service";
import { NotificationService } from "./notification.service";

const AUTO_DRAFT_WINDOW_MS = 48 * 60 * 60 * 1000;
const AUTO_DRAFT_MAX_ATTEMPTS = 3;
const AUTO_DRAFTS_PER_TICK = 3;
// Drafts made within this long of the first one share a single push.
const PUSH_BATCH_MS = 2 * 60 * 1000;
const STUCK_SENDING_MS = 2 * 60 * 1000;

interface SyncAccount {
  id: string;
  userId: string;
  replyLabelId: string | null;
}

const senderName = (message: { fromName: string | null; fromEmail: string }) => message.fromName ?? message.fromEmail;

export class ReplyWorkerService {
  private draftRepo = new ReplyDraftRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private mailAccountService = new MailAccountService();
  private notificationService = new NotificationService();
  private drafting = new DraftingService();

  async draftTick(now = new Date()) {
    const recovered = await this.recoverStuckSends(now);
    const drafted = await this.autoDraft(now);
    const notified = await this.notifyReady(now);
    return { recovered, drafted, notified };
  }

  // Waiting emails from the last 48 hours get a draft without being asked; older ones only on a tap.
  async autoDraft(now = new Date()) {
    const candidates = await this.emailMessageRepo.findDraftCandidates(
      new Date(now.getTime() - AUTO_DRAFT_WINDOW_MS),
      AUTO_DRAFT_MAX_ATTEMPTS,
      AUTO_DRAFTS_PER_TICK,
    );
    let drafted = 0;

    for (const message of candidates) {
      const account = await this.mailAccountRepo.findById(message.mailAccountId, message.userId);
      if (!account || account.status !== "ACTIVE") continue;

      try {
        // Quota is not an error: the email waits in Review with a Draft a reply button.
        await assertAiQuota(message.userId);
        await consumeAiQuota(message.userId);

        const client = await gmailFor(account);
        const body = await this.drafting.compose(
          client,
          await this.drafting.authorFor(message.userId, account),
          message,
        );
        await this.draftRepo.create({ userId: message.userId, emailMessageId: message.id, body });
        drafted += 1;
      } catch (error) {
        if (error instanceof AiQuotaExceededError) continue;
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
        if (error instanceof GmailAccessRevokedError) {
          await this.mailAccountService.markNeedsReauth(message.userId, account);
          continue;
        }
        console.error(`[drafts] ${message.id} failed:`, (error as Error).message);
        await this.emailMessageRepo.incrementDraftAttempts(message.id, message.userId);
      }
    }

    return drafted;
  }

  async notifyReady(now = new Date()) {
    const drafts = await this.draftRepo.findUnnotified();
    const byUser = new Map<string, typeof drafts>();
    for (const draft of drafts) byUser.set(draft.userId, [...(byUser.get(draft.userId) ?? []), draft]);

    let sent = 0;
    for (const [userId, group] of byUser) {
      if (now.getTime() - group[0]!.createdAt.getTime() < PUSH_BATCH_MS) continue;

      const only = group.length === 1 ? group[0]! : null;
      await this.notificationService.notify({
        userId,
        type: "DRAFTS_READY",
        title: only ? `${senderName(only.emailMessage)} is waiting on a reply` : `${group.length} replies ready`,
        body: only
          ? "Heed drafted one for you. Review it and tap Send."
          : "Heed drafted them for you. Review each one and tap Send.",
        entityType: only ? "reply-draft" : "review",
        entityId: only ? only.id : "all",
      });
      await this.draftRepo.markNotified(group.map(draft => draft.id), userId);
      sent += 1;
    }

    return sent;
  }

  async sendDue(now = new Date()) {
    const due = await this.draftRepo.findDueToSend(now);
    let sent = 0;

    for (const { id, userId } of due) {
      // Claiming moves SCHEDULED → SENDING; an undo that lands first wins and this skips it.
      const claimed = await this.draftRepo.transition(id, userId, ["SCHEDULED"], { status: "SENDING" }, { sendAt: { lte: now } });
      if (claimed && (await this.deliver(id, userId))) sent += 1;
    }

    return sent;
  }

  // A send that never reported back is not retried: it may have gone, and a second copy is worse than a prompt.
  async recoverStuckSends(now = new Date()) {
    const stuck = await this.draftRepo.findStuckSending(new Date(now.getTime() - STUCK_SENDING_MS));
    for (const { id, userId } of stuck) {
      await this.draftRepo.transition(id, userId, ["SENDING"], {
        status: "FAILED",
        failureReason: "Heed couldn't confirm this was sent. Check Gmail's Sent folder before sending again.",
      });
    }
    return stuck.length;
  }

  // Called by the sync with the threads that gained a sent message: the user answered from Gmail.
  async resolveRepliedElsewhere(client: gmail_v1.Gmail, account: SyncAccount, sentThreadIds: string[]) {
    if (sentThreadIds.length === 0) return 0;

    const drafts = await this.draftRepo.findOpenInThreads(account.id, account.userId, sentThreadIds);
    if (drafts.length) await this.draftRepo.markRepliedElsewhere(drafts.map(draft => draft.id), account.userId);

    const waiting = await this.emailMessageRepo.findWaitingInThreads(account.id, account.userId, sentThreadIds);
    for (const message of waiting) {
      await this.emailMessageRepo.update(message.id, account.userId, { action: "REPLIED", reason: "You replied in Gmail" });
      if (account.replyLabelId) {
        await modifyLabels(client, message.gmailMessageId, { remove: [account.replyLabelId] }).catch(error =>
          console.error(`[drafts] label tidy for ${message.id} failed:`, (error as Error).message),
        );
      }
    }

    return drafts.length + waiting.length;
  }

  private async deliver(id: string, userId: string) {
    const draft = await this.draftRepo.findById(id, userId);
    if (!draft) return false;
    const message = draft.emailMessage;
    const account = await this.mailAccountRepo.findById(message.mailAccountId, userId);

    try {
      if (!account || account.status !== "ACTIVE") throw new GmailAccessRevokedError();

      const client = await gmailFor(account);
      const headers = await fetchReplyHeaders(client, message.gmailMessageId);
      const recipients = computeRecipients(headers, account.email, draft.replyAll);
      if (recipients.to.length === 0) throw new Error("no recipients");

      const author = await this.drafting.authorFor(userId, account);
      const raw = await buildReplyRaw({
        fromName: author.name,
        fromEmail: account.email,
        recipients,
        original: headers,
        body: draft.body,
      });
      const sentMessageId = await sendRaw(client, raw, message.gmailThreadId);

      await this.draftRepo.transition(id, userId, ["SENDING"], { status: "SENT", sentMessageId, sendAt: null });
      await this.emailMessageRepo.update(message.id, userId, { action: "REPLIED", reason: "You replied from Heed" });
      await modifyLabels(client, message.gmailMessageId, {
        add: account.handledLabelId ? [account.handledLabelId] : [],
        remove: ["UNREAD", ...(account.replyLabelId ? [account.replyLabelId] : [])],
      }).catch(error => console.error(`[drafts] label tidy for ${message.id} failed:`, (error as Error).message));

      return true;
    } catch (error) {
      const revoked = error instanceof GmailAccessRevokedError;
      if (revoked && account?.status === "ACTIVE") await this.mailAccountService.markNeedsReauth(userId, account);
      console.error(`[drafts] send ${id} failed:`, (error as Error).message);

      await this.draftRepo.transition(id, userId, ["SENDING"], {
        status: "FAILED",
        failureReason: revoked
          ? "Heed lost access to this Gmail account. Reconnect it, then send again."
          : "Gmail didn't accept the reply. Try sending it again.",
      });
      await this.notificationService.notify({
        userId,
        type: "SYSTEM",
        title: `Your reply to ${senderName(message)} wasn't sent`,
        body: "Open it to try again.",
        entityType: "reply-draft",
        entityId: id,
      });
      return false;
    }
  }
}
