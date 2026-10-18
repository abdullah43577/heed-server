-- CreateEnum
CREATE TYPE "EmailCategory" AS ENUM ('NEEDS_REPLY', 'IMPORTANT', 'ROUTINE', 'NEWSLETTER', 'PROMOTION', 'UNSURE');

-- CreateEnum
CREATE TYPE "EmailAction" AS ENUM ('MARKED_READ', 'LEFT_UNREAD', 'AWAITING_REPLY', 'UNDONE');

-- CreateEnum
CREATE TYPE "TriageSource" AS ENUM ('RULE', 'HEADER', 'AI', 'FALLBACK');

-- CreateEnum
CREATE TYPE "SenderRuleKind" AS ENUM ('ALWAYS_LEAVE');

-- AlterTable
ALTER TABLE "EmailMessage" ADD COLUMN     "action" "EmailAction",
ADD COLUMN     "category" "EmailCategory",
ADD COLUMN     "decidedBy" "TriageSource",
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "summary" TEXT,
ADD COLUMN     "triageAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "triagedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "SenderRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "kind" "SenderRuleKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SenderRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SenderRule_userId_pattern_key" ON "SenderRule"("userId", "pattern");

-- CreateIndex
CREATE INDEX "EmailMessage_mailAccountId_category_idx" ON "EmailMessage"("mailAccountId", "category");

-- AddForeignKey
ALTER TABLE "SenderRule" ADD CONSTRAINT "SenderRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
