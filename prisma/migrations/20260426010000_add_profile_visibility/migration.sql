-- Add profile visibility setting to User. Three modes mirror the in-app picker:
--   PUBLIC  - any logged-in viewer can see the profile (default for existing rows)
--   MUTUAL  - only viewers in a mutual-follow relationship with the owner can see it
--   HIDDEN  - no one besides the owner can see it
-- Existing rows backfill to PUBLIC via the column default.

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MUTUAL', 'HIDDEN');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "profileVisibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC';
