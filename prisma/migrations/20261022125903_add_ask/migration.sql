-- CreateEnum
CREATE TYPE "AskRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateTable
CREATE TABLE "AskConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AskConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AskMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AskRole" NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AskMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AskConversation_userId_updatedAt_idx" ON "AskConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AskMessage_conversationId_createdAt_idx" ON "AskMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "AskConversation" ADD CONSTRAINT "AskConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AskMessage" ADD CONSTRAINT "AskMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AskConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
