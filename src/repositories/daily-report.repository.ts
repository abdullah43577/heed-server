import type { Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export interface CreateDailyReportData {
  userId: string;
  reportDate: string;
  periodStart: Date;
  periodEnd: Date;
  totals: Prisma.InputJsonValue;
  headline: string;
}

export class DailyReportRepository {
  // The sweep's entry point, and a cross-user read: every call after it carries the row's id as userId.
  async findReportCandidates() {
    return prisma.user.findMany({
      where: { account_status: "ACTIVE", mailAccounts: { some: {} } },
      select: { id: true, settings: { select: { reportTime: true, timezone: true } } },
    });
  }

  async findManyByUser(userId: string) {
    return prisma.dailyReport.findMany({
      where: { userId },
      orderBy: { periodEnd: "desc" },
      take: 90,
    });
  }

  async findById(id: string, userId: string) {
    return prisma.dailyReport.findFirst({ where: { id, userId } });
  }

  async findLatest(userId: string) {
    return prisma.dailyReport.findFirst({ where: { userId }, orderBy: { periodEnd: "desc" } });
  }

  async existsForDate(userId: string, reportDate: string) {
    const count = await prisma.dailyReport.count({ where: { userId, reportDate } });
    return count > 0;
  }

  async create(data: CreateDailyReportData) {
    return prisma.dailyReport.create({ data });
  }

  // Retention, across every user.
  async deleteCreatedBefore(before: Date) {
    return prisma.dailyReport.deleteMany({ where: { createdAt: { lt: before } } });
  }
}
