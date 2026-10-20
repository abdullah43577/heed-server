import crypto from "crypto";
import { type Request, type Response } from "express";
import { UnauthorizedError } from "../lib/errors";
import { getEnv } from "../lib/get-env";
import { handleErrors } from "../lib/handle-errors";
import { BacklogWorkerService } from "../services/backlog-worker.service";
import { DailyReportService } from "../services/daily-report.service";
import { MailSyncService } from "../services/mail-sync.service";

// Hash both sides first: timingSafeEqual throws on a length mismatch.
const matchesSecret = function (provided: string, expected: string) {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();

  return crypto.timingSafeEqual(a, b);
};

const assertCronSecret = function (req: Request) {
  const secret = getEnv("CRON_SECRET");

  // No secret configured keeps the endpoint shut rather than open.
  if (!secret) throw new UnauthorizedError("Maintenance endpoints are disabled");

  const provided = req.headers.authorization?.replace(/^Bearer /, "");
  if (!provided || !matchesSecret(provided, secret)) {
    throw new UnauthorizedError("Invalid maintenance credentials");
  }
};

export class MaintenanceController {
  private mailSyncService = new MailSyncService();
  private dailyReportService = new DailyReportService();
  private backlogWorker = new BacklogWorkerService();

  async runBacklogStep(req: Request, res: Response) {
    try {
      assertCronSecret(req);

      const result = await this.backlogWorker.advance();
      res.status(200).json({ message: "Backlog step finished", data: result });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  // For hosts that sleep when idle: the call wakes the server and starts one sync pass.
  // It answers before the pass ends, because triage can outlast a cron service's timeout.
  async runMailSync(req: Request, res: Response) {
    try {
      assertCronSecret(req);

      this.mailSyncService
        .syncAllAccounts()
        .catch(error => console.error("Mail sync from cron failed:", error));

      res.status(202).json({ message: "Mail sync started" });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async runReportSweep(req: Request, res: Response) {
    try {
      assertCronSecret(req);

      const result = await this.dailyReportService.sweep();
      res.status(200).json({ message: "Report sweep finished", data: result });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async runRetention(req: Request, res: Response) {
    try {
      assertCronSecret(req);

      const result = await this.dailyReportService.applyRetention();
      res.status(200).json({ message: "Retention finished", data: result });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
