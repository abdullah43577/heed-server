-- CreateEnum
CREATE TYPE "BacklogRunStatus" AS ENUM ('SCANNING', 'SORTING', 'READY', 'APPLYING', 'DONE', 'CANCELLED', 'FAILED');

-- AlterEnum
ALTER TYPE "EmailAction" ADD VALUE 'PENDING_CONFIRM';

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BACKLOG_READY';

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "backlogRunId" TEXT;

-- CreateTable
CREATE TABLE "BacklogRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mailAccountId" TEXT NOT NULL,
    "windowDays" INTEGER NOT NULL,
    "status" "BacklogRunStatus" NOT NULL DEFAULT 'SCANNING',
    "pageToken" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "sorted" INTEGER NOT NULL DEFAULT 0,
    "aiCalls" INTEGER NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "counts" JSONB,
    "markedRead" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "readyAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "BacklogRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacklogRun_mailAccountId_status_idx" ON "BacklogRun"("mailAccountId", "status");

-- CreateIndex
CREATE INDEX "BacklogRun_userId_createdAt_idx" ON "BacklogRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailMessage_backlogRunId_category_idx" ON "EmailMessage"("backlogRunId", "category");

-- AddForeignKey
ALTER TABLE "BacklogRun" ADD CONSTRAINT "BacklogRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklogRun" ADD CONSTRAINT "BacklogRun_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailMessage" ADD CONSTRAINT "EmailMessage_backlogRunId_fkey" FOREIGN KEY ("backlogRunId") REFERENCES "BacklogRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
