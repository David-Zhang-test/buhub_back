/*
  Warnings:

  - You are about to drop the column `email` on the `User` table. All the data in the column will be lost.
  - You are about to drop the column `emailVerified` on the `User` table. All the data in the column will be lost.

  Backfill: copy any User.email not already present in UserEmail for that user, so login and isEmailLinked keep working.
*/

-- Backfill UserEmail from legacy User.email (idempotent per user+email)
INSERT INTO "UserEmail" ("id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text,
       u.id,
       lower(trim(u.email)),
       CASE
         WHEN lower(trim(u.email)) LIKE '%@life.hkbu.edu.hk' THEN 'hkbu'
         ELSE 'primary'
       END,
       true,
       CASE WHEN u."emailVerified" THEN CURRENT_TIMESTAMP ELSE NULL END,
       u."createdAt",
       CURRENT_TIMESTAMP
FROM "User" u
WHERE u.email IS NOT NULL
  AND length(trim(u.email)) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "UserEmail" ue
    WHERE ue."userId" = u.id
      AND lower(ue.email) = lower(trim(u.email))
  );

-- DropIndex
DROP INDEX IF EXISTS "User_email_idx";

-- DropIndex
DROP INDEX IF EXISTS "User_email_key";

-- AlterTable
ALTER TABLE "User" DROP COLUMN IF EXISTS "email",
DROP COLUMN IF EXISTS "emailVerified";
