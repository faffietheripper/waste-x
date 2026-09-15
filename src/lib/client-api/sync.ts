import crypto from "node:crypto";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import {
  syncChangeFeed,
  syncEntityVersions,
  syncEventInbox,
  type SyncResultStatus,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  auditEvents,
  drivers,
  jobLoadWasteItems,
  jobLoads,
  jobs,
  sites,
  vehicles,
} from "@/db/schema";
import { resolvePermitEwcAcceptance } from "@/modules/permits/core/resolvePermitEwcAcceptance";
import { type ClientApiContext } from "./auth";

export const syncEventSchema = z.object({
  schemaVersion: z.literal(1),
  eventId: z.string().uuid(),
  organisationId: z.string().min(1),
  siteId: z.string().min(1).nullable(),
  deviceId: z.string().uuid(),
  actorUserId: z.string().min(1),
  entityType: z.enum(["job", "job_load", "ticket", "evidence", "operational_event"]),
  entityId: z.string().min(1),
  eventType: z.string().min(1),
  baseVersion: z.number().int().nonnegative().nullable(),
  deviceSequence: z.number().int().positive(),
  occurredAt: z.string().datetime({ offset: true }),
  recordedAt: z.string().datetime({ offset: true }),
  payload: z.unknown(),
  payloadHash: z.string().min(1),
});

export const syncPushSchema = z.object({
  protocolVersion: z.literal(1),
  deviceId: z.string().uuid(),
  batchId: z.string().min(1).max(200),
  events: z.array(syncEventSchema).min(1).max(250),
});

export type SyncEventInput = z.infer<typeof syncEventSchema>;

class SyncBusinessRuleError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "SyncBusinessRuleError";
  }
}

/*
 * WASTE_X_DESKTOP_COMPLETION_PAYLOAD_COMPAT_V1
 *
 * Desktop stores decimal weights as strings in its encrypted working-set
 * payload. Older multi-item completion events therefore sent "8.200" rather
 * than 8.2 for Waste Item allocations. Accept that exact wire-compatible
 * representation at the Cloud boundary and normalise it to a number.
 */
const syncWasteItemWeightAmountSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    return trimmed ? Number(trimmed) : value;
  },
  z.number().nonnegative().nullable().optional(),
);

const loadDetailsPayloadSchema = z.object({
  driverId: z.string().min(1).nullable().optional(),
  vehicleId: z.string().min(1).nullable().optional(),
  wasteDescription: z.string().trim().min(1).optional(),
  grossWeight: z.number().nonnegative().nullable().optional(),
  tareWeight: z.number().nonnegative().nullable().optional(),
  netWeight: z.number().nonnegative().nullable().optional(),
  weightMetric: z.enum(["Grams", "Kilograms", "Tonnes"]).optional(),
  weightIsEstimate: z.boolean().optional(),
  notes: z.string().trim().nullable().optional(),
  wasteItems: z
    .array(
      z.object({
        id: z.string().min(1),
        weightAmount: syncWasteItemWeightAmountSchema,
        weightIsEstimate: z.boolean().optional(),
      }),
    )
    .max(12)
    .optional(),
});

const manualSiteArrivalReasonSchema = z.enum([
  "DRIVER_NO_MOBILE_ACCESS",
  "DRIVER_DEVICE_UNAVAILABLE",
  "CONNECTIVITY_ISSUE",
  "SITE_CONFIRMED_PHYSICAL_ARRIVAL",
  "OTHER",
]);

const loadArrivedPayloadSchema = z.object({
  arrivalMode: z
    .enum(["external_carrier", "manual_site_fallback"])
    .optional(),
  manualArrivalReason: manualSiteArrivalReasonSchema.optional(),
  manualArrivalNote: z.string().trim().max(2000).nullable().optional(),
  physicalArrivalConfirmed: z.boolean().optional(),
});

const MANUAL_SITE_ARRIVAL_REASON_LABELS: Record<
  z.infer<typeof manualSiteArrivalReasonSchema>,
  string
> = {
  DRIVER_NO_MOBILE_ACCESS: "Driver has no Mobile access",
  DRIVER_DEVICE_UNAVAILABLE: "Driver phone / device unavailable",
  CONNECTIVITY_ISSUE: "Connectivity issue",
  SITE_CONFIRMED_PHYSICAL_ARRIVAL: "Site confirmed physical arrival",
  OTHER: "Other",
};

const siteTicketPayloadSchema = z.object({
  ticketNumber: z.string().trim().min(1).max(200),
});

const rejectPayloadSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

const fieldCollectionRejectPayloadSchema = z.object({
  reason: z.string().trim().min(3).max(2000),
});

const fieldIssueTypeSchema = z.enum([
  "DELAY",
  "SITE_ACCESS",
  "WASTE_MISMATCH",
  "VEHICLE",
  "SAFETY",
  "OTHER",
]);

const fieldDeliveryNotePayloadSchema = z.object({
  note: z.string().trim().min(2).max(2000),
});

const fieldIssuePayloadSchema = z.object({
  issueType: fieldIssueTypeSchema,
  summary: z.string().trim().min(3).max(2000),
});

const fieldWorkflowStepSchema = z.enum([
  "ASSIGNED",
  "COLLECTED",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION",
]);

const fieldWorkflowPayloadSchema = z.object({
  fromStep: fieldWorkflowStepSchema,
  toStep: fieldWorkflowStepSchema,
});

