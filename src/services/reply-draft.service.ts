import type { gmail_v1 } from "@googleapis/gmail";
import { Prisma } from "../generated/prisma/client";
import { consumeAiQuota } from "../lib/ai-quota";
import { findPlaceholders } from "../lib/drafting/placeholders";
import { REWRITE_INSTRUCTIONS } from "../lib/drafting/prompt";
import { AppError, BadRequestError, ConflictError, NotFoundError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError, isGmailNotFound } from "../lib/gmail/client";
import { computeRecipients } from "../lib/gmail/compose";
import { fetchReplyHeaders, fetchThread } from "../lib/gmail/thread";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { OPEN_DRAFT_STATUSES, ReplyDraftRepository } from "../repositories/reply-draft.repository";
import type { RewriteDraft, SendDraft, UpdateDraft } from "../schemas/reply-draft";
import { DraftingService } from "./drafting.service";
import { EmailMessageService } from "./email-message.service";
import { MailAccountService } from "./mail-account.service";

export const UNDO_WINDOW_MS = 5000;

const needsReauth = () => new AppError("Reconnect this Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");

export class ReplyDraftService {
  private draftRepo = new ReplyDraftRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private mailAccountService = new MailAccountService();
  private emailMessageService = new EmailMessageService();
  private drafting = new DraftingService();

  // The thread and recipients are read from Gmail for the screen and not kept.
  async getDraft(id: string, userId: string) {
    try {
      const draft = await this.draftRepo.findById(id, userId);
      if (!draft) throw new NotFoundError("Draft not found");

      const message = draft.emailMessage;
      const view = await this.withGmail(userId, message.mailAccountId, async (client, accountEmail) => {
        const [thread, headers] = await Promise.all([
          fetchThread(client, message.gmailThreadId),
          fetchReplyHeaders(client, message.gmailMessageId),
        ]);
        return {
          thread,
          recipients: {
            reply: computeRecipients(headers, accountEmail, false),
            replyAll: computeRecipients(headers, accountEmail, true),
          },
        };
      }).catch(error => {
        // The draft still opens without Gmail: it can be edited or dismissed, and send re-checks access.
        if (!(error instanceof AppError) && !isGmailNotFound(error)) {
          console.error(`[drafts] thread for ${id} unavailable:`, (error as Error).message);
        }
        return null;
      });

      return {
        ...draft,
        placeholders: findPlaceholders(draft.body),
        thread: view?.thread ?? [],
        recipients: view?.recipients ?? null,
      };
    } catch (error) {
      throw error;
    }
  }

  // Draft a reply on demand, for any email. An open draft is returned as it is; a closed one is replaced.
  async createForMessage(messageId: string, userId: string) {
    try {
      const message = await this.emailMessageRepo.findById(messageId, userId);
      if (!message) throw new NotFoundError("Message not found");

      const existing = await this.draftRepo.findByMessage(messageId, userId);
      if (existing && OPEN_DRAFT_STATUSES.includes(existing.status)) return await this.getDraft(existing.id, userId);

      await consumeAiQuota(userId);
      const body = await this.withGmail(userId, message.mailAccountId, async (client, accountEmail) =>
        this.drafting.compose(client, await this.drafting.authorFor(userId, accountEmail), message),
      ).catch(this.mapGmailNotFound);

      let draftId: string;
      if (existing) {
        draftId = (
          await this.draftRepo.update(existing.id, userId, {
            body,
            status: "PENDING",
            replyAll: false,
            sendAt: null,
            failureReason: null,
            notifiedAt: new Date(),
          })
        ).id;
      } else {
        try {
          draftId = (await this.draftRepo.create({ userId, emailMessageId: messageId, body, notifiedAt: new Date() })).id;
        } catch (error) {
          // The auto-drafter got there in the meantime; theirs stands.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) throw error;
          draftId = (await this.draftRepo.findByMessage(messageId, userId))!.id;
        }
      }

      return await this.getDraft(draftId, userId);
    } catch (error) {
      throw error;
    }
  }

