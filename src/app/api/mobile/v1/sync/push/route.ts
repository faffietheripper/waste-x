import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { clientDevices, syncChangeFeed } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  jobLoadFieldStates,
  type JobLoadFieldEventType,
  type JobLoadFieldStep,
} from "@/db/mobile-field-schema";
import { drivers, jobLoads, jobs, users } from "@/db/schema";
import {
  ClientApiAuthError,
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import { processSyncEvent, syncPushSchema } from "@/lib/client-api/sync";
import { preflightSyncEvent } from "@/lib/client-api/sync-preflight";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";
import { syncJobStatus } from "@/modules/jobs/core/syncJobStatus";

export const dynamic = "force-dynamic";

const SHA256_HEX = /^[a-f0-9]{64}$/i;
const MOBILE_EVENT_TYPES = new Set([
  "LOAD_ARRIVED",
  "LOAD_DETAILS_UPDATED",
  "LOAD_COMPLETED",
  "FIELD_JOB_STARTED",
  "FIELD_EN_ROUTE",
  "FIELD_ARRIVED_COLLECTION",
  "FIELD_COLLECTED",
  "FIELD_IN_TRANSIT",
  "FIELD_ARRIVED_DESTINATION",
  "FIELD_DELIVERED",
  "FIELD_DELIVERY_NOTE_ADDED",
  "FIELD_ISSUE_REPORTED",
]);

const FIELD_EVENT_STEPS: Record<JobLoadFieldEventType, JobLoadFieldStep> = {
  FIELD_JOB_STARTED: "STARTED",
  FIELD_EN_ROUTE: "EN_ROUTE",
  FIELD_ARRIVED_COLLECTION: "ARRIVED_COLLECTION",
  FIELD_COLLECTED: "COLLECTED",
  FIELD_IN_TRANSIT: "IN_TRANSIT",
  FIELD_ARRIVED_DESTINATION: "ARRIVED_DESTINATION",
  FIELD_DELIVERED: "DELIVERED",
};

function isFieldWorkflowEvent(value: string): value is JobLoadFieldEventType {
  return value in FIELD_EVENT_STEPS;
}

function attemptsMobileTicketAuthority(event: {
  eventType: string;
  payload: unknown;
}) {
  if (event.eventType !== "LOAD_DETAILS_UPDATED") return false;
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    return false;
  }
  return Object.prototype.hasOwnProperty.call(event.payload, "ticketNumber");
}

async function resolveMobileDriver(context: {
  userId: string;
  organisationId: string;
}) {
  const user = await database.query.users.findFirst({
    where: and(
      eq(users.id, context.userId),
      eq(users.organisationId, context.organisationId),
    ),
    columns: { id: true, email: true },
  });

  if (!user) {
    throw new ClientApiAuthError(
      "ACCOUNT_UNAVAILABLE",
      403,
      "This Waste X account is unavailable.",
    );
  }

  const matches = await database
    .select({ id: drivers.id })
    .from(drivers)
    .where(
      and(
        eq(drivers.organisationId, context.organisationId),
        eq(drivers.isActive, true),
        sql`lower(trim(${drivers.email})) = ${user.email.toLowerCase().trim()}`,
      ),
    )
    .orderBy(asc(drivers.id))
    .limit(2);

  if (matches.length !== 1) {
    throw new ClientApiAuthError(
      "MOBILE_DRIVER_SCOPE_UNAVAILABLE",
      403,
      matches.length === 0
        ? "This Waste X account is not uniquely linked to an active Driver."
        : "More than one active Driver matches this Waste X account.",
    );
  }

  return matches[0]!.id;
}

async function isAssignedLoad(
  organisationId: string,
  driverId: string,
  loadId: string,
) {
  const [assignment] = await database
    .select({ loadId: jobLoads.id })
    .from(jobLoads)
    .innerJoin(
      jobs,
      and(
        eq(jobLoads.jobId, jobs.id),
        eq(jobLoads.organisationId, jobs.organisationId),
      ),
    )
    .where(
      and(
        eq(jobLoads.id, loadId),
        eq(jobLoads.organisationId, organisationId),
        or(
          eq(jobLoads.driverId, driverId),
          and(isNull(jobLoads.driverId), eq(jobs.driverId, driverId)),
        ),
      ),
    )
    .limit(1);

  return Boolean(assignment);
}

