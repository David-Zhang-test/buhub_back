-- Restore admin-configurable drop-off date fields for LockerBroadcast.
-- Idempotent for environments where columns already exist.

ALTER TABLE "LockerBroadcast"
  ADD COLUMN IF NOT EXISTS "dropOffDate1" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dropOffDate2" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dropOffDate3" TIMESTAMP(3);
