-- Locker broadcast: move timeline controls from hardcoded constants
-- into DB-managed fields editable by admin.
ALTER TABLE "LockerBroadcast"
ADD COLUMN "openAt" TIMESTAMP(3),
ADD COLUMN "collectionDeadlineAt" TIMESTAMP(3),
ADD COLUMN "isPublished" BOOLEAN NOT NULL DEFAULT false;

-- Global, app-open announcement (single row id="global").
CREATE TABLE "GlobalAnnouncement" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "pushBody" TEXT,
  "displayStartAt" TIMESTAMP(3),
  "displayEndAt" TIMESTAMP(3),
  "isPublished" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "GlobalAnnouncement_pkey" PRIMARY KEY ("id")
);
