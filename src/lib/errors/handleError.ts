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

      userId: options?.context?.userId ?? null,
      organisationId: options?.context?.organisationId ?? null,
      route: options?.context?.route ?? null,
      method: options?.context?.method ?? null,

      metadata: JSON.stringify({
        stack,
        ...options?.metadata,
      }),

      resolved: false,
    });
  } catch (loggingError) {
    console.error("❌ Failed to log error:", loggingError);
  }

  return id;
}