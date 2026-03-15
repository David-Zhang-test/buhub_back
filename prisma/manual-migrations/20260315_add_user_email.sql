CREATE TABLE IF NOT EXISTS "UserEmail" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "canLogin" BOOLEAN NOT NULL DEFAULT true,
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserEmail_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserEmail_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserEmail_email_key" ON "UserEmail"("email");
CREATE INDEX IF NOT EXISTS "UserEmail_userId_idx" ON "UserEmail"("userId");
CREATE INDEX IF NOT EXISTS "UserEmail_type_idx" ON "UserEmail"("type");

INSERT INTO "UserEmail" ("id", "userId", "email", "type", "canLogin", "verifiedAt", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  u."id",
  lower(u."email"),
  CASE
    WHEN lower(u."email") LIKE '%@life.hkbu.edu.hk' THEN 'hkbu'
    ELSE 'primary'
  END,
  true,
  CASE
    WHEN u."emailVerified" THEN COALESCE(u."updatedAt", u."createdAt", CURRENT_TIMESTAMP)
    ELSE NULL
  END,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE u."email" IS NOT NULL
  AND lower(u."email") <> ''
  AND NOT EXISTS (
    SELECT 1
    FROM "UserEmail" ue
    WHERE ue."email" = lower(u."email")
  );