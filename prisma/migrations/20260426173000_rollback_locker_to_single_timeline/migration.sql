-- Roll back LockerBroadcast to the original single timeline model:
-- only openAt + closeAt are retained for timing.
-- Idempotent for environments with drift.

ALTER TABLE "LockerBroadcast"
  DROP COLUMN IF EXISTS "announcementStartAt",
  DROP COLUMN IF EXISTS "announcementEndAt",
  DROP COLUMN IF EXISTS "dropOffDate1",
  DROP COLUMN IF EXISTS "dropOffDate2",
  DROP COLUMN IF EXISTS "dropOffDate3";
