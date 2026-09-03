import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { clientDevices } from "@/db/client-sync-schema";
import { database } from "@/db/database";
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
]);

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
