import type { Prisma } from "../generated/prisma/client";
import { generateJson, streamText } from "../lib/ai";
import { consumeAiQuota } from "../lib/ai-quota";
import { resolveCitations, type AskCitation } from "../lib/ask/citations";
import {
  askAnswerSystemPrompt,
  askPlanSchema,
  askPlanSystemPrompt,
  buildAskAnswerPrompt,
  buildAskPlanPrompt,
  type AskContext,
  type AskTurn,
} from "../lib/ask/prompt";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError, isGmailNotFound } from "../lib/gmail/client";
import { fetchReadableMessage, type ReadableMessage } from "../lib/gmail/message";
import { searchMessageIds } from "../lib/gmail/search";
import { redis } from "../lib/redis-connection";
import { isValidTimeZone } from "../lib/timezone";
import { AskRepository } from "../repositories/ask.repository";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { UserRepository } from "../repositories/user.repository";
import type { AskQuestion } from "../schemas/ask";
import { MailAccountService } from "./mail-account.service";

const TITLE_CHARS = 80;
const HISTORY_TURNS = 6;
const RESULTS_PER_SEARCH = 10;
const MAX_SOURCES = 8;
const LOCK_TTL_SECONDS = 120;

const NOTHING_FOUND =
  "I couldn't find any emails about that. Try naming the sender, a word from the subject, or roughly when it arrived.";

const lockKey = (conversationId: string) => `ask-lock:${conversationId}`;

type SearchAccount = { id: string; email: string; refreshTokenEnc: string };
type Source = ReadableMessage & { n: number; account: SearchAccount };

export interface PreparedAnswer {
  conversationId: string;
  userId: string;
  question: string;
  history: AskTurn[];
  accounts: SearchAccount[];
  context: AskContext;
}

export interface AnswerEvents {
  onStatus: (status: { stage: "searching" } | { stage: "reading"; count: number }) => void;
  onChunk: (chunk: string) => void;
}

const titleFor = (question: string) =>
  question.length > TITLE_CHARS ? `${question.slice(0, TITLE_CHARS - 1).trimEnd()}…` : question;

// Takes the best results of every search in every account in turn, so one busy inbox or
// one broad search cannot crowd out the rest.
const interleave = function <T>(lists: T[][], keyOf: (item: T) => string, max: number) {
  const seen = new Set<string>();
  const picked: T[] = [];
  const longest = Math.max(0, ...lists.map(list => list.length));

  for (let rank = 0; rank < longest && picked.length < max; rank++) {
    for (const list of lists) {
      const item = list[rank];
      if (!item || seen.has(keyOf(item))) continue;
      seen.add(keyOf(item));
      picked.push(item);
      if (picked.length === max) break;
    }
  }
  return picked;
};

// Read-only by construction: the only Gmail calls here are search and read, and neither model
// call has a tool. The answer can only ever be text.
export class AskService {
  private askRepo = new AskRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private mailAccountService = new MailAccountService();
  private userRepo = new UserRepository();

  async getConversations(userId: string) {
    try {
      return await this.askRepo.findManyByUser(userId);
    } catch (error) {
      throw error;
    }
  }

  async getConversation(id: string, userId: string) {
    try {
      const conversation = await this.askRepo.findById(id, userId);
      if (!conversation) throw new NotFoundError("Conversation not found");
      return conversation;
    } catch (error) {
      throw error;
    }
  }

  async startConversation(userId: string, data: AskQuestion) {
    try {
      return await this.askRepo.create(userId, titleFor(data.question), data.question);
    } catch (error) {
      throw error;
    }
  }

  async addQuestion(id: string, userId: string, data: AskQuestion) {
    try {
      await this.getConversation(id, userId);
      return await this.askRepo.addMessage(id, userId, { role: "USER", content: data.question });
    } catch (error) {
      throw error;
    }
  }

  async deleteConversation(id: string, userId: string) {
    try {
      const { count } = await this.askRepo.delete(id, userId);
      if (count === 0) throw new NotFoundError("Conversation not found");
    } catch (error) {
      throw error;
    }
  }

  // Every refusal happens here, before the stream opens, so it keeps its real status code.
  // On success the caller holds the conversation's lock and must call releaseAnswer.
  async prepareAnswer(id: string, userId: string): Promise<PreparedAnswer> {
    try {
      const conversation = await this.getConversation(id, userId);
      const last = conversation.messages.at(-1);
      if (!last || last.role !== "USER") {
        throw new AppError("There is no question waiting for an answer", 409, "ASK_NOTHING_TO_ANSWER");
      }

      const allAccounts = await this.mailAccountRepo.findManyByUser(userId);
      if (allAccounts.length === 0) {
        throw new AppError("Connect a Gmail account first, so Heed has mail to read.", 400, "NO_MAIL_ACCOUNTS");
      }
      const accounts = allAccounts.filter(account => account.status === "ACTIVE");
      if (accounts.length === 0) {
        throw new AppError("Reconnect your Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");
      }

      const acquired = await redis.set(lockKey(id), "1", "EX", LOCK_TTL_SECONDS, "NX");
      if (!acquired) throw new ConflictError("Heed is already answering this question");

      try {
        await consumeAiQuota(userId);
      } catch (error) {
        await this.releaseAnswer(id);
        throw error;
      }

      const user = await this.userRepo.findNameAndTimezone(userId);
      const timezone = user?.settings?.timezone;
      const name = [user?.first_name, user?.last_name].filter(Boolean).join(" ");

      return {
        conversationId: id,
        userId,
        question: last.content,
        history: conversation.messages
          .slice(0, -1)
          .slice(-HISTORY_TURNS)
          .map(message => ({ role: message.role, content: message.content })),
        accounts,
        context: {
          userName: name || null,
          timezone: timezone && isValidTimeZone(timezone) ? timezone : "UTC",
          accountEmails: accounts.map(account => account.email),
          now: new Date(),
        },
      };
    } catch (error) {
      throw error;
    }
  }

