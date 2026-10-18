import type { gmail_v1 } from "@googleapis/gmail";
import type { EmailAction, EmailMessage, SenderRule } from "../generated/prisma/client";
import { generateJson } from "../lib/ai";
import { consumeTriageQuota } from "../lib/ai-quota";
import { AiQuotaExceededError } from "../lib/errors";
import { isGmailNotFound } from "../lib/gmail/client";
import { ensureHeedLabels } from "../lib/gmail/labels";
import { fetchFullMessage, modifyLabels, type FullMessage } from "../lib/gmail/message";
import { buildTriagePrompt, TRIAGE_SYSTEM_PROMPT, triageResultSchema } from "../lib/triage/prompt";
import { headerCategory, isAddressedDirectly, isBulkSender, matchesSenderPattern } from "../lib/triage/rules";
import { EmailMessageRepository, type TriageOutcome } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { SenderRuleRepository } from "../repositories/sender-rule.repository";

const BATCH_SIZE = 15;
const MAX_ATTEMPTS = 3;
const CONFIDENCE_FLOOR = 0.7;

export interface TriageAccount {
  id: string;
  userId: string;
  email: string;
  handledLabelId: string | null;
  replyLabelId: string | null;
}

interface HeedLabels {
  handledLabelId: string;
  replyLabelId: string;
}

type Decision = Omit<TriageOutcome, "action">;

export class TriageService {
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private senderRuleRepo = new SenderRuleRepository();

  async triagePending(client: gmail_v1.Gmail, account: TriageAccount) {
    try {
      const pending = await this.emailMessageRepo.findPendingTriage(account.id, account.userId, BATCH_SIZE);
      if (pending.length === 0) return 0;

      const labels = await this.ensureLabels(client, account);
      const rules = await this.senderRuleRepo.findManyByUser(account.userId);
      let triaged = 0;

      for (const message of pending) {
        try {
          if (await this.triageOne(client, account, labels, rules, message)) triaged += 1;
        } catch (error) {
          if (isGmailNotFound(error)) {
            await this.emailMessageRepo.delete(message.id, account.userId);
            continue;
          }
          console.error(`[triage] ${message.id} failed:`, (error as Error).message);
          await this.recordFailure(message, account, "Heed couldn't finish reading this one");
        }
      }

      return triaged;
    } catch (error) {
      throw error;
    }
  }

  private async triageOne(
    client: gmail_v1.Gmail,
    account: TriageAccount,
    labels: HeedLabels,
    rules: SenderRule[],
    message: EmailMessage,
  ) {
    const full = await fetchFullMessage(client, message.gmailMessageId);
    const decision = await this.decide(account, message, full);
    if (!decision) return false;

    const alwaysLeave = rules.some(
      rule => rule.kind === "ALWAYS_LEAVE" && matchesSenderPattern(rule.pattern, message.fromEmail),
    );
    const action = await this.apply(client, labels, message, decision, {
      stillUnread: full.labels.includes("UNREAD"),
      alwaysLeave,
    });

    await this.emailMessageRepo.applyTriage(message.id, account.userId, { ...decision, action });
    return true;
  }

  // Null means "try again on the next pass": the AI was unreachable and attempts remain.
  private async decide(account: TriageAccount, message: EmailMessage, full: FullMessage): Promise<Decision | null> {
    const fromHeaders = headerCategory(full);
    if (fromHeaders) {
      return { category: fromHeaders, decidedBy: "HEADER", summary: null, reason: "Gmail filed it under Promotions" };
    }

    const bulkSender = isBulkSender(message.fromEmail, full);

    try {
      await consumeTriageQuota(account.id);

      const { result } = await generateJson({
        system: TRIAGE_SYSTEM_PROMPT,
        prompt: buildTriagePrompt({
          accountEmail: account.email,
          addressedDirectly: isAddressedDirectly(account.email, full),
          bulkSender,
          fromName: message.fromName,
          fromEmail: message.fromEmail,
          subject: message.subject,
          date: full.date,
          bodyText: full.bodyText,
        }),
        schema: triageResultSchema,
        temperature: 0,
        maxTokens: 600,
        reasoningEffort: "low",
      });

      if (result.confidence < CONFIDENCE_FLOOR) {
        return { category: "UNSURE", decidedBy: "AI", summary: result.summary, reason: `Not sure: ${result.reason}` };
      }

      // A bulk or no-reply sender is never a person waiting on an answer.
      const category = bulkSender && result.category === "NEEDS_REPLY" ? "IMPORTANT" : result.category;
      return { category, decidedBy: "AI", summary: result.summary, reason: result.reason };
    } catch (error) {
      if (error instanceof AiQuotaExceededError) {
        return { category: "UNSURE", decidedBy: "FALLBACK", summary: null, reason: "Today's reading limit was reached" };
      }
      if (message.triageAttempts + 1 < MAX_ATTEMPTS) {
        await this.emailMessageRepo.incrementTriageAttempts(message.id, account.userId);
        return null;
      }
      return { category: "UNSURE", decidedBy: "FALLBACK", summary: null, reason: "Heed couldn't reach its AI" };
    }
  }

  private async apply(
    client: gmail_v1.Gmail,
    labels: HeedLabels,
    message: EmailMessage,
    decision: Decision,
    context: { stillUnread: boolean; alwaysLeave: boolean },
  ): Promise<EmailAction> {
    if (decision.category === "NEEDS_REPLY") {
      await modifyLabels(client, message.gmailMessageId, { add: [labels.replyLabelId] });
      return "AWAITING_REPLY";
    }

    if (decision.category === "UNSURE" || context.alwaysLeave || !context.stillUnread) return "LEFT_UNREAD";

    await modifyLabels(client, message.gmailMessageId, { add: [labels.handledLabelId], remove: ["UNREAD"] });
    return "MARKED_READ";
  }

  private async recordFailure(message: EmailMessage, account: TriageAccount, reason: string) {
    if (message.triageAttempts + 1 < MAX_ATTEMPTS) {
      await this.emailMessageRepo.incrementTriageAttempts(message.id, account.userId);
      return;
    }
    await this.emailMessageRepo.applyTriage(message.id, account.userId, {
      category: "UNSURE",
      action: "LEFT_UNREAD",
      decidedBy: "FALLBACK",
      summary: null,
      reason,
    });
  }

  private async ensureLabels(client: gmail_v1.Gmail, account: TriageAccount): Promise<HeedLabels> {
    if (account.handledLabelId && account.replyLabelId) {
      return { handledLabelId: account.handledLabelId, replyLabelId: account.replyLabelId };
    }

    const labels = await ensureHeedLabels(client);
    await this.mailAccountRepo.updateLabels(account.id, account.userId, labels);
    return labels;
  }
}