async function ensureFieldStateMirror({
  organisationId,
  entityId,
  eventType,
  occurredAt,
  entityVersion,
}: {
  organisationId: string;
  entityId: string;
  eventType: string;
  occurredAt: string;
  entityVersion: number | null;
}) {
  if (!isFieldWorkflowEvent(eventType) || entityVersion === null) return;

  const step = FIELD_EVENT_STEPS[eventType];
  const occurred = new Date(occurredAt);

  await database.transaction(async (tx) => {
    const existing = await tx.query.jobLoadFieldStates.findFirst({
      where: and(
        eq(jobLoadFieldStates.jobLoadId, entityId),
        eq(jobLoadFieldStates.organisationId, organisationId),
      ),
    });

    if (
      existing?.step === step &&
      existing.lastEventType === eventType &&
      existing.occurredAt?.toISOString() === occurred.toISOString()
    ) {
      return;
    }

    const load = await tx.query.jobLoads.findFirst({
      where: and(
        eq(jobLoads.id, entityId),
        eq(jobLoads.organisationId, organisationId),
      ),
    });
    if (!load) throw new Error("MOBILE_FIELD_MIRROR_LOAD_NOT_FOUND");

    const parentJob = await tx.query.jobs.findFirst({
      where: and(
        eq(jobs.id, load.jobId),
        eq(jobs.organisationId, organisationId),
      ),
      columns: { ownSiteId: true },
    });

    const now = new Date();
    await tx
      .insert(jobLoadFieldStates)
      .values({
        jobLoadId: entityId,
        organisationId,
        step,
        lastEventType: eventType,
        occurredAt: occurred,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: jobLoadFieldStates.jobLoadId,
        set: {
          organisationId,
          step,
          lastEventType: eventType,
          occurredAt: occurred,
          updatedAt: now,
        },
      });

    await tx.insert(syncChangeFeed).values({
      organisationId,
      siteId: load.ownSiteId ?? parentJob?.ownSiteId ?? null,
      entityType: "job_load",
      entityId,
      entityVersion,
      changeType: "UPSERT",
      payload: {
        ...load,
        fieldWorkflow: {
          step,
          updatedAt: occurredAt,
          lastEventType: eventType,
        },
      },
      changedAt: now,
    });
  });
}

