import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads, jobs } from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";
import {
  processSyncEvent,
  syncPushSchema,
} from "@/lib/client-api/sync";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";
import { syncJobStatus } from "@/modules/jobs/core/syncJobStatus";

export const dynamic = "force-dynamic";

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
    columns: {
      id: true,
      jobId: true,
      direction: true,
      status: true,
    },
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
      // Yard continuity wins. DWT preparation can be retried from the DWT Centre.
      console.error("[CLIENT_SYNC] Could not auto-prepare DWT receipt", {
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

    const parsed = syncPushSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_SYNC_BATCH",
        400,
        "The Waste X sync batch is invalid.",
        parsed.error.flatten(),
      );
    }

    if (parsed.data.deviceId !== context.deviceId) {
      return clientApiError(
        "DEVICE_MISMATCH",
        403,
        "The sync batch does not belong to this Waste X device.",
      );
    }

    // Process in device order so a sequence of offline state transitions is
    // replayed in the same order the operator performed them.
    const orderedEvents = [...parsed.data.events].sort(
      (a, b) => a.deviceSequence - b.deviceSequence,
    );

    const results = [];
    for (const event of orderedEvents) {
      const eventResult = await processSyncEvent(context, event);
      results.push(eventResult);

      if (eventResult.status === "APPLIED" && event.entityType === "job_load") {
        try {
          await runPostApplyHooks({
            organisationId: context.organisationId,
            userId: context.userId,
            entityId: event.entityId,
            eventType: event.eventType,
          });
        } catch (error) {
          // The event itself is already durable. Derived Cloud work is retryable
          // and must never make the Desktop replay an applied physical event.
          console.error("[CLIENT_SYNC] Post-apply hook failed", {
            eventId: event.eventId,
            error,
          });
        }
      }
    }

    return clientApiJson({
      ok: true,
      protocolVersion: 1,
      batchId: parsed.data.batchId,
      results,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
