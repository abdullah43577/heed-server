import { BacklogWorkerService } from "../services/backlog-worker.service";
import { BacklogService } from "../services/backlog.service";
import { DailyReportService } from "../services/daily-report.service";
import { MailSyncService } from "../services/mail-sync.service";
import { ReplyWorkerService } from "../services/reply-worker.service";
import { getEnv } from "./get-env";

const SYNC_INTERVAL_MS = 60_000;
const REPORT_INTERVAL_MS = 15 * 60_000;
// Each tick spends at most one AI call on the backlog: about 3 a minute, inside Groq's free per-minute token cap.
const BACKLOG_INTERVAL_MS = 20_000;
const RETENTION_INTERVAL_MS = 6 * 60 * 60_000;
const DRAFT_INTERVAL_MS = 30_000;
// Sends land within a couple of seconds of the 5-second undo window closing.
const SEND_INTERVAL_MS = 2_000;

const mailSyncService = new MailSyncService();
const dailyReportService = new DailyReportService();
const backlogWorker = new BacklogWorkerService();
const backlogService = new BacklogService();
const replyWorker = new ReplyWorkerService();

// A pass still running when the next tick comes is not doubled up.
const singleFlight = function (name: string, task: () => Promise<string | null>) {
  let isRunning = false;

  return async function () {
    if (isRunning) return;
    isRunning = true;

    try {
      const summary = await task();
      if (summary) console.log(summary);
    } catch (error) {
      console.error(`${name} failed:`, error);
    } finally {
      isRunning = false;
    }
  };
};

const runSync = singleFlight("Mail sync", async () => {
  const { added, failed } = await mailSyncService.syncAllAccounts();
  return added > 0 || failed > 0 ? `📬 Mail sync: ${added} new, ${failed} accounts failed` : null;
});

const runReports = singleFlight("Report sweep", async () => {
  const { created } = await dailyReportService.sweep();
  return created > 0 ? `🗞️  Daily reports: ${created} created` : null;
});

const runBacklog = singleFlight("Backlog", async () => {
  const { scanned, sorted } = await backlogWorker.advance();
  return scanned > 0 || sorted > 0 ? `🗂️  Backlog: ${scanned} scanned, ${sorted} sorted` : null;
});

const runDrafts = singleFlight("Drafts", async () => {
  const { recovered, drafted, notified } = await replyWorker.draftTick();
  return recovered > 0 || drafted > 0 || notified > 0
    ? `✍️  Drafts: ${drafted} drafted, ${notified} pushes, ${recovered} stuck sends failed`
    : null;
});

const runSends = singleFlight("Sends", async () => {
  const sent = await replyWorker.sendDue();
  return sent > 0 ? `📤 Sent ${sent} replies` : null;
});

const runRetention = singleFlight("Retention", async () => {
  const { messages, reports } = await dailyReportService.applyRetention();
  const { expired } = await backlogService.expireStale();
  return messages > 0 || reports > 0 || expired > 0
    ? `🧹 Retention: ${messages} messages, ${reports} reports, ${expired} stale backlog runs`
    : null;
});

// Only ticks while the process is awake; a host that sleeps needs the /v1/maintenance endpoints called by a platform cron.
export const startScheduler = function () {
  if (getEnv("DISABLE_SCHEDULER") === "true") {
    console.log("⏱️  Scheduler disabled by DISABLE_SCHEDULER");
    return;
  }

  setInterval(runSync, SYNC_INTERVAL_MS);
  setInterval(runReports, REPORT_INTERVAL_MS);
  setInterval(runRetention, RETENTION_INTERVAL_MS);
  setInterval(runBacklog, BACKLOG_INTERVAL_MS);
  setInterval(runDrafts, DRAFT_INTERVAL_MS);
  setInterval(runSends, SEND_INTERVAL_MS);
  runReports();
  runRetention();
  console.log("⏱️  Mail sync every 60s, sends every 2s, drafts every 30s, backlog every 20s, reports every 15 min, retention every 6h");
};