  async update(id: string, userId: string, data: UpdateDraft) {
    try {
      const moved = await this.draftRepo.transition(id, userId, ["PENDING", "FAILED"], {
        ...(data.body !== undefined && { body: data.body }),
        ...(data.replyAll !== undefined && { replyAll: data.replyAll }),
      });
      if (!moved) throw new ConflictError("This draft can't be edited now");
      return await this.getDraft(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async rewrite(id: string, userId: string, data: RewriteDraft) {
    try {
      const draft = await this.draftRepo.findById(id, userId);
      if (!draft) throw new NotFoundError("Draft not found");
      if (draft.status !== "PENDING" && draft.status !== "FAILED") throw new ConflictError("This draft can't be edited now");

      const instruction = data.preset ? REWRITE_INSTRUCTIONS[data.preset] : data.instruction!;
      const currentBody = data.body ?? draft.body;

      await consumeAiQuota(userId);
      const body = await this.withGmail(userId, draft.emailMessage.mailAccountId, async (client, accountEmail) =>
        this.drafting.recompose(
          client,
          await this.drafting.authorFor(userId, accountEmail),
          draft.emailMessage,
          currentBody,
          instruction,
        ),
      ).catch(this.mapGmailNotFound);

      const moved = await this.draftRepo.transition(id, userId, ["PENDING", "FAILED"], { body });
      if (!moved) throw new ConflictError("This draft can't be edited now");
      return await this.getDraft(id, userId);
    } catch (error) {
      throw error;
    }
  }

  // Starts the undo window. The sender takes the draft once sendAt has passed (ReplyWorkerService).
  async send(id: string, userId: string, data: SendDraft) {
    try {
      const draft = await this.draftRepo.findById(id, userId);
      if (!draft) throw new NotFoundError("Draft not found");
      if (draft.status !== "PENDING" && draft.status !== "FAILED") throw new ConflictError("This draft can't be sent now");

      const body = data.body.trim();
      if (!body) throw new BadRequestError("Write something before sending");
      if (findPlaceholders(body).length > 0) {
        throw new AppError("Fill in the bracketed parts before sending", 400, "DRAFT_HAS_PLACEHOLDERS");
      }

      const message = draft.emailMessage;
      const recipients = await this.withGmail(userId, message.mailAccountId, async (client, accountEmail) =>
        computeRecipients(await fetchReplyHeaders(client, message.gmailMessageId), accountEmail, data.replyAll),
      ).catch(this.mapGmailNotFound);
      if (recipients.to.length === 0) throw new BadRequestError("There's no one to reply to on this email");

      const moved = await this.draftRepo.transition(id, userId, ["PENDING", "FAILED"], {
        body,
        replyAll: data.replyAll,
        status: "SCHEDULED",
        sendAt: new Date(Date.now() + UNDO_WINDOW_MS),
        failureReason: null,
      });
      if (!moved) throw new ConflictError("This draft can't be sent now");

      return await this.getDraft(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async cancelSend(id: string, userId: string) {
    try {
      const moved = await this.draftRepo.transition(id, userId, ["SCHEDULED"], { status: "PENDING", sendAt: null });
      if (!moved) throw new AppError("Too late: this reply has already gone", 409, "DRAFT_ALREADY_SENT");
      return await this.getDraft(id, userId);
    } catch (error) {
      throw error;
    }
  }

  // "No reply needed" from the draft: the draft goes, and a waiting email is marked read as well.
  async dismiss(id: string, userId: string) {
    try {
      const draft = await this.draftRepo.findById(id, userId);
      if (!draft) throw new NotFoundError("Draft not found");

      const moved = await this.draftRepo.transition(id, userId, ["PENDING", "FAILED"], { status: "DISMISSED", sendAt: null });
      if (!moved) throw new ConflictError("This draft can't be dismissed now");

      const message = draft.emailMessage;
      const waiting =
        message.action === "AWAITING_REPLY" ||
        (message.category === "NEEDS_REPLY" && message.action === "LEFT_UNREAD");
      if (waiting) await this.emailMessageService.dismissReply(message.id, userId);

      return { id, status: "DISMISSED" as const };
    } catch (error) {
      throw error;
    }
  }

  private mapGmailNotFound = (error: unknown): never => {
    if (isGmailNotFound(error)) throw new NotFoundError("This email is no longer in Gmail");
    throw error;
  };

  private async withGmail<T>(
    userId: string,
    mailAccountId: string,
    work: (client: gmail_v1.Gmail, accountEmail: string) => Promise<T>,
  ): Promise<T> {
    const account = await this.mailAccountRepo.findById(mailAccountId, userId);
    if (!account) throw new NotFoundError("Mail account not found");
    if (account.status !== "ACTIVE") throw needsReauth();

    try {
      return await work(await gmailFor(account), account.email);
    } catch (error) {
      if (!(error instanceof GmailAccessRevokedError)) throw error;
      await this.mailAccountService.markNeedsReauth(userId, account);
      throw needsReauth();
    }
  }
}
