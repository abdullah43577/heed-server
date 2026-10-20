import type { Application, NextFunction, Request, Response } from "express";
import { handleErrors } from "../lib/handle-errors";
import { authRouter } from "./auth.routes";
import { backlogRunRouter } from "./backlog-run.routes";
import { dailyReportRouter } from "./daily-report.routes";
import { emailMessageRouter } from "./email-message.routes";
import { mailAccountRouter } from "./mail-account.routes";
import { maintenanceRouter } from "./maintenance.routes";
import { senderRuleRouter } from "./sender-rule.routes";
import { notificationRouter } from "./notification.routes";

export const registerRoutes = (app: Application) => {
  app.use("/v1/auth", authRouter);
  app.use("/v1/notifications", notificationRouter);
  app.use("/v1/mail-accounts", mailAccountRouter);
  app.use("/v1/messages", emailMessageRouter);
  app.use("/v1/rules", senderRuleRouter);
  app.use("/v1/reports", dailyReportRouter);
  app.use("/v1/backlog", backlogRunRouter);
  app.use("/v1/maintenance", maintenanceRouter);

  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: "Not Found",
      message: "The requested endpoint does not exist!",
      explorableSolutions: {
        solution1: 'ensure the "METHOD" used to call the endpoint is correct!',
        solution2: "ensure the relative paths to the server url is defined correctly",
      },
    });
  });

  // Must be registered last, and Express detects an error handler by its four-arg signature:
  // dropping `next` silently turns it into ordinary middleware.
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    handleErrors({ res, error });
  });
};
