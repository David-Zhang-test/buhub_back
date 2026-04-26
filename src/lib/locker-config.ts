import { prisma } from "@/src/lib/db";

// Defaults are used when admin has not configured timeline yet.
export const DEFAULT_LOCKER_OPEN_AT_ISO = "2026-05-02T00:00:00+08:00";
export const DEFAULT_LOCKER_CLOSE_AT_ISO = "2026-05-03T23:59:00+08:00";

export type LockerTimeline = {
  featureEnabled: boolean;
  openAtIso: string;
  closeAtIso: string;
  announcementStartAtIso: string | null;
  announcementEndAtIso: string | null;
  openAtMs: number;
  closeAtMs: number;
  announcementStartAtMs: number | null;
  announcementEndAtMs: number | null;
};

export async function getLockerTimeline(): Promise<LockerTimeline> {
  const row = await prisma.lockerBroadcast.findUnique({
    where: { id: "global" },
    select: {
      featureEnabled: true,
      openAt: true,
      closeAt: true,
      announcementStartAt: true,
      announcementEndAt: true,
    },
  });

  const openAtIso = row?.openAt?.toISOString() ?? DEFAULT_LOCKER_OPEN_AT_ISO;
  const closeAtIso = row?.closeAt?.toISOString() ?? DEFAULT_LOCKER_CLOSE_AT_ISO;
  const announcementStartAtIso = row?.announcementStartAt?.toISOString() ?? null;
  const announcementEndAtIso = row?.announcementEndAt?.toISOString() ?? null;

  return {
    featureEnabled: row?.featureEnabled ?? true,
    openAtIso,
    closeAtIso,
    announcementStartAtIso,
    announcementEndAtIso,
    openAtMs: Date.parse(openAtIso),
    closeAtMs: Date.parse(closeAtIso),
    announcementStartAtMs: announcementStartAtIso ? Date.parse(announcementStartAtIso) : null,
    announcementEndAtMs: announcementEndAtIso ? Date.parse(announcementEndAtIso) : null,
  };
}
