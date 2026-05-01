/**
 * Single source of truth for notification & push type strings (TICKET-008).
 *
 * Replaces scattered string literals across 11+ files. Use `satisfies` at
 * call sites so TypeScript catches typos at compile time.
 */

// All Notification.type values stored in the Notification table.
// Mirrors backend createNotificationOnce({ type: ... }) call sites.
export const NOTIFICATION_TYPES = [
  "like",
  "bookmark",
  "comment",
  "reply",
  "mention",
  "follow",
  "repost",
  "message",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Aggregated category emitted as the realtime `notification:new` event's
// `notificationType` field. Mobile groups per-tab badges by this set:
// reply / mention / repost all collapse into "comment", which matches the
// product's three-tab notification surface (likes / followers / comments).
export const NOTIFICATION_CATEGORIES = ["like", "follow", "comment"] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

// Mapping from raw notification type → realtime category bucket.
// Use this when publishing a `notification:new` event.
export function categoryForType(type: NotificationType): NotificationCategory {
  switch (type) {
    case "like":
    case "bookmark":
      return "like";
    case "follow":
      return "follow";
    case "comment":
    case "reply":
    case "mention":
    case "repost":
    case "message":
      return "comment";
  }
}

// All `data.type` values that may appear in an Expo push payload.
// Superset of NOTIFICATION_TYPES, plus broadcast / system events that don't
// produce a Notification row.
export const PUSH_DATA_TYPES = [
  ...NOTIFICATION_TYPES,
  "task_expiring_soon",
  "task_expired",
  "new_post",
  "locker_broadcast",
  "locker_status",
  "announcement_global",
] as const;
export type PushDataType = (typeof PUSH_DATA_TYPES)[number];
