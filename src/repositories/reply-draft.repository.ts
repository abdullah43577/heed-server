import type { DraftStatus, Prisma } from "../generated/prisma/client";
import { prisma } from "../lib/prisma";

// Still asking for the user's attention: in Review, editable, cancellable or retryable.
export const OPEN_DRAFT_STATUSES: DraftStatus[] = ["PENDING", "SCHEDULED", "SENDING", "FAILED"];

const draftInclude = {
  emailMessage: { include: { mailAccount: { select: { id: true, email: true, status: true } } } },
} satisfies Prisma.ReplyDraftInclude;

export class ReplyDraftRepository {
  async findById(id: string, userId: string) {
    return prisma.replyDraft.findFirst({ where: { id, userId }, include: draftInclude });
  }

  async findByMessage(emailMessageId: string, userId: string) {
    return prisma.replyDraft.findFirst({ where: { emailMessageId, userId } });
  }

  async create(data: { userId: string; emailMessageId: string; body: string; notifiedAt?: Date }) {
    return prisma.replyDraft.create({ data, include: draftInclude });
  }

  async update(id: string, userId: string, data: Prisma.ReplyDraftUpdateInput) {
    return prisma.replyDraft.update({ where: { id, userId }, data, include: draftInclude });
  }

  // Moves a draft only from an expected state, so the sender and an undo can never both win.
  async transition(
    id: string,
    userId: string,
    from: DraftStatus[],
    data: Prisma.ReplyDraftUpdateManyMutationInput,
    where: Prisma.ReplyDraftWhereInput = {},
  ) {
    const { count } = await prisma.replyDraft.updateMany({ where: { id, userId, status: { in: from }, ...where }, data });
    return count > 0;
  }

  async dismissForMessage(emailMessageId: string, userId: string) {
    return prisma.replyDraft.updateMany({
      where: { emailMessageId, userId, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "DISMISSED", sendAt: null },
    });
  }

  async findOpenInThreads(mailAccountId: string, userId: string, threadIds: string[]) {
    return prisma.replyDraft.findMany({
      where: {
        userId,
        status: { in: ["PENDING", "SCHEDULED", "FAILED"] },
        emailMessage: { mailAccountId, gmailThreadId: { in: threadIds } },
      },
      select: { id: true },
    });
  }

  async markRepliedElsewhere(ids: string[], userId: string) {
    return prisma.replyDraft.updateMany({
      where: { id: { in: ids }, userId, status: { in: ["PENDING", "SCHEDULED", "FAILED"] } },
      data: { status: "REPLIED_ELSEWHERE", sendAt: null },
    });
  }

  // The sender's entry point, and a cross-user read: every call after it carries the row's userId.
  async findDueToSend(now: Date) {
    return prisma.replyDraft.findMany({
      where: { status: "SCHEDULED", sendAt: { lte: now } },
      select: { id: true, userId: true },
      take: 20,
    });
  }

  // Cross-user. A draft stuck in SENDING means the process died mid-send.
  async findStuckSending(before: Date) {
    return prisma.replyDraft.findMany({
      where: { status: "SENDING", updatedAt: { lt: before } },
      select: { id: true, userId: true },
    });
  }

  // Cross-user, for the batched "replies ready" push.
  async findUnnotified() {
    return prisma.replyDraft.findMany({
      where: { status: "PENDING", notifiedAt: null },
      include: { emailMessage: { select: { fromName: true, fromEmail: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async markNotified(ids: string[], userId: string) {
    return prisma.replyDraft.updateMany({ where: { id: { in: ids }, userId }, data: { notifiedAt: new Date() } });
  }
}
