import { and, desc, eq } from "drizzle-orm";

import { syncEventInbox } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  counterpartySites,
  jobLoads,
} from "@/db/schema";
import { type ClientApiContext } from "./auth";
import { type SyncEventInput } from "./sync";

type PreflightResult = {
  eventId: string;
  status: "DUPLICATE" | "REJECTED";
  entityVersion: number | null;
  reasonCode?: string;
};

function result(
  eventId: string,
  status: PreflightResult["status"],
  entityVersion: number | null,
  reasonCode?: string,
): PreflightResult {
  return {
    eventId,
    status,
    entityVersion,
    ...(reasonCode ? { reasonCode } : {}),
  };
}

async function persistRejection(
  context: ClientApiContext,
  event: SyncEventInput,
  reasonCode: string,
): Promise<PreflightResult> {
  const existing = await database.query.syncEventInbox.findFirst({
    where: eq(syncEventInbox.eventId, event.eventId),
    columns: {
      payloadHash: true,
      resultEntityVersion: true,
      reasonCode: true,
    },
  });

  if (existing) {
    if (existing.payloadHash !== event.payloadHash) {
      return result(event.eventId, "REJECTED", null, "EVENT_ID_REUSED");
    }

    return result(
      event.eventId,
      "DUPLICATE",
      existing.resultEntityVersion,
      existing.reasonCode ?? undefined,
    );
  }

  const sequenceCollision = await database.query.syncEventInbox.findFirst({
    where: and(
      eq(syncEventInbox.deviceId, context.deviceId),
      eq(syncEventInbox.deviceSequence, event.deviceSequence),
    ),
    columns: { eventId: true },
  });

  if (sequenceCollision) {
    return result(event.eventId, "REJECTED", null, "DEVICE_SEQUENCE_REUSED");
  }

  await database.insert(syncEventInbox).values({
    eventId: event.eventId,
    organisationId: context.organisationId,
    siteId: event.siteId,
    deviceId: context.deviceId,
    actorUserId: context.userId,
    entityType: event.entityType,
    entityId: event.entityId,
    eventType: event.eventType,
    baseVersion: event.baseVersion,
    deviceSequence: event.deviceSequence,
    payload: event.payload,
    payloadHash: event.payloadHash,
    occurredAt: new Date(event.occurredAt),
    recordedAt: new Date(event.recordedAt),
    resultStatus: "REJECTED",
    resultEntityVersion: null,
    reasonCode,
  });

  return result(event.eventId, "REJECTED", null, reasonCode);
}

/**
 * Protects Cloud-side rules that must be rechecked when an operation was made
 * offline. The Desktop cache is useful for yard continuity, but it is never
 * trusted as the final authority for current third-party authorisations.
 */
export async function preflightSyncEvent(
  context: ClientApiContext,
  event: SyncEventInput,
): Promise<PreflightResult | null> {
  if (
    event.organisationId !== context.organisationId ||
    event.deviceId !== context.deviceId ||
    event.actorUserId !== context.userId
  ) {
    // Let the canonical processor return AUTH_CONTEXT_MISMATCH.
    return null;
  }

  if (event.entityType !== "job_load" || event.eventType !== "LOAD_COMPLETED") {
    return null;
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, event.entityId),
      eq(jobLoads.organisationId, context.organisationId),
    ),
    columns: {
      direction: true,
      wasteDescriptionSnapshot: true,
      thirdPartyDestinationSiteId: true,
      ewcCodeId: true,
    },
  });

  if (!load || load.direction !== "outgoing") {
    // The canonical processor owns LOAD_NOT_FOUND and incoming rules.
    return null;
  }

  if (!load.wasteDescriptionSnapshot?.trim()) {
    return persistRejection(context, event, "WASTE_DESCRIPTION_REQUIRED");
  }

  if (!load.thirdPartyDestinationSiteId || !load.ewcCodeId) {
    return persistRejection(
      context,
      event,
      "EXTERNAL_FACILITY_PERMIT_MISMATCH",
    );
  }

  const [authorisation] = await database
    .select({ authorisationId: counterpartySiteAuthorisations.id })
    .from(counterpartySiteAuthorisations)
    .innerJoin(
      counterpartySites,
      eq(counterpartySites.id, counterpartySiteAuthorisations.counterpartySiteId),
    )
    .innerJoin(
      counterpartySiteEwcCodes,
      eq(
        counterpartySiteEwcCodes.authorisationId,
        counterpartySiteAuthorisations.id,
      ),
    )
    .where(
      and(
        eq(counterpartySiteAuthorisations.organisationId, context.organisationId),
        eq(
          counterpartySiteAuthorisations.counterpartySiteId,
          load.thirdPartyDestinationSiteId,
        ),
        eq(counterpartySiteAuthorisations.status, "active"),
        eq(counterpartySites.organisationId, context.organisationId),
        eq(counterpartySites.siteType, "third_party_tip"),
        eq(counterpartySites.isActive, true),
        eq(counterpartySiteEwcCodes.organisationId, context.organisationId),
        eq(counterpartySiteEwcCodes.ewcCodeId, load.ewcCodeId),
        eq(counterpartySiteEwcCodes.isActive, true),
      ),
    )
    .orderBy(desc(counterpartySiteAuthorisations.isPrimary))
    .limit(1);

  if (!authorisation) {
    return persistRejection(
      context,
      event,
      "EXTERNAL_FACILITY_PERMIT_MISMATCH",
    );
  }

  return null;
}
