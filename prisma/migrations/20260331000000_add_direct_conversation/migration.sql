CREATE TABLE "DirectConversation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "lastInteractedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DirectConversation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DirectConversation_ownerId_partnerId_key" ON "DirectConversation"("ownerId", "partnerId");
CREATE INDEX "DirectConversation_ownerId_lastInteractedAt_idx" ON "DirectConversation"("ownerId", "lastInteractedAt");
CREATE INDEX "DirectConversation_partnerId_idx" ON "DirectConversation"("partnerId");

ALTER TABLE "DirectConversation"
ADD CONSTRAINT "DirectConversation_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DirectConversation"
ADD CONSTRAINT "DirectConversation_partnerId_fkey"
FOREIGN KEY ("partnerId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "DirectConversation" ("id", "ownerId", "partnerId", "lastInteractedAt", "createdAt", "updatedAt")
SELECT
    md5(random()::text || clock_timestamp()::text || pairs.owner_id || pairs.partner_id),
    pairs.owner_id,
    pairs.partner_id,
    pairs.last_interacted_at,
    pairs.first_interacted_at,
    pairs.last_interacted_at
FROM (
    SELECT
        owner_id,
        partner_id,
        MAX(last_interacted_at) AS last_interacted_at,
        MIN(first_interacted_at) AS first_interacted_at
    FROM (
        SELECT
            "senderId" AS owner_id,
            "receiverId" AS partner_id,
            MAX("createdAt") AS last_interacted_at,
            MIN("createdAt") AS first_interacted_at
        FROM "DirectMessage"
        GROUP BY "senderId", "receiverId"

        UNION ALL

        SELECT
            "receiverId" AS owner_id,
            "senderId" AS partner_id,
            MAX("createdAt") AS last_interacted_at,
            MIN("createdAt") AS first_interacted_at
        FROM "DirectMessage"
        GROUP BY "receiverId", "senderId"
    ) AS raw_pairs
    GROUP BY owner_id, partner_id
) AS pairs
ON CONFLICT ("ownerId", "partnerId") DO UPDATE
SET
    "lastInteractedAt" = GREATEST("DirectConversation"."lastInteractedAt", EXCLUDED."lastInteractedAt"),
    "updatedAt" = GREATEST("DirectConversation"."updatedAt", EXCLUDED."updatedAt");