async function runPostApplyHooks({
  organisationId,
  userId,
  entityId,
  eventType,
}: {
  organisationId: string;
  userId: string;
  entityId: string;
  eventType: string;
}) {
  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, entityId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: { id: true, jobId: true, direction: true, status: true },
  });

  if (!load) return;

  await syncJobStatus(load.jobId, organisationId);

  const parentJob = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, load.jobId),
      eq(jobs.organisationId, organisationId),
    ),
  });

  if (parentJob) {
    await recordSyncChange({
      organisationId,
      siteId: parentJob.ownSiteId,
      entityType: "job",
      entityId: parentJob.id,
      payload: parentJob,
    });
  }

  if (
    eventType === "LOAD_COMPLETED" &&
    load.direction === "incoming" &&
    load.status === "completed"
  ) {
    try {
      await prepareJobLoadWasteReceipt({
        organisationId,
        jobLoadId: load.id,
        receivedByUserId: userId,
      });
    } catch (error) {
      console.error("[MOBILE_SYNC] Could not auto-prepare DWT receipt", {
        jobLoadId: load.id,
        error,
      });
    }
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const device = await database.query.clientDevices.findFirst({
      where: and(
        eq(clientDevices.id, context.deviceId),
        eq(clientDevices.organisationId, context.organisationId),
        eq(clientDevices.deviceType, "MOBILE"),
        eq(clientDevices.status, "ACTIVE"),
      ),
      columns: { id: true },
    });

    if (!device) {
      return clientApiError(
        "MOBILE_DEVICE_REQUIRED",
        403,
        "This sync endpoint is available only to an authorised Waste X Mobile device.",
      );
    }

    const requestBody = await request.json();
    if (
      requestBody &&
      typeof requestBody === "object" &&
      Array.isArray((requestBody as { events?: unknown }).events) &&
      (requestBody as { events: unknown[] }).events.some((event) => {
        if (!event || typeof event !== "object") return true;
        const payloadHash = (event as { payloadHash?: unknown }).payloadHash;
        return typeof payloadHash !== "string" || !SHA256_HEX.test(payloadHash);
      })
    ) {
      return clientApiError(
        "INVALID_SYNC_PAYLOAD_HASH",
        400,
        "Every Waste X sync event must include a valid SHA-256 payload hash.",
      );
    }

    const parsed = syncPushSchema.safeParse(requestBody);
    if (!parsed.success) {
      return clientApiError(
        "INVALID_SYNC_BATCH",
        400,
        "The Waste X Mobile sync batch is invalid.",
        parsed.error.flatten(),
      );
    }

    if (parsed.data.deviceId !== context.deviceId) {
      return clientApiError(
        "DEVICE_MISMATCH",
        403,
        "The sync batch does not belong to this Waste X Mobile device.",
      );
    }

    const driverId = await resolveMobileDriver(context);
    const orderedEvents = [...parsed.data.events].sort(
      (left, right) => left.deviceSequence - right.deviceSequence,
    );

    const results = [];
    for (const event of orderedEvents) {
      if (
        event.entityType !== "job_load" ||
        !MOBILE_EVENT_TYPES.has(event.eventType)
      ) {
        results.push({
          eventId: event.eventId,
          status: "REJECTED" as const,
          entityVersion: null,
          reasonCode: "MOBILE_EVENT_NOT_ALLOWED",
        });
        continue;
      }

      // Stage 13 authority boundary: Driver/Mobile may confirm field facts and
      // quantities, but it may never create, clear or replace the canonical
      // management-site ticket number. Desktop/site is the only issuer.
      if (attemptsMobileTicketAuthority(event)) {
        results.push({
          eventId: event.eventId,
          status: "REJECTED" as const,
          entityVersion: null,
          reasonCode: "MOBILE_TICKET_AUTHORITY_VIOLATION",
        });
        continue;
      }

      if (!(await isAssignedLoad(context.organisationId, driverId, event.entityId))) {
        results.push({
          eventId: event.eventId,
          status: "REJECTED" as const,
          entityVersion: null,
          reasonCode: "MOBILE_LOAD_NOT_ASSIGNED",
        });
        continue;
      }

      const preflightResult = await preflightSyncEvent(context, event);
      const eventResult =
        preflightResult ?? (await processSyncEvent(context, event));

      if (
        (eventResult.status === "APPLIED" || eventResult.status === "DUPLICATE") &&
        isFieldWorkflowEvent(event.eventType)
      ) {
        try {
          await ensureFieldStateMirror({
            organisationId: context.organisationId,
            entityId: event.entityId,
            eventType: event.eventType,
            occurredAt: event.occurredAt,
            entityVersion: eventResult.entityVersion,
          });
        } catch (error) {
          console.error("[MOBILE_SYNC] Field-state mirror pending", {
            eventId: event.eventId,
            error,
          });
          results.push({
            eventId: event.eventId,
            status: "RETRYABLE_ERROR" as const,
            entityVersion: eventResult.entityVersion,
            reasonCode: "FIELD_STATE_MIRROR_PENDING",
          });
          continue;
        }
      }

      results.push(eventResult);

      if (eventResult.status === "APPLIED") {
        try {
          await runPostApplyHooks({
            organisationId: context.organisationId,
            userId: context.userId,
            entityId: event.entityId,
            eventType: event.eventType,
          });
        } catch (error) {
          console.error("[MOBILE_SYNC] Post-apply hook failed", {
            eventId: event.eventId,
            error,
          });
        }
      }
    }

    return clientApiJson({
      ok: true,
      protocolVersion: 1 as const,
      batchId: parsed.data.batchId,
      results,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
