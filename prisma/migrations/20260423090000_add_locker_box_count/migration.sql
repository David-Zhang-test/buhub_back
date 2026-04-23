-- Add boxCount column for SFSC storage box selection (1-10 boxes per request).
-- Existing rows default to 1 box.

-- AlterTable
ALTER TABLE "LockerRequest" ADD COLUMN "boxCount" INTEGER NOT NULL DEFAULT 1;
