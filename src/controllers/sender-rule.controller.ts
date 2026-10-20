import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { createSenderRuleSchema, getSenderRulesQuerySchema } from "../schemas/sender-rule";
import { SenderRuleService } from "../services/sender-rule.service";

export class SenderRuleController {
  private senderRuleService = new SenderRuleService();

  async getRules(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { mailAccountId } = getSenderRulesQuerySchema.parse(req.query);

      const rules = await this.senderRuleService.getRules(userId!, mailAccountId);
      res.status(200).json({ message: "Rules fetched successfully!", data: rules });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

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

  async deleteRule(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      await this.senderRuleService.deleteRule(id as string, userId!);
      res.status(200).json({ message: "Rule removed", data: null });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
