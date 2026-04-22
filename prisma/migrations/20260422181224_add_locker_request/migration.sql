-- CreateEnum
CREATE TYPE "LockerRequestStatus" AS ENUM ('SUBMITTED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- AlterTable
ALTER TABLE "FeedbackReply" ALTER COLUMN "isAdmin" SET DEFAULT false;

-- CreateTable
CREATE TABLE "LockerRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "residenceAddress" TEXT NOT NULL,
    "dropOffDate" DATE NOT NULL,
    "pickupDate" DATE,
    "status" "LockerRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LockerRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LockerRequest_userId_idx" ON "LockerRequest"("userId");

-- CreateIndex
CREATE INDEX "LockerRequest_status_idx" ON "LockerRequest"("status");

-- CreateIndex
CREATE INDEX "LockerRequest_createdAt_idx" ON "LockerRequest"("createdAt");

-- AddForeignKey
ALTER TABLE "LockerRequest" ADD CONSTRAINT "LockerRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
