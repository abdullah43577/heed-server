import { DailyReportService } from "../services/daily-report.service";
import { MailSyncService } from "../services/mail-sync.service";
import { getEnv } from "./get-env";

const SYNC_INTERVAL_MS = 60_000;
const REPORT_INTERVAL_MS = 15 * 60_000;
const RETENTION_INTERVAL_MS = 6 * 60 * 60_000;

const mailSyncService = new MailSyncService();
const dailyReportService = new DailyReportService();

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

const runRetention = singleFlight("Retention", async () => {
  const { messages, reports } = await dailyReportService.applyRetention();
  return messages > 0 || reports > 0 ? `🧹 Retention: ${messages} messages, ${reports} reports deleted` : null;
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
  runReports();
  runRetention();
  console.log("⏱️  Mail sync every 60s, daily reports every 15 min, retention every 6h");
};
