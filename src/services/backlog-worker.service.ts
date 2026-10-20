import type { gmail_v1 } from "@googleapis/gmail";
import type { BacklogRun, EmailCategory, EmailMessage, SenderRule } from "../generated/prisma/client";
import { generateJson } from "../lib/ai";
import { backlogReadyPush, computeBacklogCounts } from "../lib/backlog/summary";
import { gmailFor, GmailAccessRevokedError, isGmailNotFound } from "../lib/gmail/client";
import { listUnreadInboxPage } from "../lib/gmail/history";
import { fetchIncomingMessage, fetchMessagePreview, type IncomingMessage, type MessagePreview } from "../lib/gmail/message";
import { redis } from "../lib/redis-connection";
import {
  BATCH_SYSTEM_PROMPT,
  batchItemSchema,
  batchResultSchema,
  buildBatchPrompt,
  type BatchItem,
} from "../lib/triage/batch-prompt";
import { backlogHeaderCategory, isAddressedDirectly, isBulkSender, matchesSenderPattern } from "../lib/triage/rules";
import { BacklogRunRepository } from "../repositories/backlog-run.repository";
import { EmailMessageRepository, type TriageOutcome } from "../repositories/email-message.repository";
import { SenderRuleRepository } from "../repositories/sender-rule.repository";
import { MailAccountService } from "./mail-account.service";
import { NotificationService } from "./notification.service";

export const MAX_RUN_MESSAGES = 5000;
export const MAX_RUN_AI_CALLS = 600;

const SORT_BATCH_SIZE = 10;
const FETCH_CONCURRENCY = 10;
const MAX_ATTEMPTS = 3;
const CONFIDENCE_FLOOR = 0.7;
const LOCK_TTL_SECONDS = 120;
const HANDLED: EmailCategory[] = ["IMPORTANT", "ROUTINE", "NEWSLETTER", "PROMOTION"];

const lockKey = (runId: string) => `backlog-lock:${runId}`;

type WorkerRun = BacklogRun & {
  mailAccount: { id: string; userId: string; email: string; status: string; refreshTokenEnc: string };
};

type Decision = Omit<TriageOutcome, "action">;

class RunMovedOnError extends Error {}

const settleInChunks = async function <T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results: PromiseSettledResult<R>[] = [];
  for (let index = 0; index < items.length; index += size) {
    results.push(...(await Promise.allSettled(items.slice(index, index + size).map(work))));
  }
  return results;
};

export class BacklogWorkerService {
  private backlogRunRepo = new BacklogRunRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private senderRuleRepo = new SenderRuleRepository();
  private mailAccountService = new MailAccountService();
  private notificationService = new NotificationService();

  // One tick: every scanning run reads a page; one sorting run (the one waiting longest) spends one AI call.
  // The single AI call per tick is the throttle that keeps runs inside the provider's per-minute limits.
  async advance() {
    const runs = await this.backlogRunRepo.findAdvanceable();
    let scanned = 0;
    let sorted = 0;

    for (const run of runs.filter(candidate => candidate.status === "SCANNING")) {
      scanned += await this.withRun(run, client => this.scanStep(client, run));
    }

    const next = runs.find(candidate => candidate.status === "SORTING");
    if (next) sorted += await this.withRun(next, client => this.sortStep(client, next));

    return { runs: runs.length, scanned, sorted };
  }

  async scanNow(runId: string, userId: string) {
    const run = (await this.backlogRunRepo.findAdvanceable()).find(
      candidate => candidate.id === runId && candidate.userId === userId,
    );
    if (run?.status === "SCANNING") await this.withRun(run, client => this.scanStep(client, run));
  }

