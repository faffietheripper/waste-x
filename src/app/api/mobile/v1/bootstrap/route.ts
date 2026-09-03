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

import { clientDevices } from "@/db/client-sync-schema";
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

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
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

    const driverMatches = await database
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
          sql`lower(${drivers.email}) = ${user.email.toLowerCase()}`,
        ),
      )
      .limit(2);

    const horizonStart = new Date();
    horizonStart.setUTCHours(0, 0, 0, 0);
    const horizonEndExclusive = new Date(horizonStart);
    horizonEndExclusive.setUTCDate(horizonEndExclusive.getUTCDate() + FORWARD_DAYS);
    const horizonEnd = new Date(horizonEndExclusive.getTime() - 1);

    if (driverMatches.length !== 1) {
      return clientApiJson({
        ok: true,
        bootstrap: {
          schemaVersion: 1,
          generatedAt: new Date().toISOString(),
          workingSet: {
            forwardDays: FORWARD_DAYS,
            horizonStart: horizonStart.toISOString(),
            horizonEnd: horizonEnd.toISOString(),
          },
          scope: {
            resolution:
              driverMatches.length === 0
                ? "NO_DRIVER_MATCH"
                : "AMBIGUOUS_DRIVER_MATCH",
            userId: context.userId,
            driver: null,
          },
          assignments: [],
        },
      });
    }

    const driver = driverMatches[0]!;

    const rows = await database
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
        loadMovementAt: jobLoads.movementAt,
        loadDriverId: jobLoads.driverId,
        loadVehicleId: jobLoads.vehicleId,
        loadClientSiteId: jobLoads.clientSiteId,
        loadOwnSiteId: jobLoads.ownSiteId,
        loadThirdPartyDestinationSiteId: jobLoads.thirdPartyDestinationSiteId,
        loadMaterialProfileId: jobLoads.materialProfileId,
        loadEwcCode: jobLoads.ewcCodeSnapshot,
        loadWasteDescription: jobLoads.wasteDescriptionSnapshot,
        loadNetWeight: jobLoads.netWeight,
        loadWeightMetric: jobLoads.weightMetric,
        loadTicketNumber: jobLoads.ticketNumber,
      })
      .from(jobLoads)
      .innerJoin(jobs, eq(jobLoads.jobId, jobs.id))
      .where(
        and(
          eq(jobs.organisationId, context.organisationId),
          eq(jobLoads.organisationId, context.organisationId),
          gte(jobs.jobDate, horizonStart),
          lte(jobs.jobDate, horizonEnd),
          ne(jobs.status, "cancelled"),
          ne(jobLoads.status, "cancelled"),
          or(
            eq(jobLoads.driverId, driver.id),
            and(isNull(jobLoads.driverId), eq(jobs.driverId, driver.id)),
          ),
        ),
      )
      .orderBy(asc(jobs.jobDate), asc(jobLoads.loadNumber));

    const ownSiteIds = unique(
      rows.map((row) => row.loadOwnSiteId ?? row.jobOwnSiteId),
    );
    const counterpartySiteIds = unique(
      rows.flatMap((row) => [
        row.loadClientSiteId ?? row.jobClientSiteId,
        row.loadThirdPartyDestinationSiteId ??
          row.jobThirdPartyDestinationSiteId,
      ]),
    );
    const vehicleIds = unique(
      rows.map(
        (row) =>
          row.loadVehicleId ?? row.jobVehicleId ?? driver.defaultVehicleId,
      ),
    );
    const materialIds = unique(
      rows.map((row) => row.loadMaterialProfileId ?? row.jobMaterialProfileId),
    );

    const [ownSiteRows, counterpartySiteRows, vehicleRows, materialRows] =
      await Promise.all([
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
              .select({ id: materialProfiles.id, name: materialProfiles.name })
              .from(materialProfiles)
              .where(
                and(
                  eq(materialProfiles.organisationId, context.organisationId),
                  inArray(materialProfiles.id, materialIds),
                ),
              )
          : Promise.resolve([]),
      ]);

    const ownSiteById = new Map(ownSiteRows.map((site) => [site.id, site]));
    const counterpartySiteById = new Map(
      counterpartySiteRows.map((site) => [site.id, site]),
    );
    const vehicleById = new Map(vehicleRows.map((vehicle) => [vehicle.id, vehicle]));
    const materialById = new Map(materialRows.map((material) => [material.id, material]));

    const assignments = rows.map((row) => {
      const direction = row.loadDirection ?? row.jobDirection;
      const clientSiteId = row.loadClientSiteId ?? row.jobClientSiteId;
      const ownSiteId = row.loadOwnSiteId ?? row.jobOwnSiteId;
      const destinationSiteId =
        row.loadThirdPartyDestinationSiteId ??
        row.jobThirdPartyDestinationSiteId;
      const vehicleId =
        row.loadVehicleId ?? row.jobVehicleId ?? driver.defaultVehicleId;
      const materialId =
        row.loadMaterialProfileId ?? row.jobMaterialProfileId;

      const ownSite = ownSiteId ? ownSiteById.get(ownSiteId) ?? null : null;
      const clientSite = clientSiteId
        ? counterpartySiteById.get(clientSiteId) ?? null
        : null;
      const destinationSite = destinationSiteId
        ? counterpartySiteById.get(destinationSiteId) ?? null
        : null;
      const vehicle = vehicleId ? vehicleById.get(vehicleId) ?? null : null;
      const material = materialId ? materialById.get(materialId) ?? null : null;

      const toOwnSiteLocation = () =>
        ownSite
          ? {
              kind: "OWN_SITE" as const,
              id: ownSite.id,
              name: ownSite.name,
              fullAddress: ownSite.fullAddress,
              postcode: ownSite.postcode,
            }
          : null;
      const toCounterpartyLocation = (
        site: (typeof counterpartySiteRows)[number] | null,
      ) =>
        site
          ? {
              kind: "COUNTERPARTY_SITE" as const,
              id: site.id,
              name: site.name,
              fullAddress: site.fullAddress,
              postcode: site.postcode,
            }
          : null;

      return {
        job: {
          id: row.jobId,
          jobNumber: row.jobNumber,
          jobDate: row.jobDate.toISOString(),
          status: row.jobStatus,
          direction,
          customerReference: row.jobCustomerReference,
          purchaseOrder: row.jobPurchaseOrder,
          notes: row.jobNotes,
        },
        load: {
          id: row.loadId,
          loadNumber: row.loadNumber,
          status: row.loadStatus,
          ewcCode: row.loadEwcCode,
          wasteDescription: row.loadWasteDescription,
          netWeight: row.loadNetWeight,
          weightMetric: row.loadWeightMetric,
          ticketNumber: row.loadTicketNumber,
          movementAt: row.loadMovementAt?.toISOString() ?? null,
        },
        transport: {
          driverId: driver.id,
          driverName: driver.name,
          vehicleId: vehicle?.id ?? null,
          vehicleRegistration: vehicle?.registrationNumber ?? null,
        },
        material: material
          ? {
              id: material.id,
              name: material.name,
            }
          : null,
        origin:
          direction === "outgoing"
            ? toOwnSiteLocation()
            : toCounterpartyLocation(clientSite),
        destination:
          direction === "outgoing"
            ? toCounterpartyLocation(destinationSite)
            : toOwnSiteLocation(),
      };
    });

    return clientApiJson({
      ok: true,
      bootstrap: {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        workingSet: {
          forwardDays: FORWARD_DAYS,
          horizonStart: horizonStart.toISOString(),
          horizonEnd: horizonEnd.toISOString(),
        },
        scope: {
          resolution: "MATCHED",
          userId: context.userId,
          driver,
        },
        assignments,
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
