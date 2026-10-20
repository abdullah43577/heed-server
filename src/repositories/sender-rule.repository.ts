import type { SenderRuleKind } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const ruleInclude = { mailAccount: { select: { id: true, email: true } } } as const;

export class SenderRuleRepository {
  async findManyByUser(userId: string) {
    return prisma.senderRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  // The rules that apply to one account: its own and the every-account ones.
  async findForAccount(userId: string, mailAccountId?: string) {
    return prisma.senderRule.findMany({
      where: { userId, ...(mailAccountId && { OR: [{ mailAccountId }, { mailAccountId: null }] }) },
      include: ruleInclude,
      orderBy: { createdAt: "desc" },
    });
  }

  async findById(id: string, userId: string) {
    return prisma.senderRule.findFirst({ where: { id, userId }, include: ruleInclude });
  }

  async findSame(userId: string, pattern: string, kind: SenderRuleKind, mailAccountId: string | null) {
    return prisma.senderRule.findFirst({ where: { userId, pattern, kind, mailAccountId }, include: ruleInclude });
  }

  async create(data: { userId: string; pattern: string; kind: SenderRuleKind; mailAccountId: string | null }) {
    return prisma.senderRule.create({ data, include: ruleInclude });
  }

  async deleteMatching(userId: string, pattern: string, kind: SenderRuleKind, mailAccountId: string | null) {
    return prisma.senderRule.deleteMany({ where: { userId, pattern, kind, mailAccountId } });
  }

  async delete(id: string, userId: string) {
    return prisma.senderRule.delete({ where: { id, userId } });
  }
}
