import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { createSenderRuleSchema } from "../schemas/sender-rule";
import { SenderRuleService } from "../services/sender-rule.service";

export class SenderRuleController {
  private senderRuleService = new SenderRuleService();

  async createRule(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const input = createSenderRuleSchema.parse(req.body);

      const rule = await this.senderRuleService.createRule(userId!, input);
      res.status(201).json({ message: "Rule saved", data: rule });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
