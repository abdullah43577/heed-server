import { type Response } from "express";
import type { IUserRequest } from "../interface";
import { handleErrors } from "../lib/handle-errors";
import { EmailMessageService } from "../services/email-message.service";

export class EmailMessageController {
  private emailMessageService = new EmailMessageService();

  async getMessages(req: IUserRequest, res: Response) {
    try {
      const { userId } = req;
      const messages = await this.emailMessageService.getMessages(userId!);
      res.status(200).json({ message: "Messages fetched successfully!", data: messages });
    } catch (error) {
      handleErrors({ res, error });
    }
  }
}
