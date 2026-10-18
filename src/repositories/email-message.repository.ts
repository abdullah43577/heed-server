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

const messageInclude = {
  mailAccount: { select: { id: true, email: true } },
} as const;

export class EmailMessageRepository {
  async findManyByUser(userId: string, take = 50) {
    return prisma.emailMessage.findMany({
      where: { userId },
      include: messageInclude,
      orderBy: { receivedAt: "desc" },
      take,
    });
  }

  async findExistingGmailIds(mailAccountId: string, userId: string, gmailMessageIds: string[]) {
    const rows = await prisma.emailMessage.findMany({
      where: { mailAccountId, userId, gmailMessageId: { in: gmailMessageIds } },
      select: { gmailMessageId: true },
    });
    return new Set(rows.map(row => row.gmailMessageId));
  }

  async createMany(data: CreateEmailMessageData[]) {
    return prisma.emailMessage.createMany({ data, skipDuplicates: true });
  }
}
