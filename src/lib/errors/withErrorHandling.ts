import { handleError } from "@/lib/errors/handleError";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { auth } from "@/auth";

type ActionOptions = {
  code?: string;
  severity?: "low" | "medium" | "high" | "critical";
  layer?: "api" | "db" | "auth" | "validation" | "external";
  actionName?: string;
};

export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  action: T,
  options?: ActionOptions,
) {
  return async (...args: Parameters<T>): Promise<Awaited<ReturnType<T>>> => {
    const session = await auth();

    const userId = session?.user?.id ?? undefined;
    const organisationId = session?.user?.organisationId ?? undefined;

    try {
      return await action(...args);
    } catch (error) {
      const errorId = await handleError(error, {
        code: options?.code || ERROR_CODES.SYSTEM_UNEXPECTED,
        severity: options?.severity || "medium",
        system: { layer: options?.layer || "api" },
        context: {
          userId,
          organisationId,
          route: options?.actionName || action.name,
          method: "SERVER_ACTION",
        },
        metadata: {
          action: options?.actionName || action.name,
        },
      });

      throw new Error(`${options?.actionName || "ACTION_FAILED"}:${errorId}`);
    }
  };
}
