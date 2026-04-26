import { prisma } from "@/src/lib/db";

// Defaults are used when admin has not configured timeline yet.
export const DEFAULT_LOCKER_OPEN_AT_ISO = "2026-05-02T00:00:00+08:00";
export const DEFAULT_LOCKER_CLOSE_AT_ISO = "2026-05-03T23:59:00+08:00";

export type LockerTimeline = {
  featureEnabled: boolean;
  openAtIso: string;
  closeAtIso: string;
  dropOffDate1Iso: string | null;
  dropOffDate2Iso: string | null;
  dropOffDate3Iso: string | null;
  openAtMs: number;
  closeAtMs: number;
};

export async function getLockerTimeline(): Promise<LockerTimeline> {
  const row = await prisma.lockerBroadcast.findUnique({
    where: { id: "global" },
    select: {
      featureEnabled: true,
      openAt: true,
      closeAt: true,
      dropOffDate1: true,
      dropOffDate2: true,
      dropOffDate3: true,
    },
  });

  const openAtIso = row?.openAt?.toISOString() ?? DEFAULT_LOCKER_OPEN_AT_ISO;
  const closeAtIso = row?.closeAt?.toISOString() ?? DEFAULT_LOCKER_CLOSE_AT_ISO;

  return {
    featureEnabled: row?.featureEnabled ?? true,
    openAtIso,
    closeAtIso,
    dropOffDate1Iso: row?.dropOffDate1?.toISOString() ?? null,
    dropOffDate2Iso: row?.dropOffDate2?.toISOString() ?? null,
    dropOffDate3Iso: row?.dropOffDate3?.toISOString() ?? null,
    openAtMs: Date.parse(openAtIso),
    closeAtMs: Date.parse(closeAtIso),
  };
}
