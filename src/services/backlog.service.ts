import { computeBacklogCounts, hasNothingToApply, type BacklogCounts } from "../lib/backlog/summary";
import { AppError, ConflictError, NotFoundError } from "../lib/errors";
import { gmailFor, GmailAccessRevokedError } from "../lib/gmail/client";
import { ensureHeedLabels } from "../lib/gmail/labels";
import { batchModifyLabels } from "../lib/gmail/message";
import { resolveSenderRules } from "../lib/triage/rules";
import { BacklogRunRepository } from "../repositories/backlog-run.repository";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { SenderRuleRepository } from "../repositories/sender-rule.repository";
import type { StartBacklogRun } from "../schemas/backlog-run";
import { BacklogWorkerService } from "./backlog-worker.service";
import { MailAccountService } from "./mail-account.service";

const READY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const APPLY_CHUNK = 1000;

const needsReauth = () => new AppError("Reconnect this Gmail account first", 409, "ACCOUNT_NEEDS_REAUTH");

export class BacklogService {
  private backlogRunRepo = new BacklogRunRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private mailAccountRepo = new MailAccountRepository();
  private senderRuleRepo = new SenderRuleRepository();
  private mailAccountService = new MailAccountService();
  private worker = new BacklogWorkerService();

  async start(userId: string, data: StartBacklogRun) {
    try {
      const account = await this.mailAccountRepo.findById(data.mailAccountId, userId);
      if (!account) throw new NotFoundError("Mail account not found");
      if (account.status !== "ACTIVE") throw needsReauth();

      const active = await this.backlogRunRepo.findActiveForAccount(account.id, userId);
      if (active && !(await this.settleIfNothingToApply(active))) throw new AppError("A tidy is already running for this account", 409, "BACKLOG_IN_PROGRESS");

      const run = await this.backlogRunRepo.create({ userId, mailAccountId: account.id, windowDays: data.windowDays });

      this.worker.scanNow(run.id, userId).catch(error => console.error("[backlog] first scan failed:", error));
      return run;
    } catch (error) {
      throw error;
    }
  }

  async getRuns(userId: string, mailAccountId?: string) {
    try {
      return await this.backlogRunRepo.findManyByUser(userId, mailAccountId);
    } catch (error) {
      throw error;
    }
  }

  // Counts are worked out from the rows on every read, so a "No reply needed" since shows straight away.
  async getRun(id: string, userId: string) {
    try {
      const found = await this.backlogRunRepo.findById(id, userId);
      if (!found) throw new NotFoundError("Backlog run not found");

      const rows = await this.emailMessageRepo.countForRun(id, userId);
      const summary = computeBacklogCounts(rows);
      const run = (await this.settleIfNothingToApply(found, summary)) ?? found;

      const showLists = run.status === "READY" || run.status === "DONE";
      const [mightNeedReply, leftForYou] = await Promise.all([
        showLists
          ? this.emailMessageRepo.findForRun(id, userId, { category: "NEEDS_REPLY", action: { not: "MARKED_READ" } })
          : [],
        showLists ? this.emailMessageRepo.findForRun(id, userId, { category: "UNSURE" }) : [],
      ]);

      return { ...run, summary, mightNeedReply, leftForYou };
    } catch (error) {
      throw error;
    }
  }

  // Runs that went READY with nothing to confirm, before the worker finished those as DONE, are settled on sight.
  private async settleIfNothingToApply(run: { id: string; userId: string; status: string }, summary?: BacklogCounts) {
    if (run.status !== "READY") return null;
    const counts = summary ?? computeBacklogCounts(await this.emailMessageRepo.countForRun(run.id, run.userId));
    if (!hasNothingToApply(counts)) return null;

    const settled = await this.backlogRunRepo.transition(run.id, run.userId, ["READY"], {
      status: "DONE",
      finishedAt: new Date(),
      markedRead: 0,
    });
    return settled ? await this.backlogRunRepo.findById(run.id, run.userId) : null;
  }

