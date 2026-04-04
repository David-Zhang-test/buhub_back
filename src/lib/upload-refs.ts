function uploadsCdnOrigin(): string | null {
  const raw = process.env.ASSET_PUBLIC_BASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function isValidUploadedImageRef(value: string): boolean {
  if (!value) return false;

  if (
    value.startsWith("/uploads/")
    || value.startsWith("uploads/")
    || value.startsWith("/api/uploads/")
    || value.startsWith("api/uploads/")
  ) {
    return true;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;

    const cdnOrigin = uploadsCdnOrigin();
    if (cdnOrigin && parsed.origin === cdnOrigin) {
      return true;
    }

    const path = parsed.pathname;
    if (!(path.startsWith("/uploads/") || path.startsWith("/api/uploads/"))) {
      return false;
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "";
    if (!appUrl) return true;

    const base = new URL(appUrl);
    return parsed.origin === base.origin;
  } catch {
    return false;
  }
}

export function normalizeUploadedImageRef(value: string): string {
  if (value.startsWith("uploads/") || value.startsWith("api/uploads/")) {
    return `/${value}`;
  }

  return value;
}
