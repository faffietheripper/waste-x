import { database } from "@/db/database";
import { errorLogs } from "@/db/schema";
import { HandleErrorOptions } from "./types";

export async function handleError(
  error: unknown,
  options?: HandleErrorOptions,
) {
  const id = crypto.randomUUID();

  const message = error instanceof Error ? error.message : "Unknown error";

  const stack = error instanceof Error ? error.stack : null;

  try {
    await database.insert(errorLogs).values({
      id,
      message,
      code: options?.code || "SYS_001",
      severity: options?.severity || "medium",
      layer: options?.system?.layer || "api",

      userId: options?.context?.userId,
      organisationId: options?.context?.organisationId,
      route: options?.context?.route,
      method: options?.context?.method,

      metadata: JSON.stringify({
        stack,
        ...options?.metadata,
      }),
    });
  } catch (loggingError) {
    console.error("❌ Failed to log error:", loggingError);
  }

  return id;
}