type FieldWorkflowStep = z.infer<typeof fieldWorkflowStepSchema>;
type FieldWorkflowEventType =
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION";

const FIELD_WORKFLOW_TRANSITIONS: Record<
  FieldWorkflowEventType,
  { fromStep: FieldWorkflowStep; toStep: FieldWorkflowStep }
> = {
  FIELD_COLLECTED: { fromStep: "ASSIGNED", toStep: "COLLECTED" },
  FIELD_IN_TRANSIT: { fromStep: "COLLECTED", toStep: "IN_TRANSIT" },
  FIELD_ARRIVED_DESTINATION: {
    fromStep: "IN_TRANSIT",
    toStep: "ARRIVED_DESTINATION",
  },
};

const ACTIVE_FIELD_EVENT_TYPES = Object.keys(FIELD_WORKFLOW_TRANSITIONS) as FieldWorkflowEventType[];
const LEGACY_FIELD_EVENT_TYPES = [
  "FIELD_JOB_STARTED",
  "FIELD_EN_ROUTE",
  "FIELD_ARRIVED_COLLECTION",
  "FIELD_COLLECTED",
  "FIELD_IN_TRANSIT",
  "FIELD_ARRIVED_DESTINATION",
  "FIELD_DELIVERED",
];

function isFieldWorkflowEventType(value: string): value is FieldWorkflowEventType {
  return value in FIELD_WORKFLOW_TRANSITIONS;
}

function normaliseFieldEventToStep(eventType: string): FieldWorkflowStep {
  if (eventType === "FIELD_COLLECTED") return "COLLECTED";
  if (eventType === "FIELD_IN_TRANSIT") return "IN_TRANSIT";
  if (eventType === "FIELD_ARRIVED_DESTINATION" || eventType === "FIELD_DELIVERED") {
    return "ARRIVED_DESTINATION";
  }
  return "ASSIGNED";
}

function toDbDecimal(value: number | null | undefined, scale = 3) {
  return value === undefined ? undefined : value === null ? null : value.toFixed(scale);
}

function appendOperationalNote(existing: string | null, heading: string, detail: string, timestamp: Date) {
  const entry = `[${heading} · ${timestamp.toISOString()}] ${detail}`;
  return existing?.trim() ? `${existing.trim()}\n${entry}` : entry;
}

function hashPayload(payload: unknown) {
  return crypto.createHash("sha256").update(JSON.stringify(payload ?? null)).digest("hex");
}

function result(eventId: string, status: SyncResultStatus, entityVersion: number | null, reasonCode?: string) {
  return { eventId, status, entityVersion, ...(reasonCode ? { reasonCode } : {}) };
}

async function validateSiteScope(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organisationId: string,
  siteId: string | null,
) {
  if (!siteId) return;
  const site = await tx.query.sites.findFirst({
    where: and(eq(sites.id, siteId), eq(sites.organisationId, organisationId)),
    columns: { id: true },
  });
  if (!site) throw new SyncBusinessRuleError("INVALID_SITE_SCOPE");
}

async function validateDriver(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organisationId: string,
  driverId: string | null,
  haulierCounterpartyId: string | null,
) {
  if (!driverId) return;
  const driver = await tx.query.drivers.findFirst({
    where: and(eq(drivers.id, driverId), eq(drivers.organisationId, organisationId), eq(drivers.isActive, true)),
    columns: { id: true, haulierCounterpartyId: true },
  });
  if (!driver) throw new SyncBusinessRuleError("INVALID_DRIVER");
  if (driver.haulierCounterpartyId !== haulierCounterpartyId) {
    throw new SyncBusinessRuleError("DRIVER_TRANSPORT_MISMATCH");
  }
}

async function validateVehicle(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organisationId: string,
  vehicleId: string | null,
  haulierCounterpartyId: string | null,
) {
  if (!vehicleId) return;
  const vehicle = await tx.query.vehicles.findFirst({
    where: and(eq(vehicles.id, vehicleId), eq(vehicles.organisationId, organisationId), eq(vehicles.isActive, true)),
    columns: { id: true, haulierCounterpartyId: true },
  });
  if (!vehicle) throw new SyncBusinessRuleError("INVALID_VEHICLE");
  if (vehicle.haulierCounterpartyId !== haulierCounterpartyId) {
    throw new SyncBusinessRuleError("VEHICLE_TRANSPORT_MISMATCH");
  }
}

async function validateIncomingPermit(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organisationId: string,
  permitId: string | null,
  siteId: string | null,
  ewcCodeId: string | null,
) {
  if (!permitId || !siteId || !ewcCodeId) {
    throw new SyncBusinessRuleError("PERMIT_MISMATCH");
  }

  const acceptance = await resolvePermitEwcAcceptance({
      organisationId,
      permitId,
      siteId,
      ewcCodeId,
    }, tx);

  if (!acceptance.allowed) {
    throw new SyncBusinessRuleError("PERMIT_MISMATCH");
  }

  return acceptance;
}

async function syncOperationalWasteItems(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  organisationId: string,
  jobLoadId: string,
) {
  return tx.query.jobLoadWasteItems.findMany({
    where: and(
      eq(jobLoadWasteItems.organisationId, organisationId),
      eq(jobLoadWasteItems.jobLoadId, jobLoadId),
    ),
    orderBy: (item, { asc }) => [asc(item.itemNumber)],
  });
}

function syncAllocationTolerance(
  metric: "Grams" | "Kilograms" | "Tonnes",
) {
  if (metric === "Grams") return 1;
  if (metric === "Kilograms") return 0.01;
  return 0.001;
}

