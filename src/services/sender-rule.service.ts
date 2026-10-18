import type { SenderRuleKind } from "../generated/prisma/client";
import { SenderRuleRepository } from "../repositories/sender-rule.repository";

export class SenderRuleService {
  private senderRuleRepo = new SenderRuleRepository();

  async createRule(userId: string, input: { pattern: string; kind: SenderRuleKind }) {
    try {
      return await this.senderRuleRepo.upsert(userId, input.pattern.trim().toLowerCase(), input.kind);
    } catch (error) {
      throw error;
    }
  }
}