  async releaseAnswer(id: string) {
    await redis.del(lockKey(id)).catch(() => {});
  }

  // Plans the searches, reads the top results, streams the answer and saves it with its citations.
  async answer(prepared: PreparedAnswer, events: AnswerEvents) {
    try {
      const { question, history, context } = prepared;

      events.onStatus({ stage: "searching" });
      const { result: plan } = await generateJson({
        system: askPlanSystemPrompt(context),
        prompt: buildAskPlanPrompt(question, history),
        schema: askPlanSchema,
        temperature: 0,
        maxTokens: 600,
        reasoningEffort: "low",
      });

      const sources = await this.findSources(prepared, plan.searches);
      events.onStatus({ stage: "reading", count: sources.length });

      if (sources.length === 0) {
        events.onChunk(NOTHING_FOUND);
        return await this.saveAnswer(prepared, NOTHING_FOUND, []);
      }

      const { text } = await streamText({
        system: askAnswerSystemPrompt(context),
        prompt: buildAskAnswerPrompt(
          question,
          history,
          sources.map(source => ({ ...source, accountEmail: source.account.email })),
          context.timezone,
        ),
        temperature: 0.2,
        maxTokens: 1500,
        reasoningEffort: "medium",
        onChunk: events.onChunk,
      });

      return await this.saveAnswer(prepared, text, sources);
    } catch (error) {
      throw error;
    }
  }


  private async findSources(prepared: PreparedAnswer, searches: string[]): Promise<Source[]> {
    const perAccount = await Promise.all(
      prepared.accounts.map(account => this.searchAccount(prepared.userId, account, searches)),
    );
    if (perAccount.every(result => result === null)) {
      throw new AppError("Heed couldn't reach Gmail. Try again in a moment.", 502, "GMAIL_UNAVAILABLE");
    }

    const lists = perAccount.flatMap(result => result ?? []);
    const picked = interleave(lists, hit => `${hit.account.id}:${hit.id}`, MAX_SOURCES);

    const read = await Promise.all(
      picked.map(async hit => {
        try {
          const message = await fetchReadableMessage(hit.client, hit.id);
          return { ...message, account: hit.account };
        } catch (error) {
          if (!isGmailNotFound(error)) console.error(`[ask] could not read message ${hit.id}:`, (error as Error).message);
          return null;
        }
      }),
    );

    return read
      .filter(message => message !== null)
      .sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime())
      .map((message, index) => ({ ...message, n: index + 1 }));
  }

  // Null when this account could not be searched at all; the others still answer.
  private async searchAccount(userId: string, account: SearchAccount, searches: string[]) {
    try {
      const client = await gmailFor(account);
      const lists = await Promise.all(searches.map(q => searchMessageIds(client, q, RESULTS_PER_SEARCH)));
      return lists.map(ids => ids.map(id => ({ id, client, account })));
    } catch (error) {
      if (error instanceof GmailAccessRevokedError) {
        await this.mailAccountService.markNeedsReauth(userId, account).catch(() => {});
      } else {
        console.error(`[ask] search failed for account ${account.id}:`, (error as Error).message);
      }
      return null;
    }
  }

  private async saveAnswer(prepared: PreparedAnswer, text: string, sources: Source[]) {
    const { content, cited } = resolveCitations(text, sources);
    const citations = await this.toCitations(prepared.userId, cited);

    const conversation = await this.askRepo.addMessage(prepared.conversationId, prepared.userId, {
      role: "ASSISTANT",
      content: content || NOTHING_FOUND,
      citations: citations as unknown as Prisma.InputJsonValue,
    });
    return conversation.messages.at(-1)!;
  }

  // Mail Heed already knows opens in the app; anything else opens in Gmail.
  private async toCitations(userId: string, cited: Source[]): Promise<AskCitation[]> {
    const byAccount = new Map<string, string[]>();
    for (const source of cited) {
      byAccount.set(source.account.id, [...(byAccount.get(source.account.id) ?? []), source.gmailMessageId]);
    }
    const known = new Map<string, string>();
    for (const [accountId, ids] of byAccount) {
      const rows = await this.emailMessageRepo.findIdsByGmailIds(accountId, userId, ids);
      for (const [gmailId, id] of rows) known.set(`${accountId}:${gmailId}`, id);
    }

    return cited.map(source => ({
      n: source.n,
      emailMessageId: known.get(`${source.account.id}:${source.gmailMessageId}`) ?? null,
      mailAccountId: source.account.id,
      accountEmail: source.account.email,
      gmailMessageId: source.gmailMessageId,
      fromName: source.fromName,
      fromEmail: source.fromEmail,
      subject: source.subject,
      receivedAt: source.receivedAt.toISOString(),
    }));
  }
}
