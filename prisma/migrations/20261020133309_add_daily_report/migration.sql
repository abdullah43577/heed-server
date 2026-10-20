-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'DAILY_REPORT';

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "reportTime" TEXT NOT NULL DEFAULT '18:00',
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC';

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reportDate" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "totals" JSONB NOT NULL,
    "headline" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyReport_userId_periodEnd_idx" ON "DailyReport"("userId", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_userId_reportDate_key" ON "DailyReport"("userId", "reportDate");

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
