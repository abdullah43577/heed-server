import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { rewriteDraftSchema, sendDraftSchema, updateDraftSchema } from "../schemas/reply-draft";
import { ReplyDraftService } from "../services/reply-draft.service";

export class ReplyDraftController {
  private replyDraftService = new ReplyDraftService();

  async getDraft(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const draft = await this.replyDraftService.getDraft(id as string, userId!);
      res.status(200).json({ message: "Draft fetched successfully!", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async createForMessage(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const draft = await this.replyDraftService.createForMessage(id as string, userId!);
      res.status(200).json({ message: "Draft ready", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async update(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;
      const data = updateDraftSchema.parse(req.body);

      const draft = await this.replyDraftService.update(id as string, userId!, data);
      res.status(200).json({ message: "Draft saved", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async rewrite(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;
      const data = rewriteDraftSchema.parse(req.body);

      const draft = await this.replyDraftService.rewrite(id as string, userId!, data);
      res.status(200).json({ message: "Draft rewritten", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async send(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;
      const data = sendDraftSchema.parse(req.body);

      const draft = await this.replyDraftService.send(id as string, userId!, data);
      res.status(200).json({ message: "Sending", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async cancelSend(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const draft = await this.replyDraftService.cancelSend(id as string, userId!);
      res.status(200).json({ message: "Not sent", data: draft });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async dismiss(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const result = await this.replyDraftService.dismiss(id as string, userId!);
      res.status(200).json({ message: "Marked as handled", data: result });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
