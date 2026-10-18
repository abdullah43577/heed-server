import type { SenderRuleKind } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

export class SenderRuleRepository {
  async findManyByUser(userId: string) {
    return prisma.senderRule.findMany({ where: { userId }, orderBy: { createdAt: "asc" } });
  }

  async upsert(userId: string, pattern: string, kind: SenderRuleKind) {
    return prisma.senderRule.upsert({
      where: { userId_pattern: { userId, pattern } },
      create: { userId, pattern, kind },
      update: { kind },
    });
  }
}
