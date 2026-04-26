-- Idempotent: safe on DBs that already match the schema (no-op),
-- and corrective on DBs that only applied David's three earlier migrations.
-- Net effect mirrors prisma/schema.prisma:
--   GlobalAnnouncement gains imageUrl
--   LockerBroadcast loses collectionDeadlineAt, gains closeAt + announcement window

-- AlterTable
ALTER TABLE "GlobalAnnouncement" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;

-- AlterTable
ALTER TABLE "LockerBroadcast" DROP COLUMN IF EXISTS "collectionDeadlineAt";
ALTER TABLE "LockerBroadcast" ADD COLUMN IF NOT EXISTS "announcementEndAt" TIMESTAMP(3);
ALTER TABLE "LockerBroadcast" ADD COLUMN IF NOT EXISTS "announcementStartAt" TIMESTAMP(3);
ALTER TABLE "LockerBroadcast" ADD COLUMN IF NOT EXISTS "closeAt" TIMESTAMP(3);
