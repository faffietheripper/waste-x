import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  clientDevices,
  syncEntityVersions,
  syncEventInbox,
} from "@/db/client-sync-schema";
import { database } from "@/db/database";
import {
  counterpartySites,
  drivers,
  jobLoads,
  jobs,
  materialProfiles,
  sites,
  users,
  vehicles,
} from "@/db/schema";
import {
  ClientApiAuthError,
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { clientApiJson, handleClientApiError } from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const FORWARD_DAYS = 14 as const;

// Legacy events remain readable so existing development/device history can be
// collapsed into the simpler transport model without deleting records.
const FIELD_WORKFLOW_EVENT_TYPES = [
  "FIELD_JOB_STARTED",
  "FIELD_EN_ROUTE",
  "FIELD_ARRIVED_COLLECTION",
  "FIELD_COLLECTED",
  "FIELD_IN_TRANSIT",
  "FIELD_ARRIVED_DESTINATION",
  "FIELD_DELIVERED",
] as const;

const FIELD_ACTIVITY_EVENT_TYPES = [
  "FIELD_COLLECTION_REJECTED",
  "FIELD_DELIVERY_NOTE_ADDED",
  "FIELD_ISSUE_REPORTED",
] as const;

const FIELD_ISSUE_TYPES = [
  "DELAY",
  "SITE_ACCESS",
  "WASTE_MISMATCH",
  "VEHICLE",
  "SAFETY",
  "OTHER",
] as const;

const SITE_REJECTION_CATEGORY_LABELS = {
  WASTE_MISMATCH: "Waste does not match booking",
  CONTAMINATION: "Contamination / unacceptable material",
  PERMIT_OR_COMPLIANCE: "Permit / compliance issue",
  UNSAFE_LOAD: "Unsafe load",
  DOCUMENTATION: "Missing / incorrect paperwork",
  SITE_CAPACITY: "Site cannot receive this load",
  OTHER: "Other",
} as const;

type ActiveFieldWorkflowEventType =
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION";
type FieldActivityEventType = (typeof FIELD_ACTIVITY_EVENT_TYPES)[number];
type FieldIssueType = (typeof FIELD_ISSUE_TYPES)[number];
type SiteRejectionCategory = keyof typeof SITE_REJECTION_CATEGORY_LABELS;
type FieldWorkflowStep =
  | "ASSIGNED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION";

function fieldWorkflowStepForEvent(eventType: string): FieldWorkflowStep {
  if (eventType === "FIELD_COLLECTED") return "COLLECTED";
  if (eventType === "FIELD_IN_TRANSIT") return "IN_TRANSIT";
  if (eventType === "FIELD_ARRIVED_DESTINATION" || eventType === "FIELD_DELIVERED") {
    return "ARRIVED_DESTINATION";
  }
  return "ASSIGNED";
}

function activeFieldEvent(eventType: string): ActiveFieldWorkflowEventType | null {
  return eventType === "FIELD_COLLECTED" ||
    eventType === "FIELD_IN_TRANSIT" ||
    eventType === "FIELD_ARRIVED_DESTINATION"
    ? eventType
    : null;
}

function isFieldIssueType(value: unknown): value is FieldIssueType {
  return typeof value === "string" && (FIELD_ISSUE_TYPES as readonly string[]).includes(value);
}

function isSiteRejectionCategory(value: string): value is SiteRejectionCategory {
  return value in SITE_REJECTION_CATEGORY_LABELS;
}

function parseSiteRejection(
  notes: string | null,
  status: string,
  completedAt: Date | null,
) {
  if (status !== "rejected" || !notes?.trim()) return null;

  const lines = notes
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .reverse();

  for (const line of lines) {
    const modern = line.match(/^\[SITE REJECTED · ([A-Z_]+) · ([^\]]+)\]\s*(.+)$/);
    if (modern) {
      const category = isSiteRejectionCategory(modern[1] ?? "")
        ? (modern[1] as SiteRejectionCategory)
        : "OTHER";
      return {
        category,
        categoryLabel: SITE_REJECTION_CATEGORY_LABELS[category],
        reason: (modern[3] ?? "").trim(),
        rejectedAt: completedAt?.toISOString() ?? null,
      };
    }

    // Desktop sends category as a tag inside the existing LOAD_REJECTED reason
    // so older sync protocol handlers remain compatible. Recover that structured
    // category here instead of exposing protocol notation to the Driver.
    const legacy = line.match(/^\[REJECTED · [^\]]+\]\s*(.+)$/);
    if (legacy) {
      const detail = (legacy[1] ?? "").trim();
      const tagged = detail.match(/^\[CATEGORY:([A-Z_]+)\]\s*(.+)$/);
      const category = tagged && isSiteRejectionCategory(tagged[1] ?? "")
        ? (tagged[1] as SiteRejectionCategory)
        : "OTHER";
      return {
        category,
        categoryLabel: SITE_REJECTION_CATEGORY_LABELS[category],
        reason: (tagged?.[2] ?? detail).trim(),
        rejectedAt: completedAt?.toISOString() ?? null,
      };
    }
  }

  return null;
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

