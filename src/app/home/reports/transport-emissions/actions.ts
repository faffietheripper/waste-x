"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { transportRouteSnapshots } from "@/db/carbon-schema";
import { database } from "@/db/database";
import {
  auditEvents,
  counterpartySites,
  jobLoads,
  sites,
} from "@/db/schema";
import {
  TRANSPORT_DISTANCE_SOURCES,
  calculateTransportEmissions,
  type TransportDistanceSource,
  type TransportDistanceUnit,
  type TransportWeightMetric,
} from "@/modules/carbon/core/calculateTransportEmissions";
import { normaliseUkPostcode } from "@/modules/carbon/core/postcodeRouting";
import { calculateAutomaticTransportEmissions } from "@/modules/carbon/data-access/calculateAutomaticTransportEmissions";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function routeError(code: string, loadId?: string): never {
  const params = new URLSearchParams();
  params.set("error", code);
  if (loadId) params.set("loadId", loadId);
  redirect(`/home/reports/transport-emissions?${params.toString()}${loadId ? `#load-${loadId}` : ""}`);
}

function routeSuccess(code: string, loadId?: string): never {
  const params = new URLSearchParams();
  params.set("success", code);
  if (loadId) params.set("loadId", loadId);
  redirect(`/home/reports/transport-emissions?${params.toString()}${loadId ? `#load-${loadId}` : ""}`);
}

export async function autoCalculateTransportEmissionsAction() {
  const context = await requireSoloPermission("reports:view");

  try {
    const result = await calculateAutomaticTransportEmissions({
      organisationId: context.organisationId,
      userId: context.userId,
      maxUniqueRoutes: 40,
    });

    revalidatePath("/home/reports/transport-emissions");
    revalidatePath("/home/reports");

    return { ok: true as const, ...result };
  } catch (error) {
    return {
      ok: false as const,
      calculatedLoads: 0,
      error: error instanceof Error ? error.message : "AUTO_CALCULATION_FAILED",
    };
  }
}

export async function refreshAutomaticTransportEmissionsAction() {
  const context = await requireSoloPermission("reports:view");

  const result = await calculateAutomaticTransportEmissions({
    organisationId: context.organisationId,
    userId: context.userId,
    maxUniqueRoutes: 40,
  });

  revalidatePath("/home/reports/transport-emissions");
  revalidatePath("/home/reports");

  redirect(
    `/home/reports/transport-emissions?success=auto_refreshed&calculated=${result.calculatedLoads}`,
  );
}

async function updateOwnSitePostcode(params: {
  organisationId: string;
  siteId: string | null;
  postcode: string;
}) {
  if (!params.siteId || !params.postcode) return false;

  await database
    .update(sites)
    .set({
      postcode: params.postcode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sites.id, params.siteId),
        eq(sites.organisationId, params.organisationId),
      ),
    );

  return true;
}

async function updateCounterpartySitePostcode(params: {
  organisationId: string;
  siteId: string | null;
  postcode: string;
}) {
  if (!params.siteId || !params.postcode) return false;

  await database
    .update(counterpartySites)
    .set({
      postcode: params.postcode,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(counterpartySites.id, params.siteId),
        eq(counterpartySites.organisationId, params.organisationId),
      ),
    );

  return true;
}

export async function saveTransportRoutePostcodesAction(formData: FormData) {
  const context = await requireSoloPermission("worksheet:operate");
  const loadId = clean(formData.get("loadId"));

  if (!loadId) routeError("load_required");

  const originPostcode = normaliseUkPostcode(clean(formData.get("originPostcode")));
  const destinationPostcode = normaliseUkPostcode(
    clean(formData.get("destinationPostcode")),
  );

  if (!originPostcode) routeError("origin_postcode_required", loadId);
  if (!destinationPostcode) routeError("destination_postcode_required", loadId);

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, context.organisationId),
    ),
    with: {
      job: true,
      clientSite: true,
      ownSite: true,
      thirdPartyDestinationSite: true,
    },
  });

  if (!load) routeError("load_not_found", loadId);
  if (load.status !== "completed") routeError("load_not_completed", loadId);

  const defaultOwnSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, context.organisationId),
      eq(sites.isDefault, true),
    ),
    columns: { id: true, postcode: true },
  });

  const ownSiteId =
    load.ownSiteId ?? load.job?.ownSiteId ?? defaultOwnSite?.id ?? null;
  const clientSiteId = load.clientSiteId ?? load.job?.clientSiteId ?? null;
  const thirdPartyDestinationSiteId =
    load.thirdPartyDestinationSiteId ??
    load.job?.thirdPartyDestinationSiteId ??
    null;

  let originStoredOnMaster = false;
  let destinationStoredOnMaster = false;

  if (load.direction === "outgoing") {
    originStoredOnMaster = await updateOwnSitePostcode({
      organisationId: context.organisationId,
      siteId: ownSiteId,
      postcode: originPostcode,
    });
    destinationStoredOnMaster = await updateCounterpartySitePostcode({
      organisationId: context.organisationId,
      siteId: thirdPartyDestinationSiteId,
      postcode: destinationPostcode,
    });
  } else {
    originStoredOnMaster = await updateCounterpartySitePostcode({
      organisationId: context.organisationId,
      siteId: clientSiteId,
      postcode: originPostcode,
    });
    destinationStoredOnMaster = await updateOwnSitePostcode({
      organisationId: context.organisationId,
      siteId: ownSiteId,
      postcode: destinationPostcode,
    });
  }

  await database
    .insert(transportRouteSnapshots)
    .values({
      organisationId: context.organisationId,
      jobLoadId: load.id,
      originPostcode,
      destinationPostcode,
      originPostcodeOverride: !originStoredOnMaster,
      destinationPostcodeOverride: !destinationStoredOnMaster,
      status: "pending",
      lastError: null,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: transportRouteSnapshots.jobLoadId,
      set: {
        originPostcode,
        destinationPostcode,
        originPostcodeOverride: !originStoredOnMaster,
        destinationPostcodeOverride: !destinationStoredOnMaster,
        status: "pending",
        lastError: null,
        updatedAt: new Date(),
      },
    });

  const result = await calculateAutomaticTransportEmissions({
    organisationId: context.organisationId,
    userId: context.userId,
    loadIds: [load.id],
    force: true,
    maxUniqueRoutes: 1,
  });

  revalidatePath("/home/reports/transport-emissions");
  revalidatePath("/home/reports");
  revalidatePath(`/home/jobs/${load.jobId}`);
  revalidatePath("/home/clients");
  revalidatePath("/home/sites");

  if (result.calculatedLoads === 0) {
    routeError("route_calculation_failed", load.id);
  }

  routeSuccess("route_saved", load.id);
}

