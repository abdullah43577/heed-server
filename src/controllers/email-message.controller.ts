import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { getMessagesQuerySchema } from "../schemas/email-message";
import { EmailMessageService } from "../services/email-message.service";

export class EmailMessageController {
  private emailMessageService = new EmailMessageService();

  async getMessages(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { view, since } = getMessagesQuerySchema.parse(req.query);

      const messages = await this.emailMessageService.getMessages(userId!, { view, ...(since && { since }) });
      res.status(200).json({ message: "Messages fetched successfully!", data: messages });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async getMessage(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const message = await this.emailMessageService.getMessage(id as string, userId!);
      res.status(200).json({ message: "Message fetched successfully!", data: message });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async undoMarkRead(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const message = await this.emailMessageService.undoMarkRead(id as string, userId!);
      res.status(200).json({ message: "Marked unread in Gmail", data: message });
    } catch (error) {
      handleErrors({ res, error });
    }
  }

  async dismissReply(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const { id } = req.params;

      const message = await this.emailMessageService.dismissReply(id as string, userId!);
      res.status(200).json({ message: "Marked as handled", data: message });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
