-- CreateEnum
CREATE TYPE "MailAccountStatus" AS ENUM ('ACTIVE', 'NEEDS_REAUTH');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'ACCOUNT_NEEDS_REAUTH';

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "googleSub" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "status" "MailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "handledLabelId" TEXT,
    "replyLabelId" TEXT,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailAccount_email_idx" ON "MailAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_userId_email_key" ON "MailAccount"("userId", "email");

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