async function applySyncWasteItemAllocations(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  params: {
    organisationId: string;
    jobLoadId: string;
    metric: "Grams" | "Kilograms" | "Tonnes";
    netWeight: number | null;
    inputs:
      | Array<{
          id: string;
          weightAmount?: number | null;
          weightIsEstimate?: boolean;
        }>
      | undefined;
    requireReconciled: boolean;
  },
) {
  const items = await syncOperationalWasteItems(
    tx,
    params.organisationId,
    params.jobLoadId,
  );

  if (items.length === 0) return;

  const inputById = new Map(
    (params.inputs ?? []).map((row) => [row.id, row]),
  );

  for (const item of items) {
    const supplied = inputById.get(item.id);
    if (!supplied) continue;

    await tx
      .update(jobLoadWasteItems)
      .set({
        weightAmount:
          supplied.weightAmount === undefined ||
          supplied.weightAmount === null
            ? item.weightAmount
            : supplied.weightAmount.toFixed(3),
        weightMetric: params.metric,
        weightIsEstimate:
          supplied.weightIsEstimate ?? item.weightIsEstimate,
        weightSource: "allocation",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobLoadWasteItems.id, item.id),
          eq(
            jobLoadWasteItems.organisationId,
            params.organisationId,
          ),
        ),
      );
  }

  const refreshed = await syncOperationalWasteItems(
    tx,
    params.organisationId,
    params.jobLoadId,
  );

  if (
    refreshed.length === 1 &&
    !refreshed[0].weightAmount &&
    params.netWeight !== null &&
    Number.isFinite(params.netWeight) &&
    params.netWeight > 0
  ) {
    await tx
      .update(jobLoadWasteItems)
      .set({
        weightAmount: params.netWeight.toFixed(3),
        weightMetric: params.metric,
        weightIsEstimate: false,
        weightSource: "allocation",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobLoadWasteItems.id, refreshed[0].id),
          eq(
            jobLoadWasteItems.organisationId,
            params.organisationId,
          ),
        ),
      );
    return;
  }

  if (
    !params.requireReconciled ||
    params.netWeight === null ||
    !Number.isFinite(params.netWeight) ||
    params.netWeight <= 0
  ) {
    return;
  }

  const finalItems = await syncOperationalWasteItems(
    tx,
    params.organisationId,
    params.jobLoadId,
  );
  const amounts = finalItems.map((item) =>
    Number(item.weightAmount ?? "0"),
  );

  if (
    amounts.some(
      (amount) => !Number.isFinite(amount) || amount <= 0,
    )
  ) {
    throw new SyncBusinessRuleError("WASTE_ITEM_WEIGHTS_REQUIRED");
  }

  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  if (
    Math.abs(total - params.netWeight) >
    syncAllocationTolerance(params.metric)
  ) {
    throw new SyncBusinessRuleError("WASTE_ITEM_WEIGHT_MISMATCH");
  }
}

async function validateIncomingWasteItems(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  load: typeof jobLoads.$inferSelect,
) {
  const items = await syncOperationalWasteItems(
    tx,
    context.organisationId,
    load.id,
  );

  if (items.length === 0) {
    return validateIncomingPermit(
      tx,
      context.organisationId,
      load.sitePermitId,
      load.ownSiteId,
      load.ewcCodeId,
    );
  }

  let primaryAcceptance:
    | Awaited<ReturnType<typeof validateIncomingPermit>>
    | null = null;

  for (const item of items) {
    const acceptance = await validateIncomingPermit(
      tx,
      context.organisationId,
      load.sitePermitId,
      load.ownSiteId,
      item.ewcCodeId,
    );

    primaryAcceptance ??= acceptance;

    await tx
      .update(jobLoadWasteItems)
      .set({
        permitEwcMatchType: acceptance.matchType,
        regulatoryAuthorityActivationId:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.activationId
            : null,
        regulatoryAcceptanceRuleId:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.authority.ruleId
            : null,
        regulatoryRuleKeySnapshot:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.authority.ruleKey
            : null,
        regulatoryRuleScopeSnapshot:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.authority.ruleScope
            : null,
        qualifyingAuthorisationRefSnapshot:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.authority.qualifyingAuthorisationRef
            : null,
        permitEwcBasis:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.basis
            : null,
        permitEwcReference:
          acceptance.matchType === "regulatory_authority"
            ? acceptance.reference
            : null,
        permitEwcCodeSnapshot:
          acceptance.permittedEwcCode || item.ewcCodeSnapshot,
        permitEwcCheckedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobLoadWasteItems.id, item.id),
          eq(
            jobLoadWasteItems.organisationId,
            context.organisationId,
          ),
        ),
      );
  }

  if (!primaryAcceptance) {
    throw new SyncBusinessRuleError("PERMIT_MISMATCH");
  }

  return primaryAcceptance;
}


async function latestFieldWorkflowEvent(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  entityId: string,
) {
  return tx.query.syncEventInbox.findFirst({
    where: and(
      eq(syncEventInbox.organisationId, context.organisationId),
      eq(syncEventInbox.entityType, "job_load"),
      eq(syncEventInbox.entityId, entityId),
      eq(syncEventInbox.resultStatus, "APPLIED"),
      inArray(syncEventInbox.eventType, LEGACY_FIELD_EVENT_TYPES),
    ),
    columns: { eventType: true },
    orderBy: [desc(syncEventInbox.occurredAt), desc(syncEventInbox.receivedAt)],
  });
}

