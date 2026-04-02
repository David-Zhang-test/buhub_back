import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";
import { getErrorMessage } from "./errorMessages";
import { child } from "./logger";

const log = child("api");

// Error classes
export class AppError extends Error {
  constructor(
    message: string,
    public statusCode: number = 500,
    public code?: string
  ) {
    super(message);
    this.name = "AppError";
    Error.captureStackTrace(this, this.constructor);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403, "FORBIDDEN");
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not Found") {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", public details?: unknown) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

// Get language from request headers
function getLanguage(req: NextRequest): string {
  const langHeader = req.headers.get("x-lang");
  if (langHeader) {
    return langHeader;
  }
  const acceptLanguage = req.headers.get("accept-language");
  if (acceptLanguage) {
    const preferredLang = acceptLanguage.split(",")[0]?.trim();
    if (preferredLang) {
      return preferredLang.split("-")[0]; // "zh-CN" -> "zh"
    }
  }
  return "en";
}

// Map common error messages to codes
function mapMessageToCode(message: string): string {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes("missing authorization token") || lowerMessage.includes("unauthorized")) {
    return "UNAUTHORIZED";
  }
  if (lowerMessage.includes("session expired")) {
    return "SESSION_EXPIRED";
  }
  if (lowerMessage.includes("user not found")) {
    return "USER_NOT_FOUND";
  }
  if (lowerMessage.includes("account deactivated")) {
    return "ACCOUNT_DEACTIVATED";
  }
  if (lowerMessage.includes("account banned")) {
    return "ACCOUNT_BANNED";
  }
  if (lowerMessage.includes("forbidden") || lowerMessage.includes("permission")) {
    return "FORBIDDEN";
  }
  if (lowerMessage.includes("not found")) {
    return "NOT_FOUND";
  }
  if (lowerMessage.includes("already")) {
    return "ALREADY_EXISTS";
  }
  if (lowerMessage.includes("invalid") || lowerMessage.includes("validation")) {
    return "VALIDATION_ERROR";
  }
  if (lowerMessage.includes("upload")) {
    return "UPLOAD_FAILED";
  }
  if (lowerMessage.includes("file")) {
    return "FILE_TOO_LARGE";
  }
  return "UNKNOWN_ERROR";
}

export function handleError(error: unknown, req?: NextRequest) {
  // Get language from request if available
  const lang = req ? getLanguage(req) : "en";

  if (error instanceof ZodError) {
    const message = getErrorMessage("VALIDATION_ERROR", lang);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message,
          details: error.errors.map((e) => ({
            path: e.path.join("."),
            message: e.message,
          })),
        },
      },
      { status: 400 }
    );
  }

  if (error instanceof AppError) {
    // Map error message to code if not already set
    const code = error.code || mapMessageToCode(error.message);
    const message = getErrorMessage(code, lang);
    if (error.statusCode >= 401 && error.statusCode < 500) {
      log.warn("4xx", { statusCode: error.statusCode, code, message: error.message });
    }

    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message,
          ...(error instanceof ValidationError && error.details
            ? { details: error.details }
            : {}),
        },
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    log.error("5xx", { message: error.message, stack: error.stack });

    // Map error message to code
    const code = mapMessageToCode(error.message);
    const message = getErrorMessage(
      process.env.NODE_ENV === "development" ? code : "INTERNAL_ERROR",
      lang
    );

    return NextResponse.json(
      {
        success: false,
        error: {
          code,
          message,
          ...(process.env.NODE_ENV === "development" ? { details: error.message } : {}),
        },
      },
      { status: 500 }
    );
  }

  const message = getErrorMessage("UNKNOWN_ERROR", lang);
  return NextResponse.json(
    {
      success: false,
      error: {
        code: "UNKNOWN_ERROR",
        message,
      },
    },
    { status: 500 }
  );
}
