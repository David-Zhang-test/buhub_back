-- Align LockerRequest schema with prisma/schema.prisma:
--   * rename enum values (DROP_OFF_PROCESSING / DROP_OFF_COMPLETE / PICK_UP_PROCESSING / PICK_UP_COMPLETE)
--   * change default status
--   * add missing modifyCount column
--   * promote userId index to a unique constraint

-- AlterEnum
ALTER TYPE "LockerRequestStatus" RENAME VALUE 'SUBMITTED'  TO 'DROP_OFF_PROCESSING';
ALTER TYPE "LockerRequestStatus" RENAME VALUE 'CONFIRMED'  TO 'DROP_OFF_COMPLETE';
ALTER TYPE "LockerRequestStatus" RENAME VALUE 'COMPLETED'  TO 'PICK_UP_PROCESSING';
ALTER TYPE "LockerRequestStatus" RENAME VALUE 'CANCELLED'  TO 'PICK_UP_COMPLETE';

-- AlterTable
ALTER TABLE "LockerRequest" ALTER COLUMN "status" SET DEFAULT 'DROP_OFF_PROCESSING';
ALTER TABLE "LockerRequest" ADD COLUMN "modifyCount" INTEGER NOT NULL DEFAULT 0;

-- DropIndex
DROP INDEX "LockerRequest_userId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "LockerRequest_userId_key" ON "LockerRequest"("userId");
