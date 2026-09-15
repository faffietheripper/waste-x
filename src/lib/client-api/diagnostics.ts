import { and, eq } from "drizzle-orm";
import { z } from "zod";

import {
  clientDevices,
  type ClientDeviceType,
  type PlatformDiagnosticCategory,
  type PlatformDiagnosticOutcome,
  type PlatformDiagnosticSeverity,
  type PlatformDiagnosticSurface,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { requireClientApiContext } from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import { recordPlatformDiagnostic } from "@/lib/platform-diagnostics/recordPlatformDiagnostic";

const categories = [
  "auth",
  "network",
  "api",
  "validation",
  "sync",
  "workflow",
  "database",
  "external",
  "device",
  "unknown",
] as const satisfies readonly PlatformDiagnosticCategory[];

const severities = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const satisfies readonly PlatformDiagnosticSeverity[];

const outcomes = [
  "FAILED",
  "RETRYING",
  "REJECTED",
  "CONFLICT",
  "RECOVERED",
  "RESOLVED",
] as const satisfies readonly PlatformDiagnosticOutcome[];

const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const diagnosticSchema = z.object({
  code: z.string().trim().min(1).max(120),
  operation: z.string().trim().min(1).max(160),
  safeMessage: z.string().trim().min(1).max(1000),

  severity: z.enum(severities).optional(),
  category: z.enum(categories).optional(),
  outcome: z.enum(outcomes).optional(),

  route: z.string().trim().max(240).optional().nullable(),
  method: z.string().trim().max(16).optional().nullable(),

  entityType: z.string().trim().max(160).optional().nullable(),
  entityId: z.string().trim().max(160).optional().nullable(),

  correlationId: z.string().trim().max(160).optional().nullable(),
  clientVersion: z.string().trim().max(80).optional().nullable(),

  occurredAt: z.string().datetime({ offset: true }).optional(),

  safeContext: z.record(scalar).optional(),
});

type ExpectedClient = {
  deviceType: ClientDeviceType;
  surface: Exclude<PlatformDiagnosticSurface, "WEB" | "SERVER">;
};

export async function handleClientDiagnosticPost(
  request: Request,
  expected: ExpectedClient,
) {
  try {
    const context = await requireClientApiContext(request);

    const device = await database.query.clientDevices.findFirst({
      where: and(
        eq(clientDevices.id, context.deviceId),
        eq(clientDevices.organisationId, context.organisationId),
        eq(clientDevices.deviceType, expected.deviceType),
        eq(clientDevices.status, "ACTIVE"),
      ),
      columns: {
        id: true,
        defaultSiteId: true,
      },
    });

    if (!device) {
      return clientApiError(
        "DIAGNOSTIC_DEVICE_UNAVAILABLE",
        403,
        "This device is not authorised to submit Waste X diagnostics.",
      );
    }

    const parsed = diagnosticSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_DIAGNOSTIC_REQUEST",
        400,
        "The diagnostic envelope is incomplete or invalid.",
      );
    }

    const input = parsed.data;
    const occurredAt = input.occurredAt
      ? new Date(input.occurredAt)
      : new Date();

    const recorded = await recordPlatformDiagnostic({
      organisationId: context.organisationId,
      userId: context.userId,
      deviceId: context.deviceId,
      siteId: device.defaultSiteId,
      surface: expected.surface,
      clientVersion:
        input.clientVersion ??
        request.headers.get("x-waste-x-client-version"),
      severity: input.severity,
      category: input.category,
      code: input.code,
      operation: input.operation,
      route: input.route,
      method: input.method,
      entityType: input.entityType,
      entityId: input.entityId,
      correlationId: input.correlationId,
      safeMessage: input.safeMessage,
      safeContext: input.safeContext,
      outcome: input.outcome,
      occurredAt,
    });

    /*
      Diagnostics are best-effort telemetry and must not create a retry storm
      or block the customer workflow that originally experienced the problem.
    */
    return clientApiJson(
      {
        ok: true,
        recorded: Boolean(recorded),
        diagnosticId: recorded?.id ?? null,
        correlationId: recorded?.correlationId ?? input.correlationId ?? null,
      },
      { status: 202 },
    );
  } catch (error) {
    return handleClientApiError(error);
  }
}
