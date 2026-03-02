import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
];

function getAllowedOrigins(): Set<string> {
  const appUrlOrigin = (() => {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (!appUrl) return "";
    try {
      return new URL(appUrl).origin;
    } catch {
      return "";
    }
  })();

  const configured =
    process.env.CORS_ALLOWED_ORIGINS?.split(",")
      .map((s) => s.trim())
      .filter(Boolean) ?? [];
  const merged = [...configured, ...(appUrlOrigin ? [appUrlOrigin] : [])];
  return new Set(process.env.NODE_ENV === "production" ? merged : [...DEFAULT_DEV_ORIGINS, ...merged]);
}

function isAllowedOrigin(origin: string | null, request: NextRequest, allowedOrigins: Set<string>): boolean {
  if (!origin) return true;
  try {
    const requestHost = request.headers.get("host");
    const originUrl = new URL(origin);
    const requestUrl = new URL(request.url);

    // Accept same host even if scheme differs behind reverse proxy.
    if (requestHost && originUrl.host === requestHost) return true;
    if (originUrl.hostname === requestUrl.hostname) return true;
  } catch {
    // fall through
  }
  if (origin === request.nextUrl.origin) return true;
  return allowedOrigins.has(origin);
}

function applyCorsHeaders(response: NextResponse, origin: string | null) {
  if (!origin) return response;
  response.headers.set("Access-Control-Allow-Origin", origin);
  response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  response.headers.set("Access-Control-Max-Age", "600");
  response.headers.set("Vary", "Origin");
  return response;
}

export function middleware(request: NextRequest) {
  const allowedOrigins = getAllowedOrigins();
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin, request, allowedOrigins);

  if (request.nextUrl.pathname.startsWith("/api") && request.method === "OPTIONS") {
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: "CORS_ORIGIN_DENIED", message: "Origin not allowed" } },
        { status: 403 }
      );
    }
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  if (!allowed) {
    return NextResponse.json(
      { success: false, error: { code: "CORS_ORIGIN_DENIED", message: "Origin not allowed" } },
      { status: 403 }
    );
  }

  return applyCorsHeaders(NextResponse.next(), origin);
}

export const config = {
  matcher: ["/api/:path*"],
};
