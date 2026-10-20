-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SENDING', 'SENT', 'DISMISSED', 'REPLIED_ELSEWHERE', 'FAILED');

-- AlterEnum
ALTER TYPE "EmailAction" ADD VALUE 'REPLIED';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DRAFTS_READY';

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "draftAttempts" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "ReplyDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emailMessageId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "replyAll" BOOLEAN NOT NULL DEFAULT false,
    "status" "DraftStatus" NOT NULL DEFAULT 'PENDING',
    "sendAt" TIMESTAMP(3),
    "sentMessageId" TEXT,
    "failureReason" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReplyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReplyDraft_emailMessageId_key" ON "ReplyDraft"("emailMessageId");

-- CreateIndex
CREATE INDEX "ReplyDraft_userId_status_idx" ON "ReplyDraft"("userId", "status");

-- CreateIndex
CREATE INDEX "ReplyDraft_status_sendAt_idx" ON "ReplyDraft"("status", "sendAt");

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReplyDraft" ADD CONSTRAINT "ReplyDraft_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "EmailMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
