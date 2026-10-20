import type { SenderRuleKind } from "../generated/prisma/client";
import { NotFoundError } from "../lib/errors";
import { MailAccountRepository } from "../repositories/mail-account.repository";
import { SenderRuleRepository } from "../repositories/sender-rule.repository";
import type { CreateSenderRule } from "../schemas/sender-rule";

// "Leave it" and "handle it" contradict each other for the same sender and scope; saving one replaces the other.
const OPPOSITE: Partial<Record<SenderRuleKind, SenderRuleKind>> = {
  ALWAYS_LEAVE: "ALWAYS_HANDLE",
  ALWAYS_HANDLE: "ALWAYS_LEAVE",
};

export class SenderRuleService {
  private senderRuleRepo = new SenderRuleRepository();
  private mailAccountRepo = new MailAccountRepository();

  async getRules(userId: string, mailAccountId?: string) {
    try {
      return await this.senderRuleRepo.findForAccount(userId, mailAccountId);
    } catch (error) {
      throw error;
    }
  }

  async createRule(userId: string, input: CreateSenderRule) {
    try {
      const mailAccountId = input.mailAccountId ?? null;
      if (mailAccountId && !(await this.mailAccountRepo.findById(mailAccountId, userId))) {
        throw new NotFoundError("Mail account not found");
      }

      const pattern = input.pattern.trim().toLowerCase();
      const opposite = OPPOSITE[input.kind];
      if (opposite) await this.senderRuleRepo.deleteMatching(userId, pattern, opposite, mailAccountId);

      const existing = await this.senderRuleRepo.findSame(userId, pattern, input.kind, mailAccountId);
      if (existing) return existing;

      return await this.senderRuleRepo.create({ userId, pattern, kind: input.kind, mailAccountId });
    } catch (error) {
      throw error;
    }
  }

  async deleteRule(id: string, userId: string) {
    try {
      const rule = await this.senderRuleRepo.findById(id, userId);
      if (!rule) throw new NotFoundError("Rule not found");
      await this.senderRuleRepo.delete(id, userId);
    } catch (error) {
      throw error;
    }
  }
}
