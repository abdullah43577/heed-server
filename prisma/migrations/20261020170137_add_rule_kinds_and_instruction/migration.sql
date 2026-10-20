-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "SenderRuleKind" ADD VALUE 'ALWAYS_HANDLE';
ALTER TYPE "SenderRuleKind" ADD VALUE 'NEVER_DRAFT';

-- DropIndex
DROP INDEX "SenderRule_userId_pattern_key";

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN     "instruction" TEXT;

-- AlterTable
ALTER TABLE "SenderRule" ADD COLUMN     "mailAccountId" TEXT;

-- CreateIndex
CREATE INDEX "SenderRule_userId_pattern_idx" ON "SenderRule"("userId", "pattern");

-- AddForeignKey
ALTER TABLE "SenderRule" ADD CONSTRAINT "SenderRule_mailAccountId_fkey" FOREIGN KEY ("mailAccountId") REFERENCES "MailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
