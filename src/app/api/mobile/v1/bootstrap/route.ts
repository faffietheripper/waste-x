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
import {
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const FORWARD_DAYS = 14 as const;

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

type FieldWorkflowEventType = (typeof FIELD_WORKFLOW_EVENT_TYPES)[number];
type FieldActivityEventType = (typeof FIELD_ACTIVITY_EVENT_TYPES)[number];
type FieldIssueType = (typeof FIELD_ISSUE_TYPES)[number];
type FieldWorkflowStep =
  | "ASSIGNED"
  | "STARTED"
  | "EN_ROUTE"
  | "ARRIVED_COLLECTION"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION"
  | "DELIVERED";

function fieldWorkflowStepForEvent(eventType: string): FieldWorkflowStep | null {
  switch (eventType) {
    case "FIELD_JOB_STARTED":
      return "STARTED";
    case "FIELD_EN_ROUTE":
      return "EN_ROUTE";
    case "FIELD_ARRIVED_COLLECTION":
      return "ARRIVED_COLLECTION";
    case "FIELD_COLLECTED":
      return "COLLECTED";
    case "FIELD_IN_TRANSIT":
      return "IN_TRANSIT";
    case "FIELD_ARRIVED_DESTINATION":
      return "ARRIVED_DESTINATION";
    case "FIELD_DELIVERED":
      return "DELIVERED";
    default:
      return null;
  }
}

function isFieldIssueType(value: unknown): value is FieldIssueType {
  return (
    typeof value === "string" &&
    (FIELD_ISSUE_TYPES as readonly string[]).includes(value)
  );
}

function unique(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  );
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
      where: and(
        eq(users.id, context.userId),
        eq(users.organisationId, context.organisationId),
      ),
      columns: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      throw new ClientApiAuthError(
        "ACCOUNT_UNAVAILABLE",
        403,
        "This Waste X account is unavailable.",
      );
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
          resolution:
            matchedDrivers.length === 0
              ? ("NO_DRIVER_MATCH" as const)
              : ("AMBIGUOUS_DRIVER_MATCH" as const),
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
      })
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
          eq(jobLoads.organisationId, context.organisationId),
          ne(jobLoads.status, "cancelled"),
          ne(jobs.status, "cancelled"),
          or(
            eq(jobLoads.driverId, driver.id),
            and(isNull(jobLoads.driverId), eq(jobs.driverId, driver.id)),
          ),
          or(
            and(
              gte(jobs.jobDate, horizonStart),
              lte(jobs.jobDate, horizonEnd),
            ),
            and(
              gte(jobLoads.movementAt, horizonStart),
              lte(jobLoads.movementAt, horizonEnd),
            ),
          ),
        ),
      )
      .orderBy(asc(jobs.jobDate), asc(jobLoads.loadNumber));

    const loadIds = unique(assignmentRows.map((row) => row.loadId));
    const vehicleIds = unique(
      assignmentRows.map((row) => row.loadVehicleId ?? row.jobVehicleId),
    );
    const materialIds = unique(
      assignmentRows.map(
        (row) => row.loadMaterialProfileId ?? row.jobMaterialProfileId,
      ),
    );
    const ownSiteIds = unique(
      assignmentRows.flatMap((row) => [
        row.loadOwnSiteId ?? row.jobOwnSiteId,
      ]),
    );
    const counterpartySiteIds = unique(
      assignmentRows.flatMap((row) => [
        row.loadClientSiteId ?? row.jobClientSiteId,
        row.loadThirdPartyDestinationSiteId ??
          row.jobThirdPartyDestinationSiteId,
      ]),
    );

    const [
      vehicleRows,
      materialRows,
      ownSiteRows,
      counterpartySiteRows,
      versionRows,
      workflowRows,
      confirmationRows,
      activityRows,
    ] = await Promise.all([
      vehicleIds.length
        ? database
            .select({
              id: vehicles.id,
              registrationNumber: vehicles.registrationNumber,
            })
            .from(vehicles)
            .where(
              and(
                eq(vehicles.organisationId, context.organisationId),
                inArray(vehicles.id, vehicleIds),
              ),
            )
        : Promise.resolve([]),
      materialIds.length
        ? database
            .select({
              id: materialProfiles.id,
              name: materialProfiles.name,
            })
            .from(materialProfiles)
            .where(
              and(
                eq(materialProfiles.organisationId, context.organisationId),
                inArray(materialProfiles.id, materialIds),
              ),
            )
        : Promise.resolve([]),
      ownSiteIds.length
        ? database
            .select({
              id: sites.id,
              name: sites.name,
              fullAddress: sites.fullAddress,
              postcode: sites.postcode,
            })
            .from(sites)
            .where(
              and(
                eq(sites.organisationId, context.organisationId),
                inArray(sites.id, ownSiteIds),
              ),
            )
        : Promise.resolve([]),
      counterpartySiteIds.length
        ? database
            .select({
              id: counterpartySites.id,
              name: counterpartySites.name,
              fullAddress: counterpartySites.fullAddress,
              postcode: counterpartySites.postcode,
            })
            .from(counterpartySites)
            .where(
              and(
                eq(counterpartySites.organisationId, context.organisationId),
                inArray(counterpartySites.id, counterpartySiteIds),
              ),
            )
        : Promise.resolve([]),
      loadIds.length
        ? database
            .select({
              entityId: syncEntityVersions.entityId,
              version: syncEntityVersions.version,
            })
            .from(syncEntityVersions)
            .where(
              and(
                eq(syncEntityVersions.organisationId, context.organisationId),
                eq(syncEntityVersions.entityType, "job_load"),
                inArray(syncEntityVersions.entityId, loadIds),
              ),
            )
        : Promise.resolve([]),
      loadIds.length
        ? database
            .select({
              entityId: syncEventInbox.entityId,
              eventType: syncEventInbox.eventType,
              occurredAt: syncEventInbox.occurredAt,
            })
            .from(syncEventInbox)
            .where(
              and(
                eq(syncEventInbox.organisationId, context.organisationId),
                eq(syncEventInbox.entityType, "job_load"),
                eq(syncEventInbox.resultStatus, "APPLIED"),
                inArray(syncEventInbox.entityId, loadIds),
                inArray(
                  syncEventInbox.eventType,
                  FIELD_WORKFLOW_EVENT_TYPES as unknown as string[],
                ),
              ),
            )
            .orderBy(asc(syncEventInbox.occurredAt), asc(syncEventInbox.receivedAt))
        : Promise.resolve([]),
      loadIds.length
        ? database
            .select({
              entityId: syncEventInbox.entityId,
              payload: syncEventInbox.payload,
              occurredAt: syncEventInbox.occurredAt,
            })
            .from(syncEventInbox)
            .where(
              and(
                eq(syncEventInbox.organisationId, context.organisationId),
                eq(syncEventInbox.entityType, "job_load"),
                eq(syncEventInbox.eventType, "LOAD_DETAILS_UPDATED"),
                eq(syncEventInbox.resultStatus, "APPLIED"),
                inArray(syncEventInbox.entityId, loadIds),
              ),
            )
            .orderBy(asc(syncEventInbox.occurredAt), asc(syncEventInbox.receivedAt))
        : Promise.resolve([]),
      loadIds.length
        ? database
            .select({
              entityId: syncEventInbox.entityId,
              eventType: syncEventInbox.eventType,
              payload: syncEventInbox.payload,
              occurredAt: syncEventInbox.occurredAt,
            })
            .from(syncEventInbox)
            .where(
              and(
                eq(syncEventInbox.organisationId, context.organisationId),
                eq(syncEventInbox.entityType, "job_load"),
                eq(syncEventInbox.resultStatus, "APPLIED"),
                inArray(syncEventInbox.entityId, loadIds),
                inArray(
                  syncEventInbox.eventType,
                  FIELD_ACTIVITY_EVENT_TYPES as unknown as string[],
                ),
              ),
            )
            .orderBy(asc(syncEventInbox.occurredAt), asc(syncEventInbox.receivedAt))
        : Promise.resolve([]),
    ]);

    const vehiclesById = new Map(vehicleRows.map((row) => [row.id, row]));
    const materialsById = new Map(materialRows.map((row) => [row.id, row]));
    const ownSitesById = new Map(ownSiteRows.map((row) => [row.id, row]));
    const counterpartySitesById = new Map(
      counterpartySiteRows.map((row) => [row.id, row]),
    );
    const versionsByLoadId = new Map(
      versionRows.map((row) => [row.entityId, row.version]),
    );
    const workflowByLoadId = new Map<
      string,
      {
        step: FieldWorkflowStep;
        updatedAt: string;
        lastEventType: FieldWorkflowEventType;
      }
    >();
    const collectionChecksByLoadId = new Map<
      string,
      {
        wasteConfirmedAt: string | null;
        quantityConfirmedAt: string | null;
        manualWeightRecordedAt: string | null;
      }
    >();
    const fieldActivityByLoadId = new Map<
      string,
      Array<{
        eventType: FieldActivityEventType;
        occurredAt: string;
        text: string;
        issueType: FieldIssueType | null;
      }>
    >();

    for (const row of workflowRows) {
      const step = fieldWorkflowStepForEvent(row.eventType);
      if (!step) continue;
      workflowByLoadId.set(row.entityId, {
        step,
        updatedAt: row.occurredAt.toISOString(),
        lastEventType: row.eventType as FieldWorkflowEventType,
      });
    }

    for (const row of confirmationRows) {
      if (!row.payload || typeof row.payload !== "object") continue;
      const kind = (row.payload as { fieldConfirmation?: unknown }).fieldConfirmation;
      if (kind !== "WASTE" && kind !== "QUANTITY" && kind !== "MANUAL_WEIGHT") {
        continue;
      }
      const checks = collectionChecksByLoadId.get(row.entityId) ?? {
        wasteConfirmedAt: null,
        quantityConfirmedAt: null,
        manualWeightRecordedAt: null,
      };
      const occurredAt = row.occurredAt.toISOString();
      if (kind === "WASTE") checks.wasteConfirmedAt = occurredAt;
      if (kind === "QUANTITY") checks.quantityConfirmedAt = occurredAt;
      if (kind === "MANUAL_WEIGHT") {
        checks.manualWeightRecordedAt = occurredAt;
        checks.quantityConfirmedAt = occurredAt;
      }
      collectionChecksByLoadId.set(row.entityId, checks);
    }

    for (const row of activityRows) {
      if (!row.payload || typeof row.payload !== "object") continue;
      const occurredAt = row.occurredAt.toISOString();
      const activity = fieldActivityByLoadId.get(row.entityId) ?? [];

      if (row.eventType === "FIELD_DELIVERY_NOTE_ADDED") {
        const note = (row.payload as { note?: unknown }).note;
        if (typeof note !== "string" || !note.trim()) continue;
        activity.push({
          eventType: "FIELD_DELIVERY_NOTE_ADDED",
          occurredAt,
          text: note.trim(),
          issueType: null,
        });
        fieldActivityByLoadId.set(row.entityId, activity);
        continue;
      }

      if (row.eventType === "FIELD_ISSUE_REPORTED") {
        const payload = row.payload as {
          issueType?: unknown;
          summary?: unknown;
        };
        if (
          !isFieldIssueType(payload.issueType) ||
          typeof payload.summary !== "string" ||
          !payload.summary.trim()
        ) {
          continue;
        }
        activity.push({
          eventType: "FIELD_ISSUE_REPORTED",
          occurredAt,
          text: payload.summary.trim(),
          issueType: payload.issueType,
        });
        fieldActivityByLoadId.set(row.entityId, activity);
      }
    }

    const assignments = assignmentRows.map((row) => {
      const effectiveDriverId = row.loadDriverId ?? row.jobDriverId;
      const effectiveVehicleId = row.loadVehicleId ?? row.jobVehicleId;
      const effectiveMaterialId =
        row.loadMaterialProfileId ?? row.jobMaterialProfileId;
      const clientSiteId = row.loadClientSiteId ?? row.jobClientSiteId;
      const ownSiteId = row.loadOwnSiteId ?? row.jobOwnSiteId;
      const thirdPartyDestinationSiteId =
        row.loadThirdPartyDestinationSiteId ??
          row.jobThirdPartyDestinationSiteId;
      const direction = row.loadDirection ?? row.jobDirection;

      const ownSite = ownSiteId ? ownSitesById.get(ownSiteId) ?? null : null;
      const clientSite = clientSiteId
        ? counterpartySitesById.get(clientSiteId) ?? null
        : null;
      const thirdPartyDestination = thirdPartyDestinationSiteId
        ? counterpartySitesById.get(thirdPartyDestinationSiteId) ?? null
        : null;

      const location = (
        value:
          | {
              id: string;
              name: string;
              fullAddress: string | null;
              postcode: string | null;
            }
          | null,
        kind: "OWN_SITE" | "COUNTERPARTY_SITE",
      ) =>
        value
          ? {
              kind,
              id: value.id,
              name: value.name,
              fullAddress: value.fullAddress,
              postcode: value.postcode,
            }
          : null;

      const origin =
        direction === "outgoing"
          ? location(ownSite, "OWN_SITE")
          : location(clientSite, "COUNTERPARTY_SITE");
      const destination =
        direction === "outgoing"
          ? location(thirdPartyDestination, "COUNTERPARTY_SITE")
          : location(ownSite, "OWN_SITE");

      const vehicle = effectiveVehicleId
        ? vehiclesById.get(effectiveVehicleId) ?? null
        : null;
      const material = effectiveMaterialId
        ? materialsById.get(effectiveMaterialId) ?? null
        : null;
      const workflow = workflowByLoadId.get(row.loadId) ?? {
        step: row.loadStatus === "completed" ? ("DELIVERED" as const) : ("ASSIGNED" as const),
        updatedAt: row.movementAt?.toISOString() ?? null,
        lastEventType: null,
      };
      const collectionChecks = collectionChecksByLoadId.get(row.loadId) ?? {
        wasteConfirmedAt: null,
        quantityConfirmedAt: null,
        manualWeightRecordedAt: null,
      };
      const fieldActivity = fieldActivityByLoadId.get(row.loadId) ?? [];

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
        },
        transport: {
          driverId: effectiveDriverId ?? driver.id,
          driverName: driver.name,
          vehicleId: effectiveVehicleId,
          vehicleRegistration: vehicle?.registrationNumber ?? null,
        },
        material: material
          ? {
              id: material.id,
              name: material.name,
            }
          : null,
        origin,
        destination,
        workflow,
        collectionChecks,
        fieldActivity,
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
