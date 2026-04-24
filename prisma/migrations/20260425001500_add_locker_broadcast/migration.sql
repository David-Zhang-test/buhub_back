-- Add LockerBroadcast singleton table for admin-edited broadcast message.

-- CreateTable
CREATE TABLE "LockerBroadcast" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LockerBroadcast_pkey" PRIMARY KEY ("id")
);