  private async withRun(run: WorkerRun, step: (client: gmail_v1.Gmail) => Promise<number>) {
    const acquired = await redis.set(lockKey(run.id), "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (!acquired) return 0;

    try {
      if (run.mailAccount.status !== "ACTIVE") {
        await this.fail(run);
        return 0;
      }
      return await step(await gmailFor(run.mailAccount));
    } catch (error) {
      if (error instanceof RunMovedOnError) {
        await this.emailMessageRepo.deleteUnresolvedForRun(run.id, run.userId);
        return 0;
      }
      if (error instanceof GmailAccessRevokedError) {
        await this.mailAccountService.markNeedsReauth(run.userId, run.mailAccount);
        await this.fail(run);
        return 0;
      }
      console.error(`[backlog] ${run.id} step failed:`, (error as Error).message);
      return 0;
    } finally {
      await redis.del(lockKey(run.id));
    }
  }

  private async scanStep(client: gmail_v1.Gmail, run: WorkerRun) {
    const { ids, nextPageToken } = await listUnreadInboxPage(client, run.windowDays, run.pageToken ?? undefined);

    const known = ids.length
      ? await this.emailMessageRepo.findExistingGmailIds(run.mailAccountId, run.userId, ids)
      : new Set<string>();
    const room = MAX_RUN_MESSAGES - run.total;
    const fresh = ids.filter(id => !known.has(id));
    const unseen = fresh.slice(0, room);
    const truncated = fresh.length > room || (!!nextPageToken && unseen.length === room);

    const results = await settleInChunks(unseen, FETCH_CONCURRENCY, id => fetchIncomingMessage(client, id));
    const incoming: IncomingMessage[] = [];
    let retryLater: unknown = null;

    for (const result of results) {
      if (result.status === "fulfilled") {
        if (result.value) incoming.push(result.value);
      } else if (!isGmailNotFound(result.reason)) {
        retryLater = result.reason;
      }
    }

    const { count } = incoming.length
      ? await this.emailMessageRepo.createMany(
          incoming.map(message => ({
            ...message,
            userId: run.userId,
            mailAccountId: run.mailAccountId,
            backlogRunId: run.id,
          })),
        )
      : { count: 0 };

    // The page cursor stays put, so the next tick re-reads this page; what was stored is skipped.
    if (retryLater) {
      await this.move(run, ["SCANNING"], { total: { increment: count } });
      throw retryLater;
    }

    const finished = !nextPageToken || truncated;
    await this.move(run, ["SCANNING"], {
      total: { increment: count },
      pageToken: finished ? null : nextPageToken,
      ...(finished && { status: "SORTING" }),
      ...(truncated && { truncated: true }),
    });

    return count;
  }

  private async sortStep(client: gmail_v1.Gmail, run: WorkerRun) {
    if (run.aiCalls >= MAX_RUN_AI_CALLS) {
      await this.emailMessageRepo.markUnsortedUnsure(run.id, run.userId, "Heed stopped short: the run hit its size limit");
      await this.move(run, ["SORTING"], { truncated: true });
      await this.finishSorting(run);
      return 0;
    }

    const batch = await this.emailMessageRepo.findUnsortedForRun(run.id, run.userId, SORT_BATCH_SIZE);
    if (batch.length === 0) {
      await this.finishSorting(run);
      return 0;
    }

    const rules = await this.senderRuleRepo.findManyByUser(run.userId);
    const previews = await settleInChunks(batch, FETCH_CONCURRENCY, message =>
      fetchMessagePreview(client, message.gmailMessageId),
    );

    const ready: { message: EmailMessage; preview: MessagePreview }[] = [];
    let removed = 0;
    let settled = 0;

    for (const [index, result] of previews.entries()) {
      const message = batch[index]!;
      if (result.status === "fulfilled") {
        ready.push({ message, preview: result.value });
      } else if (isGmailNotFound(result.reason)) {
        await this.emailMessageRepo.delete(message.id, run.userId);
        removed += 1;
      } else if (await this.recordFailure(message, run.userId, "Heed couldn't read this one")) {
        settled += 1;
      }
    }

    const byHeader = ready.filter(({ preview }) => backlogHeaderCategory(preview));
    const forAi = ready.filter(({ preview }) => !backlogHeaderCategory(preview));

    for (const { message, preview } of byHeader) {
      const category = backlogHeaderCategory(preview)!;
      const reason = category === "PROMOTION" ? "Gmail filed it under Promotions" : "Gmail filed it under Social";
      await this.record(message, preview, rules, run.userId, { category, decidedBy: "HEADER", summary: null, reason });
      settled += 1;
    }

    let aiCalls = 0;
    if (forAi.length > 0) {
      aiCalls = 1;
      const decisions = await this.classify(run.mailAccount.email, forAi);

      if (decisions) {
        for (const [index, { message, preview }] of forAi.entries()) {
          await this.record(message, preview, rules, run.userId, decisions[index]!);
          settled += 1;
        }
      } else {
        for (const { message } of forAi) {
          if (await this.recordFailure(message, run.userId, "Heed couldn't reach its AI")) settled += 1;
        }
      }
    }

    await this.move(run, ["SORTING"], {
      sorted: { increment: settled },
      total: { decrement: removed },
      aiCalls: { increment: aiCalls },
    });

    return settled;
  }

  // Null when the AI could not be reached: the batch is retried on a later tick.
  private async classify(accountEmail: string, items: { message: EmailMessage; preview: MessagePreview }[]) {
    const prompt = buildBatchPrompt(
      accountEmail,
      items.map(({ message, preview }, index) => ({
        id: String(index + 1),
        fromName: message.fromName,
        fromEmail: message.fromEmail,
        subject: message.subject,
        date: preview.date,
        addressedDirectly: isAddressedDirectly(accountEmail, preview),
        bulkSender: isBulkSender(message.fromEmail, preview),
        snippet: preview.snippet,
      })),
    );

    let answers: Map<string, BatchItem>;
    try {
      const { result } = await generateJson({
        system: BATCH_SYSTEM_PROMPT,
        prompt,
        schema: batchResultSchema,
        temperature: 0,
        maxTokens: 1800,
        reasoningEffort: "low",
      });

      answers = new Map(
        result.results.flatMap(raw => {
          const parsed = batchItemSchema.safeParse(raw);
          return parsed.success ? [[parsed.data.id, parsed.data] as const] : [];
        }),
      );
    } catch {
      return null;
    }

    return items.map(({ message, preview }, index): Decision => {
      const answer = answers.get(String(index + 1));
      if (!answer) {
        return { category: "UNSURE", decidedBy: "AI", summary: null, reason: "Heed couldn't sort this one from its preview" };
      }
      if (answer.confidence < CONFIDENCE_FLOOR) {
        return { category: "UNSURE", decidedBy: "AI", summary: answer.summary, reason: "Not sure from the preview alone" };
      }

      const bulkSender = isBulkSender(message.fromEmail, preview);
      const category = bulkSender && answer.category === "NEEDS_REPLY" ? "IMPORTANT" : answer.category;
      return { category, decidedBy: "AI", summary: answer.summary, reason: "Sorted from the subject and preview" };
    });
  }

  // Gmail is never touched here: a handled email only becomes PENDING_CONFIRM, and applying the run marks it read.
  private async record(
    message: EmailMessage,
    preview: MessagePreview,
    rules: SenderRule[],
    userId: string,
    decision: Decision,
  ) {
    const alwaysLeave = rules.some(
      rule => rule.kind === "ALWAYS_LEAVE" && matchesSenderPattern(rule.pattern, message.fromEmail),
    );
    const stillUnread = preview.labels.includes("UNREAD");
    const action = HANDLED.includes(decision.category) && stillUnread && !alwaysLeave ? "PENDING_CONFIRM" : "LEFT_UNREAD";

    await this.emailMessageRepo.applyTriage(message.id, userId, { ...decision, action });
  }

  // True when the message has run out of attempts and was settled as UNSURE.
  private async recordFailure(message: EmailMessage, userId: string, reason: string) {
    if (message.triageAttempts + 1 < MAX_ATTEMPTS) {
      await this.emailMessageRepo.incrementTriageAttempts(message.id, userId);
      return false;
    }
    await this.emailMessageRepo.applyTriage(message.id, userId, {
      category: "UNSURE",
      action: "LEFT_UNREAD",
      decidedBy: "FALLBACK",
      summary: null,
      reason,
    });
    return true;
  }

  private async finishSorting(run: WorkerRun) {
    const counts = computeBacklogCounts(await this.emailMessageRepo.countForRun(run.id, run.userId));
    await this.move(run, ["SORTING"], { status: "READY", readyAt: new Date(), counts: { ...counts } });

    await this.notificationService.notify({
      userId: run.userId,
      type: "BACKLOG_READY",
      ...backlogReadyPush(counts),
      entityType: "backlog-run",
      entityId: run.id,
    });
  }

  private async fail(run: WorkerRun) {
    await this.backlogRunRepo.transition(run.id, run.userId, ["SCANNING", "SORTING"], {
      status: "FAILED",
      finishedAt: new Date(),
    });
    await this.emailMessageRepo.deleteUnresolvedForRun(run.id, run.userId);
  }

  private async move(run: WorkerRun, from: BacklogRun["status"][], data: Parameters<BacklogRunRepository["transition"]>[3]) {
    const moved = await this.backlogRunRepo.transition(run.id, run.userId, from, data);
    if (!moved) throw new RunMovedOnError();
  }
}
