// Single source of truth for the locker information-collection cutoff.
// Users may submit/modify their request until this timestamp; afterwards the
// form locks and the admin broadcast banner becomes visible on mobile.
export const COLLECTION_DEADLINE_ISO = "2026-05-03T23:59:00+08:00";
export const COLLECTION_DEADLINE_MS = Date.parse(COLLECTION_DEADLINE_ISO);
