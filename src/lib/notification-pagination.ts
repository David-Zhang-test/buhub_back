/**
 * Notification list GET endpoints (likes / followers / comments).
 *
 * Legacy mobile binaries omit `limit` and expect up to 50 rows (historical `take: 50`).
 * Current apps pass explicit `limit` (typically 20) with `page` for TanStack infinite queries.
 */
export function resolveNotificationListPaging(searchParams: URLSearchParams): {
  page: number;
  limit: number;
  skip: number;
} {
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const limitRaw = searchParams.get("limit");
  const limit =
    limitRaw === null
      ? 50
      : Math.min(Math.max(parseInt(limitRaw, 10) || 20, 1), 50);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}
