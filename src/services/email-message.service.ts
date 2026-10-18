import { EmailMessageRepository } from "../repositories/email-message.repository";

export class EmailMessageService {
  private emailMessageRepo = new EmailMessageRepository();

  async getMessages(userId: string) {
    try {
      return await this.emailMessageRepo.findManyByUser(userId);
    } catch (error) {
      throw error;
    }
  }
}
