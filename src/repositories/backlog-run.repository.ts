import type { BacklogRunStatus, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export const ACTIVE_RUN_STATUSES: BacklogRunStatus[] = ["SCANNING", "SORTING", "READY", "APPLYING"];

const runAccountSelect = {
  mailAccount: { select: { id: true, email: true, status: true } },
} satisfies Prisma.BacklogRunInclude;

export class BacklogRunRepository {
  async create(data: { userId: string; mailAccountId: string; windowDays: number }) {
    return prisma.backlogRun.create({ data, include: runAccountSelect });
  }

  async findById(id: string, userId: string) {
    return prisma.backlogRun.findFirst({ where: { id, userId }, include: runAccountSelect });
  }

  async findManyByUser(userId: string, mailAccountId?: string) {
    return prisma.backlogRun.findMany({
      where: { userId, ...(mailAccountId && { mailAccountId }) },
      include: runAccountSelect,
      orderBy: { createdAt: "desc" },
      take: 20,
    });
  }

  async findActiveForAccount(mailAccountId: string, userId: string) {
    return prisma.backlogRun.findFirst({
      where: { mailAccountId, userId, status: { in: ACTIVE_RUN_STATUSES } },
    });
  }

  // The worker's entry point, and a cross-user read: every call after it carries the row's userId.
  // Least recently advanced first, so runs take turns at the AI budget.
  async findAdvanceable() {
    return prisma.backlogRun.findMany({
      where: { status: { in: ["SCANNING", "SORTING"] } },
      include: {
        mailAccount: {
          select: { id: true, userId: true, email: true, status: true, refreshTokenEnc: true },
        },
      },
      orderBy: { updatedAt: "asc" },
    });
  }

  // Retention, across every user.
  async findReadyBefore(before: Date) {
    return prisma.backlogRun.findMany({
      where: { status: "READY", readyAt: { lt: before } },
      select: { id: true, userId: true },
    });
  }

  async update(id: string, userId: string, data: Prisma.BacklogRunUpdateInput) {
    return prisma.backlogRun.update({ where: { id, userId }, data, include: runAccountSelect });
  }

  // Only moves a run that is still in the expected state, so a cancel cannot be overwritten by a worker step.
  async transition(id: string, userId: string, from: BacklogRunStatus[], data: Prisma.BacklogRunUpdateInput) {
    const { count } = await prisma.backlogRun.updateMany({ where: { id, userId, status: { in: from } }, data });
    return count > 0;
  }
}
