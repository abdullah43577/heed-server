import { Prisma } from "../generated/prisma/client";
import { NotFoundError } from "../lib/errors";
import { computeTotals, reportHeadline, reportPush } from "../lib/reports/totals";
import { isValidTimeZone, localNow, zonedTimeToUtc } from "../lib/timezone";
import { AskRepository } from "../repositories/ask.repository";
import { DailyReportRepository } from "../repositories/daily-report.repository";
import { EmailMessageRepository } from "../repositories/email-message.repository";
import { NotificationService } from "./notification.service";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PERIOD_MS = 2 * DAY_MS;
const MESSAGE_RETENTION_MS = 30 * DAY_MS;
const REPORT_RETENTION_MS = 90 * DAY_MS;
const ASK_RETENTION_MS = 30 * DAY_MS;

const DEFAULT_SETTINGS = { reportTime: "18:00", timezone: "UTC" };

export class DailyReportService {
  private dailyReportRepo = new DailyReportRepository();
  private emailMessageRepo = new EmailMessageRepository();
  private askRepo = new AskRepository();
  private notificationService = new NotificationService();

  async getReports(userId: string) {
    try {
      return await this.dailyReportRepo.findManyByUser(userId);
    } catch (error) {
      throw error;
    }
  }

  // Counts are the snapshot taken at report time; the messages are read live, so an undo since shows.
  async getReport(id: string, userId: string) {
    try {
      const report = await this.dailyReportRepo.findById(id, userId);
      if (!report) throw new NotFoundError("Report not found");

      const messages = await this.emailMessageRepo.findTriagedBetween(userId, report.periodStart, report.periodEnd);
      return { ...report, messages };
    } catch (error) {
      throw error;
    }
  }

  async sweep(now = new Date()) {
    const candidates = await this.dailyReportRepo.findReportCandidates();
    let created = 0;

    for (const candidate of candidates) {
      try {
        if (await this.createDueReport(candidate.id, candidate.settings ?? DEFAULT_SETTINGS, now)) created += 1;
      } catch (error) {
        console.error(`Daily report failed for user ${candidate.id}:`, error);
      }
    }

    return { created };
  }

  async applyRetention(now = new Date()) {
    const messages = await this.emailMessageRepo.deleteCreatedBefore(new Date(now.getTime() - MESSAGE_RETENTION_MS));
    const reports = await this.dailyReportRepo.deleteCreatedBefore(new Date(now.getTime() - REPORT_RETENTION_MS));
    const conversations = await this.askRepo.deleteUpdatedBefore(new Date(now.getTime() - ASK_RETENTION_MS));
    return { messages: messages.count, reports: reports.count, conversations: conversations.count };
  }

  private async createDueReport(userId: string, settings: { reportTime: string; timezone: string }, now: Date) {
    const timezone = isValidTimeZone(settings.timezone) ? settings.timezone : DEFAULT_SETTINGS.timezone;
    const local = localNow(timezone, now);

    if (local.time < settings.reportTime) return false;
    if (await this.dailyReportRepo.existsForDate(userId, local.date)) return false;

    // The period runs on from the previous report so nothing falls between two, moved reportTime or not.
    const periodEnd = zonedTimeToUtc(local.date, settings.reportTime, timezone);
    const previous = await this.dailyReportRepo.findLatest(userId);
    const earliest = periodEnd.getTime() - MAX_PERIOD_MS;
    const periodStart = previous
      ? new Date(Math.max(previous.periodEnd.getTime(), earliest))
      : new Date(periodEnd.getTime() - DAY_MS);

    const messages = await this.emailMessageRepo.findTriagedBetween(userId, periodStart, periodEnd);
    const totals = computeTotals(messages);

    let report;
    try {
      report = await this.dailyReportRepo.create({
        userId,
        reportDate: local.date,
        periodStart,
        periodEnd,
        totals: totals as unknown as Prisma.InputJsonValue,
        headline: reportHeadline(totals),
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return false;
      throw error;
    }

    if (totals.total > 0) {
      await this.notificationService.notify({
        userId,
        type: "DAILY_REPORT",
        ...reportPush(totals),
        entityType: "daily-report",
        entityId: report.id,
      });
    }

    return true;
  }
}
