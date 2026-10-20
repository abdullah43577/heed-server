import type { EmailAction, EmailCategory, Prisma, TriageSource } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export interface CreateEmailMessageData {
  userId: string;
  mailAccountId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromName: string | null;
  fromEmail: string;
  subject: string;
  receivedAt: Date;
  backlogRunId?: string;
}

export interface TriageOutcome {
  category: EmailCategory;
  action: EmailAction;
  decidedBy: TriageSource;
  summary: string | null;
  reason: string | null;
}

export type MessageView = "handled" | "review";

const messageInclude = {
  mailAccount: { select: { id: true, email: true } },
} satisfies Prisma.EmailMessageInclude;

const viewFilter: Record<MessageView, Prisma.EmailMessageWhereInput> = {
  handled: { category: { not: null }, action: { notIn: ["AWAITING_REPLY", "PENDING_CONFIRM"] } },
  review: { action: "AWAITING_REPLY" },
};

export class EmailMessageRepository {
  async findManyByUser(userId: string, options: { view: MessageView; since?: Date }) {
    return prisma.emailMessage.findMany({
      where: {
        userId,
        ...viewFilter[options.view],
        ...(options.since && { receivedAt: { gte: options.since } }),
      },
      include: messageInclude,
      orderBy: { receivedAt: "desc" },
      take: 200,
    });
  }

  // Live mail only: a backlog run reports on its own.
  async findTriagedBetween(userId: string, start: Date, end: Date) {
    return prisma.emailMessage.findMany({
      where: { userId, backlogRunId: null, category: { not: null }, receivedAt: { gte: start, lt: end } },
      include: messageInclude,
      orderBy: { receivedAt: "desc" },
      take: 1000,
    });
  }

  // Retention, across every user, by when Heed stored the row: a backlog run stores old mail today.
  // A message still waiting on a reply keeps its row until it is dealt with.
  async deleteCreatedBefore(before: Date) {
    return prisma.emailMessage.deleteMany({
      where: { createdAt: { lt: before }, OR: [{ action: null }, { action: { not: "AWAITING_REPLY" } }] },
    });
  }

  async findById(id: string, userId: string) {
    return prisma.emailMessage.findFirst({ where: { id, userId }, include: messageInclude });
  }

  async findExistingGmailIds(mailAccountId: string, userId: string, gmailMessageIds: string[]) {
    const rows = await prisma.emailMessage.findMany({
      where: { mailAccountId, userId, gmailMessageId: { in: gmailMessageIds } },
      select: { gmailMessageId: true },
    });
    return new Set(rows.map(row => row.gmailMessageId));
  }

  async findPendingTriage(mailAccountId: string, userId: string, take: number) {
    return prisma.emailMessage.findMany({
      where: { mailAccountId, userId, category: null, backlogRunId: null },
      orderBy: { receivedAt: "asc" },
      take,
    });
  }

  async findUnsortedForRun(backlogRunId: string, userId: string, take: number) {
    return prisma.emailMessage.findMany({
      where: { backlogRunId, userId, category: null },
      orderBy: { receivedAt: "desc" },
      take,
    });
  }

  async findForRun(backlogRunId: string, userId: string, where: Prisma.EmailMessageWhereInput, take = 200) {
    return prisma.emailMessage.findMany({
      where: { backlogRunId, userId, ...where },
      include: messageInclude,
      orderBy: { receivedAt: "desc" },
      take,
    });
  }

  async countForRun(backlogRunId: string, userId: string) {
    return prisma.emailMessage.groupBy({
      by: ["category", "action"],
      where: { backlogRunId, userId },
      _count: { _all: true },
    });
  }

  async findPendingConfirm(backlogRunId: string, userId: string) {
    return prisma.emailMessage.findMany({
      where: { backlogRunId, userId, action: "PENDING_CONFIRM" },
      select: { id: true, gmailMessageId: true, fromEmail: true },
    });
  }

  async setActionMany(ids: string[], userId: string, action: EmailAction) {
    return prisma.emailMessage.updateMany({ where: { id: { in: ids }, userId }, data: { action } });
  }

  async markUnsortedUnsure(backlogRunId: string, userId: string, reason: string) {
    return prisma.emailMessage.updateMany({
      where: { backlogRunId, userId, category: null },
      data: { category: "UNSURE", action: "LEFT_UNREAD", decidedBy: "FALLBACK", reason, triagedAt: new Date() },
    });
  }

  // Cancelling forgets what the run found, except a row the user already acted on.
  async deleteUnresolvedForRun(backlogRunId: string, userId: string) {
    return prisma.emailMessage.deleteMany({
      where: {
        backlogRunId,
        userId,
        OR: [{ action: null }, { action: { in: ["PENDING_CONFIRM", "LEFT_UNREAD"] } }],
      },
    });
  }

  async createMany(data: CreateEmailMessageData[]) {
    return prisma.emailMessage.createMany({ data, skipDuplicates: true });
  }

  async applyTriage(id: string, userId: string, outcome: TriageOutcome) {
    return prisma.emailMessage.update({
      where: { id, userId },
      data: { ...outcome, triagedAt: new Date() },
    });
  }

  async incrementTriageAttempts(id: string, userId: string) {
    return prisma.emailMessage.update({
      where: { id, userId },
      data: { triageAttempts: { increment: 1 } },
    });
  }

  async incrementTriageAttemptsMany(ids: string[], userId: string) {
    return prisma.emailMessage.updateMany({
      where: { id: { in: ids }, userId },
      data: { triageAttempts: { increment: 1 } },
    });
  }

  async update(
    id: string,
    userId: string,
    data: { category?: EmailCategory; action?: EmailAction; reason?: string },
  ) {
    return prisma.emailMessage.update({ where: { id, userId }, data, include: messageInclude });
  }

  async delete(id: string, userId: string) {
    return prisma.emailMessage.delete({ where: { id, userId } });
  }
}
