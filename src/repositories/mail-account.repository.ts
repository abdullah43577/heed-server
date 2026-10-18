import type { MailAccountStatus } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const publicSelect = {
  id: true,
  email: true,
  status: true,
  connectedAt: true,
} as const;

export interface UpsertMailAccountData {
  userId: string;
  email: string;
  googleSub: string;
  refreshTokenEnc: string;
}

export class MailAccountRepository {
  async findManyByUser(userId: string) {
    return prisma.mailAccount.findMany({
      where: { userId },
      select: { ...publicSelect, refreshTokenEnc: true },
      orderBy: { connectedAt: "asc" },
    });
  }

  async findById(id: string, userId: string) {
    return prisma.mailAccount.findFirst({ where: { id, userId } });
  }

  async findByEmail(userId: string, email: string) {
    return prisma.mailAccount.findFirst({ where: { userId, email } });
  }

  async countByUser(userId: string) {
    return prisma.mailAccount.count({ where: { userId } });
  }

  async upsert(data: UpsertMailAccountData) {
    return prisma.mailAccount.upsert({
      where: { userId_email: { userId: data.userId, email: data.email } },
      create: data,
      update: { googleSub: data.googleSub, refreshTokenEnc: data.refreshTokenEnc, status: "ACTIVE" },
    });
  }

  async updateLabels(id: string, userId: string, labels: { handledLabelId: string; replyLabelId: string }) {
    return prisma.mailAccount.update({ where: { id, userId }, data: labels });
  }

  async updateStatus(id: string, userId: string, status: MailAccountStatus) {
    return prisma.mailAccount.update({ where: { id, userId }, data: { status } });
  }

  async delete(id: string, userId: string) {
    return prisma.mailAccount.delete({ where: { id, userId } });
  }
}