async function currentFieldWorkflowStep(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  entityId: string,
): Promise<FieldWorkflowStep> {
  const previous = await latestFieldWorkflowEvent(tx, context, entityId);
  return previous ? normaliseFieldEventToStep(previous.eventType) : "ASSIGNED";
}

async function manualSiteArrivalExists(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  loadId: string,
) {
  const [manualArrival] = await tx
    .select({ id: auditEvents.id })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.organisationId, context.organisationId),
        eq(auditEvents.entityType, "job_load"),
        eq(auditEvents.entityId, loadId),
        eq(auditEvents.action, "MANUAL_SITE_ARRIVAL_CONFIRMED"),
      ),
    )
    .limit(1);

  return Boolean(manualArrival);
}

async function requireDriverDestinationForOwnTransport(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  load: { id: string; driverId: string | null; haulierCounterpartyId: string | null },
) {
  if (!load.driverId || load.haulierCounterpartyId) return;

  const step = await currentFieldWorkflowStep(tx, context, load.id);
  if (step === "ARRIVED_DESTINATION") return;

  if (!(await manualSiteArrivalExists(tx, context, load.id))) {
    throw new SyncBusinessRuleError("DRIVER_DESTINATION_ARRIVAL_REQUIRED");
  }
}

async function validateFieldWorkflowTransition(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  event: SyncEventInput,
) {
  if (!isFieldWorkflowEventType(event.eventType)) {
    throw new SyncBusinessRuleError("UNSUPPORTED_FIELD_WORKFLOW_EVENT");
  }
  const parsed = fieldWorkflowPayloadSchema.safeParse(event.payload);
  if (!parsed.success) throw new SyncBusinessRuleError("INVALID_FIELD_WORKFLOW_PAYLOAD");
  const transition = FIELD_WORKFLOW_TRANSITIONS[event.eventType];
  if (parsed.data.fromStep !== transition.fromStep || parsed.data.toStep !== transition.toStep) {
    throw new SyncBusinessRuleError("FIELD_WORKFLOW_PAYLOAD_MISMATCH");
  }
  const currentStep = await currentFieldWorkflowStep(tx, context, event.entityId);
  if (currentStep !== transition.fromStep) {
    throw new SyncBusinessRuleError("FIELD_WORKFLOW_OUT_OF_ORDER");
  }
}

