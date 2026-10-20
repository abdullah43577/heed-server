import { AppError, BadRequestError, NotFoundError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError } from "../lib/gmail/client";
import { modifyLabels } from "../lib/gmail/message";
import { EmailMessageRepository, type MessageView } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { ReplyDraftRepository } from "../repositories/reply-draft.repository";
import { MailAccountService } from "./mail-account.service";

export class EmailMessageService {
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private mailAccountService = new MailAccountService();
  private draftRepo = new ReplyDraftRepository();

  async getMessages(userId: string, options: { view: MessageView; since?: Date }) {
    try {
      return await this.emailMessageRepo.findManyByUser(userId, options);
    } catch (error) {
      throw error;
    }
  }

  async getMessage(id: string, userId: string) {
    try {
      const message = await this.emailMessageRepo.findById(id, userId);
      if (!message) throw new NotFoundError("Message not found");
      return message;
    } catch (error) {
      throw error;
    }
  }

  async undoMarkRead(id: string, userId: string) {
    try {
      const message = await this.getMessage(id, userId);
      if (message.action !== "MARKED_READ") throw new BadRequestError("Heed didn't mark this one as read");

      await this.changeLabels(userId, message.mailAccountId, message.gmailMessageId, account => ({
        add: ["UNREAD"],
        remove: account.handledLabelId ? [account.handledLabelId] : [],
      }));

      return await this.emailMessageRepo.update(id, userId, { action: "UNDONE" });
    } catch (error) {
      throw error;
    }
  }

  async dismissReply(id: string, userId: string) {
    try {
      const message = await this.getMessage(id, userId);
      // A backlog email that might need a reply is left unread rather than awaiting one.
      const waiting =
        message.action === "AWAITING_REPLY" || (message.category === "NEEDS_REPLY" && message.action === "LEFT_UNREAD");
      if (!waiting) throw new BadRequestError("This one isn't waiting on a reply");

      await this.changeLabels(userId, message.mailAccountId, message.gmailMessageId, account => ({
        add: account.handledLabelId ? [account.handledLabelId] : [],
        remove: ["UNREAD", ...(account.replyLabelId ? [account.replyLabelId] : [])],
      }));

      await this.draftRepo.dismissForMessage(id, userId);
      return await this.emailMessageRepo.update(id, userId, {
        category: "ROUTINE",
        action: "MARKED_READ",
        reason: "You said it needs no reply",
      });
    } catch (error) {
      throw error;
    }
  }

  private async changeLabels(
    userId: string,
    mailAccountId: string,
    gmailMessageId: string,
    change: (account: { handledLabelId: string | null; replyLabelId: string | null }) => {
      add: string[];
      remove: string[];
    },
  ) {
    const account = await this.mailAccountRepo.findById(mailAccountId, userId);
    if (!account) throw new NotFoundError("Mail account not found");
    if (account.status !== "ACTIVE") throw new AppError("Reconnect this Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");

    try {
      await modifyLabels(await gmailFor(account), gmailMessageId, change(account));
    } catch (error) {
      if (!(error instanceof GmailAccessRevokedError)) throw error;
      await this.mailAccountService.markNeedsReauth(userId, account);
      throw new AppError("Reconnect this Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");
    }
  }
}
