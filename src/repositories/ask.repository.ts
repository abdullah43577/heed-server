import type { AskRole, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

const LIST_LIMIT = 30;

const withMessages = {
  messages: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.AskConversationInclude;

export class AskRepository {
  async findManyByUser(userId: string) {
    return prisma.askConversation.findMany({
      where: { userId },
      select: { id: true, title: true, createdAt: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  async findById(id: string, userId: string) {
    return prisma.askConversation.findFirst({ where: { id, userId }, include: withMessages });
  }

  async create(userId: string, title: string, question: string) {
    return prisma.askConversation.create({
      data: { userId, title, messages: { create: { role: "USER", content: question } } },
      include: withMessages,
    });
  }

  // Through the conversation, so its updatedAt moves and it rises to the top of the list.
  async addMessage(
    id: string,
    userId: string,
    message: { role: AskRole; content: string; citations?: Prisma.InputJsonValue },
  ) {
    return prisma.askConversation.update({
      where: { id, userId },
      data: { messages: { create: message } },
      include: withMessages,
    });
  }

  async delete(id: string, userId: string) {
    return prisma.askConversation.deleteMany({ where: { id, userId } });
  }

  async deleteUpdatedBefore(before: Date) {
    return prisma.askConversation.deleteMany({ where: { updatedAt: { lt: before } } });
  }
}
