ALTER TABLE "DirectConversation"
ADD COLUMN "clearedAt" TIMESTAMP(3),
ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "DirectConversation_ownerId_deletedAt_lastInteractedAt_idx"
ON "DirectConversation"("ownerId", "deletedAt", "lastInteractedAt");
