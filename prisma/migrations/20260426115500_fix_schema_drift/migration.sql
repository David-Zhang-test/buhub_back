-- Rename collectionDeadlineAt to closeAt if it exists
DO $$ 
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='LockerBroadcast' AND column_name='collectionDeadlineAt') THEN
    ALTER TABLE "LockerBroadcast" RENAME COLUMN "collectionDeadlineAt" TO "closeAt";
  END IF;
END $$;

-- Add missing columns if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='LockerBroadcast' AND column_name='announcementStartAt') THEN
    ALTER TABLE "LockerBroadcast" ADD COLUMN "announcementStartAt" TIMESTAMP(3);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='LockerBroadcast' AND column_name='announcementEndAt') THEN
    ALTER TABLE "LockerBroadcast" ADD COLUMN "announcementEndAt" TIMESTAMP(3);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='GlobalAnnouncement' AND column_name='imageUrl') THEN
    ALTER TABLE "GlobalAnnouncement" ADD COLUMN "imageUrl" TEXT;
  END IF;
END $$;
