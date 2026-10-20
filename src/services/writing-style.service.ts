import { generateJson } from "../lib/ai";
import { consumeAiQuota } from "../lib/ai-quota";
import { buildStylePrompt, STYLE_SYSTEM_PROMPT, styleResultSchema } from "../lib/drafting/style-prompt";
import { AppError, NotFoundError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError } from "../lib/gmail/client";
import { fetchRecentSentBodies } from "../lib/gmail/sent";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import type { UpdateMailAccount } from "../schemas/mail-account";
import { MailAccountService } from "./mail-account.service";

const SENT_SAMPLE = 50;
const MIN_SAMPLES = 3;

const needsReauth = () => new AppError("Reconnect this Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");

export class WritingStyleService {
  private mailAccountRepo = new MailAccountRepository();
  private mailAccountService = new MailAccountService();

  // Reads the last sent mail, keeps only the note. The bodies never leave this call.
  async learn(mailAccountId: string, userId: string) {
    try {
      const account = await this.mailAccountRepo.findById(mailAccountId, userId);
      if (!account) throw new NotFoundError("Mail account not found");
      if (account.status !== "ACTIVE") throw needsReauth();

      let bodies: string[];
      try {
        bodies = await fetchRecentSentBodies(await gmailFor(account), SENT_SAMPLE);
      } catch (error) {
        if (!(error instanceof GmailAccessRevokedError)) throw error;
        await this.mailAccountService.markNeedsReauth(userId, account);
        throw needsReauth();
      }

      if (bodies.length < MIN_SAMPLES) {
        throw new AppError(
          "Heed needs a few emails you've sent from this account to learn from. Write the note yourself instead.",
          400,
          "NOT_ENOUGH_SENT_MAIL",
        );
      }

      await consumeAiQuota(userId);
      const { result } = await generateJson({
        system: STYLE_SYSTEM_PROMPT,
        prompt: buildStylePrompt(bodies),
        schema: styleResultSchema,
        temperature: 0.2,
        maxTokens: 1200,
        reasoningEffort: "medium",
      });

      return await this.mailAccountRepo.updateSettings(mailAccountId, userId, {
        styleNote: result.styleNote,
        styleLearnedAt: new Date(),
      });
    } catch (error) {
      throw error;
    }
  }

  // The account's drafting settings: the style note and the instruction, either or both.
  async update(mailAccountId: string, userId: string, data: UpdateMailAccount) {
    try {
      const account = await this.mailAccountRepo.findById(mailAccountId, userId);
      if (!account) throw new NotFoundError("Mail account not found");

      return await this.mailAccountRepo.updateSettings(mailAccountId, userId, {
        ...(data.styleNote !== undefined && { styleNote: data.styleNote }),
        ...(data.styleNote === null && { styleLearnedAt: null }),
        ...(data.instruction !== undefined && { instruction: data.instruction }),
      });
    } catch (error) {
      throw error;
    }
  }
}
