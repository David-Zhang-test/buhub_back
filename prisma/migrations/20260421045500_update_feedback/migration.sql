-- AlterEnum
BEGIN;
CREATE TYPE "FeedbackStatus_new" AS ENUM ('UNRESOLVED', 'RESOLVED', 'CLOSED');
ALTER TABLE "Feedback" ALTER COLUMN "status" DROP DEFAULT;
-- Safely convert old ENUM values to new ones without data loss
ALTER TABLE "Feedback" ALTER COLUMN "status" TYPE "FeedbackStatus_new" USING (
  CASE "status"::text
    WHEN 'PENDING' THEN 'UNRESOLVED'::text::"FeedbackStatus_new"
    WHEN 'REPLIED' THEN 'RESOLVED'::text::"FeedbackStatus_new"
    ELSE "status"::text::"FeedbackStatus_new"
  END
);
ALTER TYPE "FeedbackStatus" RENAME TO "FeedbackStatus_old";
ALTER TYPE "FeedbackStatus_new" RENAME TO "FeedbackStatus";
DROP TYPE "FeedbackStatus_old";
ALTER TABLE "Feedback" ALTER COLUMN "status" SET DEFAULT 'UNRESOLVED';
COMMIT;

-- DropForeignKey
ALTER TABLE "FeedbackReply" DROP CONSTRAINT "FeedbackReply_adminId_fkey";

-- DropIndex
DROP INDEX "FeedbackReply_adminId_idx";

-- AlterTable
ALTER TABLE "Feedback" DROP COLUMN IF EXISTS "title";
ALTER TABLE "Feedback" ALTER COLUMN "status" SET DEFAULT 'UNRESOLVED';

-- AlterTable (Safe Rename instead of Drop to preserve reply history)
ALTER TABLE "FeedbackReply" RENAME COLUMN "adminId" TO "userId";
ALTER TABLE "FeedbackReply" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE INDEX "FeedbackReply_userId_idx" ON "FeedbackReply"("userId");

-- AddForeignKey
ALTER TABLE "FeedbackReply" ADD CONSTRAINT "FeedbackReply_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
