import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

/** Middleware 运行在 Edge Runtime，不能使用 Node 版 logger（Winston），用 console 即可。 */
function logWarn(msg: string, meta?: Record<string, unknown>) {
  console.warn("[middleware]", msg, meta ?? "");
}

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
  // React Native / Expo 等原生或部分环境会发 Origin: "null"，必须放行否则接口被 403 且无报错
  if (origin === "null") return true;
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

/** Reject Server Action-style requests to /api so Next.js does not treat them as RSC and return 500. */
function isServerActionRequest(req: NextRequest): boolean {
  if (req.method !== "POST") return false;
  const nextAction = req.headers.get("next-action");
  if (nextAction != null && nextAction !== "") return true;
  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data") && req.headers.get("next-action-id")) return true;
  return false;
}

const JWT_SECRET = new TextEncoder().encode(
  (() => {
    const secret = process.env.JWT_SECRET
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET must be set in production')
      }
      return 'dev-secret-not-for-production'
    }
    return secret
  })()
)

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isServerActionRequest(request)) {
    if (pathname.startsWith("/api")) {
      return NextResponse.json(
        { success: false, error: { code: "BAD_REQUEST", message: "Server Action requests are not supported on API routes" } },
        { status: 400 }
      );
    }
    // Allow Server Actions on /admin paths (login, logout, mutations)
    if (pathname.startsWith("/admin")) {
      return NextResponse.next();
    }
    return new NextResponse(null, { status: 404 });
  }

  // Admin page auth gate (optimistic -- no Redis, just JWT signature check)
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    const token = request.cookies.get("admin_token")?.value
    if (!token) {
      return NextResponse.redirect(new URL("/admin/login", request.url))
    }
    try {
      await jwtVerify(token, JWT_SECRET)
    } catch {
      const response = NextResponse.redirect(new URL("/admin/login", request.url))
      response.cookies.delete("admin_token")
      return response
    }
    return NextResponse.next()
  }

  if (!pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  const allowedOrigins = getAllowedOrigins();
  const origin = request.headers.get("origin");
  const allowed = isAllowedOrigin(origin, request, allowedOrigins);

  if (pathname.startsWith("/api") && request.method === "OPTIONS") {
    if (!allowed) {
      logWarn("CORS OPTIONS denied", { pathname, origin });
      return NextResponse.json(
        { success: false, error: { code: "CORS_ORIGIN_DENIED", message: "Origin not allowed" } },
        { status: 403 }
      );
    }
    return applyCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  if (!allowed) {
    logWarn("CORS denied", { method: request.method, pathname, origin });
    return NextResponse.json(
      { success: false, error: { code: "CORS_ORIGIN_DENIED", message: "Origin not allowed" } },
      { status: 403 }
    );
  }

  return applyCorsHeaders(NextResponse.next(), origin);
}

export const config = {
  matcher: ["/api/:path*", "/", "/admin/:path*"],
};
