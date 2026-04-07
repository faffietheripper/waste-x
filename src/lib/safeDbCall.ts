import { handleError } from "@/lib/errors/handleError";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export async function safeDbCall<T>(
  fn: () => Promise<T>,
  context?: {
    userId?: string;
    organisationId?: string;
  },
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const errorId = await handleError(error, {
      code: ERROR_CODES.DB_CONNECTION_FAILED,
      severity: "high",
      system: { layer: "db" },
      context,
    });

    throw new Error(`DB_ERROR:${errorId}`);
  }
}