export async function GET(request: Request) {
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
      throw new ClientApiAuthError(
        "MOBILE_DEVICE_REQUIRED",
        403,
        "This endpoint is available only to an authorised Waste X Mobile device.",
      );
    }

    const user = await database.query.users.findFirst({
      where: and(eq(users.id, context.userId), eq(users.organisationId, context.organisationId)),
      columns: { id: true, email: true },
    });
    if (!user) {
      throw new ClientApiAuthError("ACCOUNT_UNAVAILABLE", 403, "This Waste X account is unavailable.");
    }

    const normalizedEmail = user.email.toLowerCase().trim();
    const matchedDrivers = await database
      .select({
        id: drivers.id,
        name: drivers.name,
        email: drivers.email,
        telephone: drivers.telephone,
        defaultVehicleId: drivers.defaultVehicleId,
      })
      .from(drivers)
      .where(
        and(
          eq(drivers.organisationId, context.organisationId),
          eq(drivers.isActive, true),
          sql`lower(trim(${drivers.email})) = ${normalizedEmail}`,
        ),
      )
      .limit(2);

    const now = new Date();
    const horizonStart = new Date(now);
    horizonStart.setHours(0, 0, 0, 0);
    const horizonEnd = new Date(horizonStart);
    horizonEnd.setDate(horizonEnd.getDate() + FORWARD_DAYS);
    horizonEnd.setHours(23, 59, 59, 999);

    if (matchedDrivers.length !== 1) {
      return clientApiJson({
        ok: true,
        schemaVersion: 1 as const,
        generatedAt: now.toISOString(),
        workingSet: {
          forwardDays: FORWARD_DAYS,
          horizonStart: horizonStart.toISOString(),
          horizonEnd: horizonEnd.toISOString(),
        },
        scope: {
          resolution: matchedDrivers.length === 0 ? ("NO_DRIVER_MATCH" as const) : ("AMBIGUOUS_DRIVER_MATCH" as const),
          userId: user.id,
          driver: null,
        },
        assignments: [],
      });
    }

    const driver = matchedDrivers[0]!;
    const assignmentRows = await database
      .select({
        jobId: jobs.id,
        jobNumber: jobs.jobNumber,
        jobDate: jobs.jobDate,
        jobStatus: jobs.status,
        jobDirection: jobs.direction,
        jobCustomerReference: jobs.customerReference,
        jobPurchaseOrder: jobs.purchaseOrder,
        jobNotes: jobs.notes,
        jobDriverId: jobs.driverId,
        jobVehicleId: jobs.vehicleId,
        jobClientSiteId: jobs.clientSiteId,
        jobOwnSiteId: jobs.ownSiteId,
        jobThirdPartyDestinationSiteId: jobs.thirdPartyDestinationSiteId,
        jobMaterialProfileId: jobs.materialProfileId,
        loadId: jobLoads.id,
        loadNumber: jobLoads.loadNumber,
        loadStatus: jobLoads.status,
        loadDirection: jobLoads.direction,
        movementAt: jobLoads.movementAt,
        loadDriverId: jobLoads.driverId,
        loadVehicleId: jobLoads.vehicleId,
        loadClientSiteId: jobLoads.clientSiteId,
        loadOwnSiteId: jobLoads.ownSiteId,
        loadThirdPartyDestinationSiteId: jobLoads.thirdPartyDestinationSiteId,
        loadMaterialProfileId: jobLoads.materialProfileId,
        ewcCode: jobLoads.ewcCodeSnapshot,
        wasteDescription: jobLoads.wasteDescriptionSnapshot,
        grossWeight: jobLoads.grossWeight,
        tareWeight: jobLoads.tareWeight,
        netWeight: jobLoads.netWeight,
        weightMetric: jobLoads.weightMetric,
        weightIsEstimate: jobLoads.weightIsEstimate,
        weightSource: jobLoads.weightSource,
        ticketNumber: jobLoads.ticketNumber,
        loadNotes: jobLoads.notes,
        loadCompletedAt: jobLoads.completedAt,
      })
      .from(jobLoads)
      .innerJoin(jobs, and(eq(jobLoads.jobId, jobs.id), eq(jobLoads.organisationId, jobs.organisationId)))
      .where(
        and(
          eq(jobLoads.organisationId, context.organisationId),
          ne(jobs.status, "draft"),
          or(
            eq(jobLoads.driverId, driver.id),
            and(isNull(jobLoads.driverId), eq(jobs.driverId, driver.id)),
          ),
          or(
            and(gte(jobs.jobDate, horizonStart), lte(jobs.jobDate, horizonEnd)),
            and(gte(jobLoads.movementAt, horizonStart), lte(jobLoads.movementAt, horizonEnd)),
          ),
        ),
      )
      .orderBy(asc(jobs.jobDate), asc(jobLoads.loadNumber));

    const loadIds = unique(assignmentRows.map((row) => row.loadId));
    const vehicleIds = unique(assignmentRows.map((row) => row.loadVehicleId ?? row.jobVehicleId));
    const materialIds = unique(assignmentRows.map((row) => row.loadMaterialProfileId ?? row.jobMaterialProfileId));
    const ownSiteIds = unique(assignmentRows.map((row) => row.loadOwnSiteId ?? row.jobOwnSiteId));
    const counterpartySiteIds = unique(
      assignmentRows.flatMap((row) => [
        row.loadClientSiteId ?? row.jobClientSiteId,
        row.loadThirdPartyDestinationSiteId ?? row.jobThirdPartyDestinationSiteId,
      ]),
    );

    const [vehicleRows, materialRows, ownSiteRows, counterpartySiteRows, versionRows, workflowRows, activityRows] = await Promise.all([
      vehicleIds.length
        ? database.select({ id: vehicles.id, registrationNumber: vehicles.registrationNumber }).from(vehicles)
            .where(and(eq(vehicles.organisationId, context.organisationId), inArray(vehicles.id, vehicleIds)))
        : Promise.resolve([]),
      materialIds.length
        ? database.select({ id: materialProfiles.id, name: materialProfiles.name }).from(materialProfiles)
            .where(and(eq(materialProfiles.organisationId, context.organisationId), inArray(materialProfiles.id, materialIds)))
        : Promise.resolve([]),
      ownSiteIds.length
        ? database.select({ id: sites.id, name: sites.name, fullAddress: sites.fullAddress, postcode: sites.postcode }).from(sites)
            .where(and(eq(sites.organisationId, context.organisationId), inArray(sites.id, ownSiteIds)))
        : Promise.resolve([]),
      counterpartySiteIds.length
        ? database.select({ id: counterpartySites.id, name: counterpartySites.name, fullAddress: counterpartySites.fullAddress, postcode: counterpartySites.postcode }).from(counterpartySites)
            .where(and(eq(counterpartySites.organisationId, context.organisationId), inArray(counterpartySites.id, counterpartySiteIds)))
        : Promise.resolve([]),
      loadIds.length
        ? database.select({ entityId: syncEntityVersions.entityId, version: syncEntityVersions.version }).from(syncEntityVersions)
            .where(and(eq(syncEntityVersions.organisationId, context.organisationId), eq(syncEntityVersions.entityType, "job_load"), inArray(syncEntityVersions.entityId, loadIds)))
        : Promise.resolve([]),
      loadIds.length
        ? database.select({ entityId: syncEventInbox.entityId, eventType: syncEventInbox.eventType, occurredAt: syncEventInbox.occurredAt }).from(syncEventInbox)
            .where(and(
              eq(syncEventInbox.organisationId, context.organisationId),
              eq(syncEventInbox.entityType, "job_load"),
              eq(syncEventInbox.resultStatus, "APPLIED"),
              inArray(syncEventInbox.entityId, loadIds),
              inArray(syncEventInbox.eventType, FIELD_WORKFLOW_EVENT_TYPES as unknown as string[]),
            ))
            .orderBy(asc(syncEventInbox.occurredAt), asc(syncEventInbox.receivedAt))
        : Promise.resolve([]),
      loadIds.length
        ? database.select({ entityId: syncEventInbox.entityId, eventType: syncEventInbox.eventType, payload: syncEventInbox.payload, occurredAt: syncEventInbox.occurredAt }).from(syncEventInbox)
            .where(and(
              eq(syncEventInbox.organisationId, context.organisationId),
              eq(syncEventInbox.entityType, "job_load"),
              eq(syncEventInbox.resultStatus, "APPLIED"),
              inArray(syncEventInbox.entityId, loadIds),
              inArray(syncEventInbox.eventType, FIELD_ACTIVITY_EVENT_TYPES as unknown as string[]),
            ))
            .orderBy(asc(syncEventInbox.occurredAt), asc(syncEventInbox.receivedAt))
        : Promise.resolve([]),
    ]);

    const vehiclesById = new Map(vehicleRows.map((row) => [row.id, row]));
    const materialsById = new Map(materialRows.map((row) => [row.id, row]));
    const ownSitesById = new Map(ownSiteRows.map((row) => [row.id, row]));
    const counterpartySitesById = new Map(counterpartySiteRows.map((row) => [row.id, row]));
    const versionsByLoadId = new Map(versionRows.map((row) => [row.entityId, row.version]));
    const workflowByLoadId = new Map<string, {
      step: FieldWorkflowStep;
      updatedAt: string;
      lastEventType: ActiveFieldWorkflowEventType | null;
    }>();
    const fieldActivityByLoadId = new Map<string, Array<{
      eventType: FieldActivityEventType;
      occurredAt: string;
      text: string;
      issueType: FieldIssueType | null;
    }>>();

    for (const row of workflowRows) {
      workflowByLoadId.set(row.entityId, {
        step: fieldWorkflowStepForEvent(row.eventType),
        updatedAt: row.occurredAt.toISOString(),
        lastEventType: activeFieldEvent(row.eventType),
      });
    }

    for (const row of activityRows) {
      if (!row.payload || typeof row.payload !== "object") continue;
      const occurredAt = row.occurredAt.toISOString();
      const activity = fieldActivityByLoadId.get(row.entityId) ?? [];

      if (row.eventType === "FIELD_COLLECTION_REJECTED") {
        const reason = (row.payload as { reason?: unknown }).reason;
        if (typeof reason !== "string" || !reason.trim()) continue;
        activity.push({
          eventType: "FIELD_COLLECTION_REJECTED",
          occurredAt,
          text: reason.trim(),
          issueType: null,
        });
      } else if (row.eventType === "FIELD_DELIVERY_NOTE_ADDED") {
        const note = (row.payload as { note?: unknown }).note;
        if (typeof note !== "string" || !note.trim()) continue;
        activity.push({ eventType: "FIELD_DELIVERY_NOTE_ADDED", occurredAt, text: note.trim(), issueType: null });
      } else if (row.eventType === "FIELD_ISSUE_REPORTED") {
        const payload = row.payload as { issueType?: unknown; summary?: unknown };
        if (!isFieldIssueType(payload.issueType) || typeof payload.summary !== "string" || !payload.summary.trim()) continue;
        activity.push({ eventType: "FIELD_ISSUE_REPORTED", occurredAt, text: payload.summary.trim(), issueType: payload.issueType });
      }
      fieldActivityByLoadId.set(row.entityId, activity);
    }

    const assignments = assignmentRows.map((row) => {
      const effectiveDriverId = row.loadDriverId ?? row.jobDriverId;
      const effectiveVehicleId = row.loadVehicleId ?? row.jobVehicleId;
      const effectiveMaterialId = row.loadMaterialProfileId ?? row.jobMaterialProfileId;
      const clientSiteId = row.loadClientSiteId ?? row.jobClientSiteId;
      const ownSiteId = row.loadOwnSiteId ?? row.jobOwnSiteId;
      const thirdPartyDestinationSiteId = row.loadThirdPartyDestinationSiteId ?? row.jobThirdPartyDestinationSiteId;
      const direction = row.loadDirection ?? row.jobDirection;

      const ownSite = ownSiteId ? ownSitesById.get(ownSiteId) ?? null : null;
      const clientSite = clientSiteId ? counterpartySitesById.get(clientSiteId) ?? null : null;
      const thirdPartyDestination = thirdPartyDestinationSiteId ? counterpartySitesById.get(thirdPartyDestinationSiteId) ?? null : null;
      const location = (
        value: { id: string; name: string; fullAddress: string | null; postcode: string | null } | null,
        kind: "OWN_SITE" | "COUNTERPARTY_SITE",
      ) => value ? { kind, id: value.id, name: value.name, fullAddress: value.fullAddress, postcode: value.postcode } : null;

      const origin = direction === "outgoing" ? location(ownSite, "OWN_SITE") : location(clientSite, "COUNTERPARTY_SITE");
      const destination = direction === "outgoing" ? location(thirdPartyDestination, "COUNTERPARTY_SITE") : location(ownSite, "OWN_SITE");
      const vehicle = effectiveVehicleId ? vehiclesById.get(effectiveVehicleId) ?? null : null;
      const material = effectiveMaterialId ? materialsById.get(effectiveMaterialId) ?? null : null;
      const workflow = workflowByLoadId.get(row.loadId) ?? {
        // A pre-collection Driver refusal is terminal while still ASSIGNED. Do
        // not infer destination arrival merely because canonical status is
        // rejected. Site-side rejection after a real journey still has its
        // actual workflow history above.
        step: row.loadStatus === "completed"
          ? ("ARRIVED_DESTINATION" as const)
          : ("ASSIGNED" as const),
        updatedAt: row.movementAt?.toISOString() ?? null,
        lastEventType: null,
      };

      return {
        job: {
          id: row.jobId,
          jobNumber: row.jobNumber,
          jobDate: row.jobDate.toISOString(),
          status: row.jobStatus,
          direction: row.jobDirection,
          customerReference: row.jobCustomerReference,
          purchaseOrder: row.jobPurchaseOrder,
          notes: row.jobNotes,
        },
        load: {
          id: row.loadId,
          loadNumber: row.loadNumber,
          status: row.loadStatus,
          direction,
          entityVersion: versionsByLoadId.get(row.loadId) ?? 0,
          movementAt: row.movementAt?.toISOString() ?? null,
          ewcCode: row.ewcCode,
          wasteDescription: row.wasteDescription,
          grossWeight: row.grossWeight,
          tareWeight: row.tareWeight,
          netWeight: row.netWeight,
          weightMetric: row.weightMetric,
          weightIsEstimate: row.weightIsEstimate,
          weightSource: row.weightSource,
          ticketNumber: row.ticketNumber,
          siteRejection: parseSiteRejection(
            row.loadNotes,
            row.loadStatus,
            row.loadCompletedAt,
          ),
        },
        transport: {
          driverId: effectiveDriverId ?? driver.id,
          driverName: driver.name,
          vehicleId: effectiveVehicleId,
          vehicleRegistration: vehicle?.registrationNumber ?? null,
        },
        material: material ? { id: material.id, name: material.name } : null,
        origin,
        destination,
        workflow,
        fieldActivity: fieldActivityByLoadId.get(row.loadId) ?? [],
      };
    });

    return clientApiJson({
      ok: true,
      schemaVersion: 1 as const,
      generatedAt: now.toISOString(),
      workingSet: {
        forwardDays: FORWARD_DAYS,
        horizonStart: horizonStart.toISOString(),
        horizonEnd: horizonEnd.toISOString(),
      },
      scope: {
        resolution: "MATCHED" as const,
        userId: user.id,
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
          telephone: driver.telephone,
          defaultVehicleId: driver.defaultVehicleId,
        },
      },
      assignments,
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
