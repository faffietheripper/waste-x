import crypto from "crypto";
import { and, eq, isNull } from "drizzle-orm";

import {
  platformDiagnosticEvents,
  type PlatformDiagnosticCategory,
  type PlatformDiagnosticOutcome,
  type PlatformDiagnosticSafeContext,
  type PlatformDiagnosticSeverity,
  type PlatformDiagnosticSurface,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";

type SafeScalar = string | number | boolean | null;

const SAFE_CONTEXT_KEYS = new Set([
  "jobId",
  "jobNumber",
  "jobLoadId",
  "loadNumber",
  "ticketNumber",
  "assignmentId",
  "listingId",
  "wasteTrackingId",
  "syncEventId",
  "syncResultStatus",
  "reasonCode",
  "retryCount",
  "retryState",
  "httpStatus",
  "expectedVersion",
  "actualVersion",
  "clientState",
  "previousState",
  "nextState",
  "queueState",
  "operationId",
]);

const MAX_SAFE_MESSAGE = 500;
const MAX_CONTEXT_STRING = 240;
const MAX_CODE = 120;
const MAX_OPERATION = 160;
const MAX_ENTITY = 160;
const MAX_ROUTE = 240;
const MAX_VERSION = 80;
const MAX_CORRELATION = 160;

export type RecordPlatformDiagnosticInput = {
  organisationId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
  siteId?: string | null;

  surface: PlatformDiagnosticSurface;
  clientVersion?: string | null;

  severity?: PlatformDiagnosticSeverity;
  category?: PlatformDiagnosticCategory;

  code: string;
  operation: string;
  route?: string | null;
  method?: string | null;

  entityType?: string | null;
  entityId?: string | null;

  correlationId?: string | null;

  safeMessage: string;
  safeContext?: Record<string, unknown> | null;

  outcome?: PlatformDiagnosticOutcome;
  occurredAt?: Date | null;
};

function clamp(value: string | null | undefined, max: number) {
  const clean = value?.trim();
  if (!clean) return null;
  return clean.slice(0, max);
}

function redactKnownSecrets(value: string) {
  return value
    .replace(/\bBearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(
      /\b(password|passwd|secret|token|authorization|cookie|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[REDACTED]",
    )
    .replace(
      /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
      "[REDACTED_TOKEN]",
    );
}

function safeMessage(value: string) {
  const flattened = value.replace(/\s+/g, " ").trim();
  return redactKnownSecrets(flattened).slice(0, MAX_SAFE_MESSAGE);
}

export function sanitiseDiagnosticContext(
  input: Record<string, unknown> | null | undefined,
): PlatformDiagnosticSafeContext {
  if (!input) return {};

  const output: PlatformDiagnosticSafeContext = {};

  for (const [key, raw] of Object.entries(input)) {
    if (!SAFE_CONTEXT_KEYS.has(key)) continue;

    if (
      raw === null ||
      typeof raw === "number" ||
      typeof raw === "boolean"
    ) {
      output[key] = raw as SafeScalar;
      continue;
    }

    if (typeof raw === "string") {
      output[key] = redactKnownSecrets(raw.trim()).slice(0, MAX_CONTEXT_STRING);
    }
  }

  return output;
}

export async function recordPlatformDiagnostic(
  input: RecordPlatformDiagnosticInput,
) {
  const id = crypto.randomUUID();
  const correlationId =
    clamp(input.correlationId, MAX_CORRELATION) ?? crypto.randomUUID();

  try {
    await database.insert(platformDiagnosticEvents).values({
      id,
      organisationId: input.organisationId ?? null,
      userId: input.userId ?? null,
      deviceId: input.deviceId ?? null,
      siteId: input.siteId ?? null,
      surface: input.surface,
      clientVersion: clamp(input.clientVersion, MAX_VERSION),
      severity: input.severity ?? "medium",
      category: input.category ?? "unknown",
      code: clamp(input.code, MAX_CODE) ?? "UNKNOWN_DIAGNOSTIC",
      operation: clamp(input.operation, MAX_OPERATION) ?? "unknown",
      route: clamp(input.route, MAX_ROUTE),
      method: clamp(input.method, 16)?.toUpperCase() ?? null,
      entityType: clamp(input.entityType, MAX_ENTITY),
      entityId: clamp(input.entityId, MAX_ENTITY),
      correlationId,
      safeMessage:
        safeMessage(input.safeMessage) || "Waste X recorded a diagnostic event.",
      safeContext: sanitiseDiagnosticContext(input.safeContext),
      outcome: input.outcome ?? "FAILED",
      occurredAt: input.occurredAt ?? new Date(),
    });

    return { id, correlationId };
  } catch {
    /*
      Diagnostics must never become a new failure mode for customer operations.
      Deliberately do not print the caller's payload/context here.
    */
    console.error("PLATFORM_DIAGNOSTIC_RECORD_FAILED");
    return null;
  }
}

export async function resolvePlatformDiagnostic(
  diagnosticId: string,
  outcome: Extract<PlatformDiagnosticOutcome, "RECOVERED" | "RESOLVED"> = "RESOLVED",
) {
  try {
    await database
      .update(platformDiagnosticEvents)
      .set({
        outcome,
        resolvedAt: new Date(),
      })
      .where(
        and(
          eq(platformDiagnosticEvents.id, diagnosticId),
          isNull(platformDiagnosticEvents.resolvedAt),
        ),
      );

    return true;
  } catch {
    console.error("PLATFORM_DIAGNOSTIC_RESOLVE_FAILED");
    return false;
  }
}
