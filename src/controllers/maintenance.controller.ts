import crypto from "crypto";
import { type Request, type Response } from "express";
import { UnauthorizedError } from "../lib/errors";
import { getEnv } from "../lib/get-env";
import { handleErrors } from "../lib/handle-errors";
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

  // For hosts that sleep when idle: the call wakes the server and runs one sync pass.
  async runMailSync(req: Request, res: Response) {
    try {
      assertCronSecret(req);

      const result = await this.mailSyncService.syncAllAccounts();
      res.status(200).json({ message: "Mail sync completed", data: result });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
