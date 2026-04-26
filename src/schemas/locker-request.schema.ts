import { z } from "zod";

export const DROP_OFF_DATES = ["2026-05-07", "2026-05-11", "2026-05-16"] as const;

// Residence hall groups — mirrors BUHUB/src/data/residenceHalls.ts.
// Kept in sync manually; backend uses this for admin filtering.
export const RESIDENCE_HALL_GROUPS = {
  bur: [
    "Chan Tai Ho Hall",
    "Yang Chen-Ning Hall",
    "Cai Yuanpei Hall",
    "Zhou Shuren Hall",
    "Soong Ching-ling Hall",
  ],
  nttih: ["NTTIH"],
  vc: [
    "VC Building 1",
    "VC Building 2",
    "VC Building 3",
    "VC Building 4",
    "VC Building 5",
    "VC Building 6",
    "VC Building 7",
    "VC Building 8",
  ],
} as const;

export type ResidenceHallGroupKey = keyof typeof RESIDENCE_HALL_GROUPS;

export const createLockerRequestSchema = z.object({
  fullName: z.string().min(1).max(100),
  studentId: z.string().min(1).max(32),
  phoneNumber: z.string().min(1).max(32),
  residenceAddress: z.string().min(1).max(500),
  dropOffDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  boxCount: z.number().int().min(1).max(10),
});

export type CreateLockerRequestInput = z.infer<typeof createLockerRequestSchema>;

export const LOCKER_STATUSES = [
  "DROP_OFF_PROCESSING",
  "DROP_OFF_COMPLETE",
  "PICK_UP_PROCESSING",
  "PICK_UP_COMPLETE",
] as const;

export const updateLockerRequestStatusSchema = z.object({
  status: z.enum(LOCKER_STATUSES),
});
