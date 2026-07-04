import { handleError } from "@/lib/errors/handleError";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { auth } from "@/auth";
import { isRedirectError } from "next/dist/client/components/redirect";

type ErrorSeverity = "low" | "medium" | "high" | "critical";
type ErrorLayer = "api" | "db" | "auth" | "validation" | "external";

interface ErrorOptions {
  actionName?: string;
  code?: string;
  severity?: ErrorSeverity;
  layer?: ErrorLayer;
  metadata?: Record<string, unknown>;
}

/* =========================================================
   WRAPPER
========================================================= */

export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  options?: ErrorOptions,
) {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      /*
        Next.js redirects are thrown errors internally.
        Never log or wrap these, otherwise redirects break.
      */
      if (isRedirectError(error)) {
        throw error;
      }

      const session = await auth().catch(() => null);

      const errorCode =
        error?.code || options?.code || ERROR_CODES.SYSTEM_UNEXPECTED;

      const message =
        error?.message || "Something went wrong. Please try again.";

      const severity = options?.severity || "medium";
      const layer = options?.layer || "api";

      const errorId = await handleError(error, {
        code: errorCode,
        severity,
        system: {
          layer,
        },
        context: {
          userId: session?.user?.id,
          organisationId: session?.user?.organisationId,
        },
        metadata: {
          actionName: options?.actionName,
          args: safeArgs(args),
          ...options?.metadata,
        },
      });

      console.error("🚨 ACTION ERROR", {
        id: errorId,
        action: options?.actionName,
        code: errorCode,
        severity,
        layer,
        message,
        stack: error?.stack,
      });

      const clientError = new Error(message);

      (clientError as any).code = errorCode;
      (clientError as any).id = errorId;

      throw clientError;
    }
  };
}

/* =========================================================
   SAFE ARGS

   Avoid storing raw FormData/files/passwords/tokens in error metadata.
========================================================= */

function safeArgs(args: unknown[]) {
  return args.map((arg) => {
    if (arg instanceof FormData) {
      return "[FormData]";
    }

    if (typeof File !== "undefined" && arg instanceof File) {
      return "[File]";
    }

    if (typeof arg === "object" && arg !== null) {
      try {
        return redactSensitiveFields(arg as Record<string, unknown>);
      } catch {
        return "[Object]";
      }
    }

    return arg;
  });
}

function redactSensitiveFields(input: Record<string, unknown>) {
  const sensitiveKeys = [
    "password",
    "passwordHash",
    "token",
    "inviteToken",
    "resetToken",
    "accessToken",
    "refreshToken",
    "secret",
  ];

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    if (
      sensitiveKeys.some((sensitiveKey) =>
        key.toLowerCase().includes(sensitiveKey.toLowerCase()),
      )
    ) {
      output[key] = "[REDACTED]";
    } else {
      output[key] = value;
    }
  }

  return output;
}