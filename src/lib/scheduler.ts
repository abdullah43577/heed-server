import { MailSyncService } from "../services/mail-sync.service";
import { getEnv } from "./get-env";

const SYNC_INTERVAL_MS = 60_000;

const mailSyncService = new MailSyncService();

let isSyncing = false;

const runSync = async function () {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const { added, failed } = await mailSyncService.syncAllAccounts();
    if (added > 0 || failed > 0) console.log(`📬 Mail sync: ${added} new, ${failed} accounts failed`);
  } catch (error) {
    console.error("Mail sync failed:", error);
  } finally {
    isSyncing = false;
  }
};

// Only ticks while the process is awake; a host that sleeps needs POST /v1/maintenance/sync from a platform cron.
export const startScheduler = function () {
  if (getEnv("DISABLE_SCHEDULER") === "true") {
    console.log("⏱️  Scheduler disabled by DISABLE_SCHEDULER");
    return;
  }

  setInterval(runSync, SYNC_INTERVAL_MS);
  console.log("⏱️  Mail sync every 60s");
};