  async apply(id: string, userId: string) {
    try {
      const run = await this.backlogRunRepo.findById(id, userId);
      if (!run) throw new NotFoundError("Backlog run not found");
      if (run.status !== "READY") throw new ConflictError("This tidy isn't ready to apply");

      const account = await this.mailAccountRepo.findById(run.mailAccountId, userId);
      if (!account || account.status !== "ACTIVE") throw needsReauth();

      const claimed = await this.backlogRunRepo.transition(id, userId, ["READY"], { status: "APPLYING" });
      if (!claimed) throw new ConflictError("This tidy is already being applied");

      try {
        // A "leave it" rule made after sorting still wins.
        const rules = await this.senderRuleRepo.findManyByUser(userId);
        const pending = await this.emailMessageRepo.findPendingConfirm(id, userId);
        const isLeft = (fromEmail: string) => resolveSenderRules(rules, fromEmail, run.mailAccountId).read === "LEAVE";

        const left = pending.filter(message => isLeft(message.fromEmail));
        const toRead = pending.filter(message => !isLeft(message.fromEmail));
        if (left.length) await this.emailMessageRepo.setActionMany(left.map(message => message.id), userId, "LEFT_UNREAD");

        const client = await gmailFor(account);
        let handledLabelId = account.handledLabelId;
        if (!handledLabelId) {
          const labels = await ensureHeedLabels(client);
          await this.mailAccountRepo.updateLabels(account.id, userId, labels);
          handledLabelId = labels.handledLabelId;
        }

        // Rows are updated chunk by chunk after Gmail accepts it, so a failure part-way leaves the rest to retry.
        for (let index = 0; index < toRead.length; index += APPLY_CHUNK) {
          const chunk = toRead.slice(index, index + APPLY_CHUNK);
          await batchModifyLabels(
            client,
            chunk.map(message => message.gmailMessageId),
            { add: [handledLabelId], remove: ["UNREAD"] },
          );
          await this.emailMessageRepo.setActionMany(chunk.map(message => message.id), userId, "MARKED_READ");
        }

        await this.backlogRunRepo.transition(id, userId, ["APPLYING"], {
          status: "DONE",
          markedRead: toRead.length,
          finishedAt: new Date(),
        });
      } catch (error) {
        await this.backlogRunRepo.transition(id, userId, ["APPLYING"], { status: "READY" });
        if (error instanceof GmailAccessRevokedError) {
          await this.mailAccountService.markNeedsReauth(userId, account);
          throw needsReauth();
        }
        throw error;
      }

      return await this.getRun(id, userId);
    } catch (error) {
      throw error;
    }
  }

  async cancel(id: string, userId: string) {
    try {
      const run = await this.backlogRunRepo.findById(id, userId);
      if (!run) throw new NotFoundError("Backlog run not found");

      const cancelled = await this.backlogRunRepo.transition(id, userId, ["SCANNING", "SORTING", "READY"], {
        status: "CANCELLED",
        finishedAt: new Date(),
      });
      if (!cancelled) throw new ConflictError("This tidy can't be cancelled now");

      await this.emailMessageRepo.deleteUnresolvedForRun(id, userId);
      return await this.getRun(id, userId);
    } catch (error) {
      throw error;
    }
  }

  // A summary nobody confirmed within a week is dropped; Gmail was never touched.
  async expireStale(now = new Date()) {
    const stale = await this.backlogRunRepo.findReadyBefore(new Date(now.getTime() - READY_TTL_MS));

    for (const run of stale) {
      const moved = await this.backlogRunRepo.transition(run.id, run.userId, ["READY"], {
        status: "CANCELLED",
        finishedAt: now,
      });
      if (moved) await this.emailMessageRepo.deleteUnresolvedForRun(run.id, run.userId);
    }

    return { expired: stale.length };
  }
}
