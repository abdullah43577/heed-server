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
  handled: { category: { not: null }, action: { not: "AWAITING_REPLY" } },
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
      where: { mailAccountId, userId, category: null },
      orderBy: { receivedAt: "asc" },
      take,
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
