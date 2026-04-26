import type { ProfileVisibility } from "@prisma/client";

export type ApiProfileVisibility = "public" | "mutual" | "hidden";

export function dbToApiVisibility(value: ProfileVisibility): ApiProfileVisibility {
  return value.toLowerCase() as ApiProfileVisibility;
}

export function apiToDbVisibility(value: ApiProfileVisibility): ProfileVisibility {
  return value.toUpperCase() as ProfileVisibility;
}