export async function recalculateTransportEmissionsAction(formData: FormData) {
  const context = await requireSoloPermission("reports:view");
  const loadId = clean(formData.get("loadId"));

  if (!loadId) routeError("load_required");

  const result = await calculateAutomaticTransportEmissions({
    organisationId: context.organisationId,
    userId: context.userId,
    loadIds: [loadId],
    force: true,
    maxUniqueRoutes: 1,
  });

  revalidatePath("/home/reports/transport-emissions");
  revalidatePath("/home/reports");

  if (result.calculatedLoads === 0) {
    routeError("route_calculation_failed", loadId);
  }

  routeSuccess("recalculated", loadId);
}

/* -------------------------------------------------------------------------
   Existing manual distance action retained for backwards compatibility.
   The new report does not require users to use it for normal postcode routes.
--------------------------------------------------------------------------- */
function isDistanceUnit(value: string): value is TransportDistanceUnit {
  return value === "km" || value === "miles";
}

function isDistanceSource(value: string): value is TransportDistanceSource {
  return (TRANSPORT_DISTANCE_SOURCES as readonly string[]).includes(value);
}

function isWeightMetric(value: string): value is TransportWeightMetric {
  return value === "Tonnes" || value === "Kilograms" || value === "Grams";
}

export async function saveTransportEmissionsAction(formData: FormData) {
  const context = await requireSoloPermission("worksheet:operate");

  const loadId = clean(formData.get("loadId"));
  const distance = Number(clean(formData.get("distance")));
  const distanceUnit = clean(formData.get("distanceUnit"));
  const distanceSource = clean(formData.get("distanceSource"));

  if (!loadId) routeError("load_required");
  if (!Number.isFinite(distance) || distance <= 0) routeError("distance_required", loadId);
  if (!isDistanceUnit(distanceUnit)) routeError("invalid_distance_unit", loadId);
  if (!isDistanceSource(distanceSource)) routeError("invalid_distance_source", loadId);

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, context.organisationId),
    ),
  });

  if (!load) routeError("load_not_found", loadId);
  if (load.status !== "completed") routeError("load_not_completed", loadId);

  const weight = Number(load.netWeight ?? "0");
  if (!Number.isFinite(weight) || weight <= 0) routeError("net_weight_required", loadId);
  if (!isWeightMetric(load.weightMetric)) routeError("invalid_weight_metric", loadId);

  const calculation = calculateTransportEmissions({
    weightAmount: weight,
    weightMetric: load.weightMetric,
    distance,
    distanceUnit,
  });

  const now = new Date();
  const previousState = {
    transportDistanceKm: load.transportDistanceKm,
    transportDistanceSource: load.transportDistanceSource,
    transportCo2eKg: load.transportCo2eKg,
    transportCarbonCalculatedAt: load.transportCarbonCalculatedAt,
  };

  await database.transaction(async (tx) => {
    await tx
      .update(jobLoads)
      .set({
        transportDistanceKm: calculation.distanceKm.toFixed(3),
        transportDistanceSource: distanceSource,
        transportCarbonMethod: "tonne_km",
        transportCarbonFactorKgPerTonneKm:
          calculation.factor.kgCo2ePerTonneKm.toFixed(6),
        transportCarbonFactorSource: calculation.factor.source,
        transportCarbonFactorYear: calculation.factor.year,
        transportCo2eKg: calculation.co2eKg.toFixed(3),
        transportCarbonCalculatedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoads.id, load.id),
          eq(jobLoads.organisationId, context.organisationId),
        ),
      );

    await tx.insert(auditEvents).values({
      organisationId: context.organisationId,
      userId: context.userId,
      entityType: "job_load",
      entityId: load.id,
      action: "TRANSPORT_EMISSIONS_CALCULATED",
      previousState: JSON.stringify(previousState),
      newState: JSON.stringify({
        distance,
        distanceUnit,
        distanceSource,
        distanceKm: calculation.distanceKm,
        tonneKm: calculation.tonneKm,
        co2eKg: calculation.co2eKg,
        factor: calculation.factor,
      }),
      createdAt: now,
    });
  });

  revalidatePath("/home/reports/transport-emissions");
  revalidatePath("/home/reports");
  revalidatePath(`/home/jobs/${load.jobId}`);

  routeSuccess("calculated", load.id);
}
