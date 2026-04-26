-- Backfill columns introduced after initial locker-broadcast migration.
-- This migration is intentionally additive so existing environments that
-- already applied earlier migrations can recover safely.

ALTER TABLE "LockerBroadcast"
ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "GlobalAnnouncement"
ADD COLUMN IF NOT EXISTS "pushBody" TEXT,
ADD COLUMN IF NOT EXISTS "displayStartAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "displayEndAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- Older migration created publishedAt as NOT NULL with default now();
-- current model allows null before first publish.
ALTER TABLE "GlobalAnnouncement"
ALTER COLUMN "publishedAt" DROP NOT NULL,
ALTER COLUMN "publishedAt" DROP DEFAULT;
