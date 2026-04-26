-- Ensure LockerBroadcast timeline columns exist on all environments.
-- This migration is idempotent and safe to run on partially-migrated DBs.

ALTER TABLE "LockerBroadcast"
  ADD COLUMN IF NOT EXISTS "dropOffDate1" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dropOffDate2" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dropOffDate3" TIMESTAMP(3);