async function applyJobLoadEvent(
  tx: Parameters<Parameters<typeof database.transaction>[0]>[0],
  context: ClientApiContext,
  event: SyncEventInput,
) {
  const load = await tx.query.jobLoads.findFirst({
    where: and(eq(jobLoads.id, event.entityId), eq(jobLoads.organisationId, context.organisationId)),
  });
  if (!load) throw new SyncBusinessRuleError("LOAD_NOT_FOUND");

  const parentJob = await tx.query.jobs.findFirst({
    where: and(eq(jobs.id, load.jobId), eq(jobs.organisationId, context.organisationId)),
    columns: { id: true, status: true },
  });
  if (!parentJob || parentJob.status === "draft" || parentJob.status === "cancelled") {
    throw new SyncBusinessRuleError("JOB_NOT_OPERATIONAL");
  }

  const now = new Date();

  switch (event.eventType) {
    case "FIELD_COLLECTION_REJECTED": {
      if (["completed", "rejected", "cancelled"].includes(load.status)) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }
      const currentStep = await currentFieldWorkflowStep(tx, context, event.entityId);
      if (currentStep !== "ASSIGNED" || load.status !== "planned") {
        throw new SyncBusinessRuleError("DRIVER_COLLECTION_REJECTION_NOT_ALLOWED");
      }
      const parsed = fieldCollectionRejectPayloadSchema.safeParse(event.payload);
      if (!parsed.success) {
        throw new SyncBusinessRuleError("COLLECTION_REJECTION_REASON_REQUIRED");
      }
      await tx
        .update(jobLoads)
        .set({
          status: "rejected",
          notes: appendOperationalNote(
            load.notes,
            "DRIVER COLLECTION REJECTED",
            parsed.data.reason,
            new Date(event.occurredAt),
          ),
          completedAt: new Date(event.occurredAt),
          updatedAt: now,
        })
        .where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "FIELD_DELIVERY_NOTE_ADDED": {
      if (["completed", "rejected", "cancelled"].includes(load.status)) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }
      const currentStep = await currentFieldWorkflowStep(tx, context, event.entityId);
      if (currentStep !== "ARRIVED_DESTINATION") {
        throw new SyncBusinessRuleError("ARRIVAL_NOTE_OUT_OF_ORDER");
      }
      const parsed = fieldDeliveryNotePayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("INVALID_DELIVERY_NOTE");
      await tx.update(jobLoads).set({
        notes: appendOperationalNote(load.notes, "ARRIVAL NOTE", parsed.data.note, new Date(event.occurredAt)),
        updatedAt: now,
      }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "FIELD_ISSUE_REPORTED": {
      if (["completed", "rejected", "cancelled"].includes(load.status)) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }
      const parsed = fieldIssuePayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("INVALID_FIELD_ISSUE");
      await tx.update(jobLoads).set({
        notes: appendOperationalNote(
          load.notes,
          `FIELD ISSUE · ${parsed.data.issueType.replaceAll("_", " ")}`,
          parsed.data.summary,
          new Date(event.occurredAt),
        ),
        updatedAt: now,
      }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "FIELD_COLLECTED":
    case "FIELD_IN_TRANSIT":
    case "FIELD_ARRIVED_DESTINATION": {
      const terminal = ["completed", "rejected", "cancelled"].includes(load.status);
      const manualArrivalFallback = terminal
        ? await manualSiteArrivalExists(tx, context, load.id)
        : false;

      if (terminal && !manualArrivalFallback) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }

      /*
       * A Driver phone may reconnect after the receiving site used the audited
       * manual-arrival fallback and completed/rejected the transaction. Accept
       * those genuine ordered Driver milestones as late evidence, but never let
       * them move the canonical site-owned load status backwards.
       */
      await validateFieldWorkflowTransition(tx, context, event);

      if (!terminal) {
        const arrivedAtDestination =
          event.eventType === "FIELD_ARRIVED_DESTINATION";

        await tx.update(jobLoads).set({
          status:
            arrivedAtDestination && load.direction === "incoming" && load.status === "planned"
              ? "arrived"
              : load.status,
          receivedAt:
            arrivedAtDestination && load.direction === "incoming"
              ? load.receivedAt ?? new Date(event.occurredAt)
              : load.receivedAt,
          movementAt:
            arrivedAtDestination ? load.movementAt ?? new Date(event.occurredAt) : load.movementAt,
          updatedAt: now,
        }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      }

      break;
    }

    case "LOAD_ARRIVED": {
      if (load.direction !== "incoming") {
        throw new SyncBusinessRuleError("INCOMING_ONLY_ACTION");
      }
      if (load.status !== "planned") {
        throw new SyncBusinessRuleError("LOAD_NOT_PLANNED");
      }

      const parsed = loadArrivedPayloadSchema.safeParse(event.payload ?? {});
      if (!parsed.success) {
        throw new SyncBusinessRuleError("INVALID_LOAD_ARRIVAL");
      }

      const ownTransport = Boolean(
        load.driverId && !load.haulierCounterpartyId,
      );
      const manualSiteFallback =
        ownTransport &&
        parsed.data.arrivalMode === "manual_site_fallback";

      if (ownTransport && !manualSiteFallback) {
        throw new SyncBusinessRuleError(
          "DRIVER_DESTINATION_ARRIVAL_REQUIRED",
        );
      }

      if (manualSiteFallback) {
        if (!parsed.data.physicalArrivalConfirmed) {
          throw new SyncBusinessRuleError(
            "MANUAL_ARRIVAL_CONFIRMATION_REQUIRED",
          );
        }
        if (!parsed.data.manualArrivalReason) {
          throw new SyncBusinessRuleError(
            "MANUAL_ARRIVAL_REASON_REQUIRED",
          );
        }
        if (
          parsed.data.manualArrivalReason === "OTHER" &&
          (parsed.data.manualArrivalNote?.trim().length ?? 0) < 3
        ) {
          throw new SyncBusinessRuleError(
            "MANUAL_ARRIVAL_OTHER_NOTE_REQUIRED",
          );
        }
      }

      if (!load.wasteDescriptionSnapshot?.trim()) {
        throw new SyncBusinessRuleError("WASTE_DESCRIPTION_REQUIRED");
      }
      if (!load.driverId) {
        throw new SyncBusinessRuleError("DRIVER_REQUIRED");
      }
      if (!load.vehicleId) {
        throw new SyncBusinessRuleError("VEHICLE_REQUIRED");
      }

      await validateDriver(
        tx,
        context.organisationId,
        load.driverId,
        load.haulierCounterpartyId,
      );
      await validateVehicle(
        tx,
        context.organisationId,
        load.vehicleId,
        load.haulierCounterpartyId,
      );

      const arrivedAt = load.receivedAt ?? new Date(event.occurredAt);
      const movementAt = load.movementAt ?? new Date(event.occurredAt);
      const reasonCode = parsed.data.manualArrivalReason ?? null;
      const reasonLabel = reasonCode
        ? MANUAL_SITE_ARRIVAL_REASON_LABELS[reasonCode]
        : null;
      const manualNote = parsed.data.manualArrivalNote?.trim() || null;
      const resolvedNotes =
        manualSiteFallback && reasonLabel
          ? appendOperationalNote(
              load.notes,
              "MANUAL SITE ARRIVAL",
              [
                "Channel: Desktop",
                `Reason: ${reasonLabel}`,
                manualNote ? `Note: ${manualNote}` : null,
              ]
                .filter((value): value is string => Boolean(value))
                .join(" · "),
              now,
            )
          : load.notes;

      await tx
        .update(jobLoads)
        .set({
          status: "arrived",
          receivedAt: arrivedAt,
          movementAt,
          notes: resolvedNotes,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobLoads.id, load.id),
            eq(jobLoads.organisationId, context.organisationId),
          ),
        );

      if (manualSiteFallback && reasonCode && reasonLabel) {
        await tx.insert(auditEvents).values({
          organisationId: context.organisationId,
          userId: event.actorUserId,
          entityType: "job_load",
          entityId: load.id,
          action: "MANUAL_SITE_ARRIVAL_CONFIRMED",
          previousState: JSON.stringify({
            status: load.status,
            receivedAt: load.receivedAt?.toISOString() ?? null,
            movementAt: load.movementAt?.toISOString() ?? null,
            driverId: load.driverId,
            vehicleId: load.vehicleId,
          }),
          newState: JSON.stringify({
            status: "arrived",
            receivedAt: arrivedAt.toISOString(),
            movementAt: movementAt.toISOString(),
            driverId: load.driverId,
            vehicleId: load.vehicleId,
            channel: "DESKTOP",
            physicalArrivalConfirmed: true,
            reasonCode,
            reason: reasonLabel,
            note: manualNote,
          }),
        });
      }

      break;
    }

    case "LOAD_DETAILS_UPDATED": {
      if (["completed", "rejected", "cancelled"].includes(load.status)) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }
      const parsed = loadDetailsPayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("INVALID_LOAD_DETAILS");
      const data = parsed.data;
      const driverId = data.driverId === undefined ? load.driverId : data.driverId;
      const vehicleId = data.vehicleId === undefined ? load.vehicleId : data.vehicleId;
      await validateDriver(tx, context.organisationId, driverId, load.haulierCounterpartyId);
      await validateVehicle(tx, context.organisationId, vehicleId, load.haulierCounterpartyId);

      let grossWeight = data.grossWeight === undefined ? (load.grossWeight === null ? null : Number(load.grossWeight)) : data.grossWeight;
      let tareWeight = data.tareWeight === undefined ? (load.tareWeight === null ? null : Number(load.tareWeight)) : data.tareWeight;
      let netWeight = data.netWeight === undefined ? (load.netWeight === null ? null : Number(load.netWeight)) : data.netWeight;
      if (grossWeight !== null && tareWeight !== null) {
        if (grossWeight < tareWeight) throw new SyncBusinessRuleError("GROSS_BELOW_TARE");
        netWeight = grossWeight - tareWeight;
      }
      const weightChanged = data.grossWeight !== undefined || data.tareWeight !== undefined || data.netWeight !== undefined;
      await tx.update(jobLoads).set({
        driverId,
        vehicleId,
        wasteDescriptionSnapshot: data.wasteDescription ?? load.wasteDescriptionSnapshot,
        grossWeight: toDbDecimal(grossWeight),
        tareWeight: toDbDecimal(tareWeight),
        netWeight: toDbDecimal(netWeight),
        weightMetric: data.weightMetric ?? load.weightMetric,
        weightIsEstimate: data.weightIsEstimate ?? load.weightIsEstimate,
        weightSource: weightChanged ? "manual" : load.weightSource,
        notes: data.notes === undefined ? load.notes : data.notes,
        updatedAt: now,
      }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));

      await applySyncWasteItemAllocations(tx, {
        organisationId: context.organisationId,
        jobLoadId: load.id,
        metric: data.weightMetric ?? load.weightMetric,
        netWeight,
        inputs: data.wasteItems,
        requireReconciled: false,
      });
      break;
    }

    case "LOAD_ACCEPTED": {
      if (load.direction !== "incoming") throw new SyncBusinessRuleError("INCOMING_ONLY_ACTION");
      if (load.status !== "arrived") throw new SyncBusinessRuleError("LOAD_MUST_BE_ARRIVED");
      await requireDriverDestinationForOwnTransport(tx, context, load);
      if (!load.wasteDescriptionSnapshot?.trim()) throw new SyncBusinessRuleError("WASTE_DESCRIPTION_REQUIRED");
      const permitAcceptance = await validateIncomingWasteItems(
        tx,
        context,
        load,
      );

      await tx.update(jobLoads).set({
        status: "accepted",
        permitEwcMatchType: permitAcceptance.matchType,
        permitEwcEquivalenceId: null,
      regulatoryAuthorityActivationId:
        permitAcceptance.matchType === "regulatory_authority"
          ? permitAcceptance.activationId
          : null,
        permitEwcBasis:
          permitAcceptance.matchType === "regulatory_authority"
            ? permitAcceptance.basis
            : null,
        permitEwcReference:
          permitAcceptance.matchType === "regulatory_authority"
            ? permitAcceptance.reference
            : null,
        permitEwcCodeSnapshot:
          permitAcceptance.permittedEwcCode ||
          load.ewcCodeSnapshot,
        permitEwcCheckedAt: now,
        updatedAt: now,
      })
        .where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "LOAD_REJECTED": {
      if (load.direction !== "incoming") throw new SyncBusinessRuleError("INCOMING_ONLY_ACTION");
      if (load.status !== "arrived") throw new SyncBusinessRuleError("LOAD_MUST_BE_ARRIVED");
      await requireDriverDestinationForOwnTransport(tx, context, load);
      const parsed = rejectPayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("REJECTION_REASON_REQUIRED");
      await tx.update(jobLoads).set({
        status: "rejected",
        notes: appendOperationalNote(load.notes, "REJECTED", parsed.data.reason, new Date(event.occurredAt)),
        completedAt: new Date(event.occurredAt),
        updatedAt: now,
      }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "LOAD_COMPLETED": {
      if (load.direction === "incoming") {
        if (load.status !== "accepted") throw new SyncBusinessRuleError("LOAD_MUST_BE_ACCEPTED");
        await requireDriverDestinationForOwnTransport(tx, context, load);
      } else if (["completed", "rejected", "cancelled"].includes(load.status)) {
        throw new SyncBusinessRuleError("LOAD_IS_TERMINAL");
      }

      /* Final site weights and completion are one receiving-site transaction.
       * Older clients may still send an empty payload; in that case Cloud uses
       * the already-persisted fields exactly as before. New Desktop builds send
       * the visible final values here so a single optimistic event can both
       * finalise the weighbridge record and complete the load. */
      const parsed = loadDetailsPayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("INVALID_LOAD_DETAILS");
      const data = parsed.data;
      const driverId = data.driverId === undefined ? load.driverId : data.driverId;
      const vehicleId = data.vehicleId === undefined ? load.vehicleId : data.vehicleId;
      await validateDriver(tx, context.organisationId, driverId, load.haulierCounterpartyId);
      await validateVehicle(tx, context.organisationId, vehicleId, load.haulierCounterpartyId);

      const wasteDescription = data.wasteDescription ?? load.wasteDescriptionSnapshot;
      if (!wasteDescription?.trim()) throw new SyncBusinessRuleError("WASTE_DESCRIPTION_REQUIRED");

      let grossWeight = data.grossWeight === undefined
        ? (load.grossWeight === null ? null : Number(load.grossWeight))
        : data.grossWeight;
      let tareWeight = data.tareWeight === undefined
        ? (load.tareWeight === null ? null : Number(load.tareWeight))
        : data.tareWeight;
      let netWeight = data.netWeight === undefined
        ? (load.netWeight === null ? null : Number(load.netWeight))
        : data.netWeight;
      if (grossWeight !== null && tareWeight !== null) {
        if (grossWeight < tareWeight) throw new SyncBusinessRuleError("GROSS_BELOW_TARE");
        netWeight = grossWeight - tareWeight;
      }
      if (netWeight === null || !Number.isFinite(netWeight) || netWeight <= 0) {
        throw new SyncBusinessRuleError("NET_WEIGHT_REQUIRED");
      }

      const weightChanged =
        data.grossWeight !== undefined ||
        data.tareWeight !== undefined ||
        data.netWeight !== undefined;

      await applySyncWasteItemAllocations(tx, {
        organisationId: context.organisationId,
        jobLoadId: load.id,
        metric: data.weightMetric ?? load.weightMetric,
        netWeight,
        inputs: data.wasteItems,
        requireReconciled: load.direction === "incoming",
      });

      await tx.update(jobLoads).set({
        driverId,
        vehicleId,
        wasteDescriptionSnapshot: wasteDescription,
        grossWeight: toDbDecimal(grossWeight),
        tareWeight: toDbDecimal(tareWeight),
        netWeight: toDbDecimal(netWeight),
        weightMetric: data.weightMetric ?? load.weightMetric,
        weightIsEstimate: data.weightIsEstimate ?? load.weightIsEstimate,
        weightSource: weightChanged ? "weighbridge" : load.weightSource,
        notes: data.notes === undefined ? load.notes : data.notes,
        status: "completed",
        movementAt:
          load.movementAt ??
          (load.direction === "outgoing" ? new Date(event.occurredAt) : load.movementAt),
        completedAt: new Date(event.occurredAt),
        updatedAt: now,
      }).where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    case "SITE_TICKET_ISSUED": {
      if (load.status !== "completed") throw new SyncBusinessRuleError("SITE_TICKET_REQUIRES_COMPLETED_LOAD");
      const parsed = siteTicketPayloadSchema.safeParse(event.payload);
      if (!parsed.success) throw new SyncBusinessRuleError("INVALID_SITE_TICKET");
      if (load.ticketNumber && load.ticketNumber !== parsed.data.ticketNumber) {
        throw new SyncBusinessRuleError("SITE_TICKET_IMMUTABLE");
      }
      await tx.update(jobLoads).set({ ticketNumber: parsed.data.ticketNumber, updatedAt: now })
        .where(and(eq(jobLoads.id, load.id), eq(jobLoads.organisationId, context.organisationId)));
      break;
    }

    default:
      throw new SyncBusinessRuleError("UNSUPPORTED_EVENT_TYPE");
  }

  const updated = await tx.query.jobLoads.findFirst({
    where: and(eq(jobLoads.id, event.entityId), eq(jobLoads.organisationId, context.organisationId)),
  });
  if (!updated) throw new SyncBusinessRuleError("LOAD_NOT_FOUND");
  return updated;
}

export async function processSyncEvent(context: ClientApiContext, event: SyncEventInput) {
  const existing = await database.query.syncEventInbox.findFirst({
    where: eq(syncEventInbox.eventId, event.eventId),
    columns: {
      eventId: true,
      payloadHash: true,
      resultStatus: true,
      resultEntityVersion: true,
      reasonCode: true,
    },
  });

  if (existing) {
    if (existing.payloadHash !== event.payloadHash) {
      return result(event.eventId, "REJECTED", null, "EVENT_ID_REUSED");
    }
    return result(event.eventId, "DUPLICATE", existing.resultEntityVersion, existing.reasonCode ?? undefined);
  }

  if (
    event.organisationId !== context.organisationId ||
    event.deviceId !== context.deviceId ||
    event.actorUserId !== context.userId
  ) {
    return result(event.eventId, "REJECTED", null, "AUTH_CONTEXT_MISMATCH");
  }

  const calculatedPayloadHash = hashPayload(event.payload);
  if (/^[a-f0-9]{64}$/i.test(event.payloadHash) && calculatedPayloadHash.toLowerCase() !== event.payloadHash.toLowerCase()) {
    return result(event.eventId, "REJECTED", null, "PAYLOAD_HASH_MISMATCH");
  }

  try {
    return await database.transaction(async (tx) => {
      await validateSiteScope(tx, context.organisationId, event.siteId);

      const sequenceCollision = await tx.query.syncEventInbox.findFirst({
        where: and(eq(syncEventInbox.deviceId, context.deviceId), eq(syncEventInbox.deviceSequence, event.deviceSequence)),
        columns: { eventId: true },
      });
      if (sequenceCollision) {
        return result(event.eventId, "REJECTED", null, "DEVICE_SEQUENCE_REUSED");
      }

      const versionRow = await tx.query.syncEntityVersions.findFirst({
        where: and(
          eq(syncEntityVersions.organisationId, context.organisationId),
          eq(syncEntityVersions.entityType, event.entityType),
          eq(syncEntityVersions.entityId, event.entityId),
        ),
        columns: { version: true },
      });
      const currentVersion = versionRow?.version ?? 0;

      if (event.baseVersion !== null && event.baseVersion !== currentVersion) {
        await tx.insert(syncEventInbox).values({
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
          resultStatus: "CONFLICT",
          resultEntityVersion: currentVersion,
          reasonCode: "ENTITY_VERSION_CONFLICT",
        });
        return result(event.eventId, "CONFLICT", currentVersion, "ENTITY_VERSION_CONFLICT");
      }

      let entityPayload: unknown;
      if (event.entityType === "job_load") {
        entityPayload = await applyJobLoadEvent(tx, context, event);

        /*
          WASTE_X_MULTI_WASTE_ITEM_CHANGE_FEED_V1

          Job Load change-feed rows must carry the operational Waste Items too.
          Desktop bootstrap already has them; without this enrichment, the next
          Cloud UPSERT replaces the encrypted local payload with the flat
          bb_job_load row and the Desktop appears to "fall back" to one EWC.
        */
        if (entityPayload && typeof entityPayload === "object") {
          const wasteItems = await tx
            .select()
            .from(jobLoadWasteItems)
            .where(
              and(
                eq(
                  jobLoadWasteItems.organisationId,
                  context.organisationId,
                ),
                eq(jobLoadWasteItems.jobLoadId, event.entityId),
              ),
            )
            .orderBy(jobLoadWasteItems.itemNumber);

          entityPayload = {
            ...(entityPayload as Record<string, unknown>),
            wasteItems,
          };
        }
      } else {
        throw new SyncBusinessRuleError("UNSUPPORTED_ENTITY_TYPE");
      }

      /* Driver workflow proof travels in the same Cloud change as the physical
       * load mutation, so Desktop never sees own-transport `arrived` before the
       * Driver-arrival proof that authorises it. */
      if (
        event.entityType === "job_load" &&
        isFieldWorkflowEventType(event.eventType) &&
        entityPayload &&
        typeof entityPayload === "object"
      ) {
        const transition = FIELD_WORKFLOW_TRANSITIONS[event.eventType];
        entityPayload = {
          ...(entityPayload as Record<string, unknown>),
          fieldWorkflow: {
            step: transition.toStep,
            updatedAt: event.occurredAt,
            lastEventType: event.eventType,
          },
        };
      }

      /* Pre-collection Driver refusal is also published with structured
       * authority metadata. Desktop can therefore accept a planned→rejected
       * transition without mistaking it for a receiving-site rejection that
       * would require destination arrival. */
      if (
        event.entityType === "job_load" &&
        event.eventType === "FIELD_COLLECTION_REJECTED" &&
        entityPayload &&
        typeof entityPayload === "object"
      ) {
        const rejection = fieldCollectionRejectPayloadSchema.safeParse(event.payload);
        if (!rejection.success) {
          throw new SyncBusinessRuleError("COLLECTION_REJECTION_REASON_REQUIRED");
        }
        entityPayload = {
          ...(entityPayload as Record<string, unknown>),
          driverCollectionRejection: {
            eventType: "FIELD_COLLECTION_REJECTED",
            authority: "DRIVER",
            occurredAt: event.occurredAt,
            reason: rejection.data.reason,
          },
        };
      }

      const now = new Date();
      const [newVersion] = await tx.insert(syncEntityVersions).values({
        organisationId: context.organisationId,
        entityType: event.entityType,
        entityId: event.entityId,
        version: 1,
        updatedAt: now,
      }).onConflictDoUpdate({
        target: [syncEntityVersions.organisationId, syncEntityVersions.entityType, syncEntityVersions.entityId],
        set: { version: sql`${syncEntityVersions.version} + 1`, updatedAt: now },
      }).returning({ version: syncEntityVersions.version });

      await tx.insert(syncChangeFeed).values({
        organisationId: context.organisationId,
        siteId: event.siteId,
        entityType: event.entityType,
        entityId: event.entityId,
        entityVersion: newVersion.version,
        changeType: "UPSERT",
        payload: entityPayload,
        changedAt: now,
      });

      await tx.insert(syncEventInbox).values({
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
        resultStatus: "APPLIED",
        resultEntityVersion: newVersion.version,
      });

      return result(event.eventId, "APPLIED", newVersion.version);
    });
  } catch (error) {
    if (error instanceof SyncBusinessRuleError) {
      try {
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
          reasonCode: error.code,
        });
      } catch {
        // Preserve the original deterministic rejection even if audit persistence
        // races with another duplicate delivery of the same event.
      }
      return result(event.eventId, "REJECTED", null, error.code);
    }
    console.error("[SYNC] Unexpected event processing failure", error);
    return result(event.eventId, "RETRYABLE_ERROR", null, "SYNC_PROCESSING_FAILED");
  }
}

export const ACTIVE_DRIVER_FIELD_EVENT_TYPES = ACTIVE_FIELD_EVENT_TYPES;
