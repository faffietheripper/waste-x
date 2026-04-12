import { handleError } from "@/lib/errors/handleError";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { auth } from "@/auth";
import { isRedirectError } from "next/dist/client/components/redirect";

type ActionOptions = {
  code?: string;
  severity?: "low" | "medium" | "high" | "critical";
  layer?: "api" | "db" | "auth" | "validation" | "external";
  actionName?: string;
};

/* =========================================================
   TYPES
========================================================= */

type ErrorSeverity = "low" | "medium" | "high";

interface ErrorOptions {
  actionName?: string;
  code?: string;
  severity?: ErrorSeverity;
}

/* =========================================================
   WRAPPER
========================================================= */

export function withErrorHandling<T extends (...args: any[]) => any>(
  fn: T,
  options?: ErrorOptions,
) {
  return async (...args: Parameters<T>): Promise<ReturnType<T>> => {
    try {
      return await fn(...args);
    } catch (error: any) {
      /* ===============================
         ✅ ALLOW NEXT REDIRECTS
      ============================== */

      if (isRedirectError(error)) {
        throw error; // DO NOT TOUCH
      }

      /* ===============================
         CUSTOM ERROR SUPPORT
      ============================== */

      const errorId = crypto.randomUUID();

      const errorCode = error?.code || options?.code || "SYSTEM_UNEXPECTED";

      const message =
        error?.message || "Something went wrong. Please try again.";

      /* ===============================
         LOGGING (IMPORTANT)
      ============================== */

      console.error("🚨 ACTION ERROR", {
        id: errorId,
        action: options?.actionName,
        code: errorCode,
        severity: options?.severity || "low",
        message,
        stack: error?.stack,
      });

      /* ===============================
         THROW CLEAN CLIENT ERROR
      ============================== */

      const clientError = new Error(message);

      (clientError as any).code = errorCode;
      (clientError as any).id = errorId;

      throw clientError;
    }
  };
}
