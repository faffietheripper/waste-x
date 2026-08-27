import {
  and,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import {
  transportPostcodeRouteCache,
  transportRouteSnapshots,
} from "@/db/carbon-schema";
import { database } from "@/db/database";
import {
  auditEvents,
  jobLoads,
  sites,
} from "@/db/schema";
import {
  calculateTransportEmissions,
  getTransportCarbonFactor,
  type TransportWeightMetric,
} from "@/modules/carbon/core/calculateTransportEmissions";
import {
  getRoadDistance,
  normaliseUkPostcode,
  resolvePostcodeCoordinates,
  routePairKey,
} from "@/modules/carbon/core/postcodeRouting";
import { deriveTransportRouteContext } from "@/modules/carbon/core/transportRouteContext";

function numeric(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function validWeightMetric(value: string): value is TransportWeightMetric {
  return value === "Tonnes" || value === "Kilograms" || value === "Grams";
}

type CalculationResult = {
  calculatedLoads: number;
  routePairsCalculated: number;
  skippedMissingPostcode: number;
  skippedInvalidWeight: number;
  failedRoutes: number;
};

export async function calculateAutomaticTransportEmissions(params: {
  organisationId: string;
  userId: string;
  loadIds?: string[];
  force?: boolean;
  maxUniqueRoutes?: number;
}): Promise<CalculationResult> {
  const maxUniqueRoutes = Math.max(1, params.maxUniqueRoutes ?? 40);

  const defaultOwnSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, params.organisationId),
      eq(sites.isDefault, true),
    ),
    columns: {
      id: true,
      name: true,
      postcode: true,
    },
  });

  const where = params.loadIds?.length
    ? and(
        eq(jobLoads.organisationId, params.organisationId),
        eq(jobLoads.status, "completed"),
        inArray(jobLoads.id, params.loadIds),
      )
    : and(
        eq(jobLoads.organisationId, params.organisationId),
        eq(jobLoads.status, "completed"),
      );

  const loads = await database.query.jobLoads.findMany({
    where,
    with: {
      job: true,
      client: true,
      clientSite: true,
      ownSite: true,
      thirdPartyDestinationSite: true,
      vehicle: true,
      haulier: true,
    },
    orderBy: [desc(jobLoads.completedAt), desc(jobLoads.updatedAt)],
    limit: params.loadIds?.length ? Math.max(params.loadIds.length, 1) : 500,
  });

  if (loads.length === 0) {
    return {
      calculatedLoads: 0,
      routePairsCalculated: 0,
      skippedMissingPostcode: 0,
      skippedInvalidWeight: 0,
      failedRoutes: 0,
    };
  }

  const loadIds = loads.map((load) => load.id);

  const snapshots = await database.query.transportRouteSnapshots.findMany({
    where: and(
      eq(transportRouteSnapshots.organisationId, params.organisationId),
      inArray(transportRouteSnapshots.jobLoadId, loadIds),
    ),
  });
  const snapshotMap = new Map(snapshots.map((row) => [row.jobLoadId, row]));

  type Prepared = {
    load: (typeof loads)[number];
    originPostcode: string;
    destinationPostcode: string;
    pairKey: string;
  };

  const prepared: Prepared[] = [];
  let skippedMissingPostcode = 0;
  let skippedInvalidWeight = 0;

  for (const load of loads) {
    const snapshot = snapshotMap.get(load.id);

    const route = deriveTransportRouteContext({
      direction: load.direction,
      clientSite: load.clientSite,
      ownSite: load.ownSite,
      thirdPartyDestinationSite: load.thirdPartyDestinationSite,
      defaultOwnSite,
      originPostcodeOverride: snapshot?.originPostcode,
      destinationPostcodeOverride: snapshot?.destinationPostcode,
      originOverrideEnabled: snapshot?.originPostcodeOverride ?? false,
      destinationOverrideEnabled:
        snapshot?.destinationPostcodeOverride ?? false,
    });

    const originPostcode = normaliseUkPostcode(route.origin.postcode);
    const destinationPostcode = normaliseUkPostcode(route.destination.postcode);

    if (!originPostcode || !destinationPostcode) {
      skippedMissingPostcode += 1;

      await database
        .insert(transportRouteSnapshots)
        .values({
          organisationId: params.organisationId,
          jobLoadId: load.id,
          originPostcode: originPostcode || null,
          destinationPostcode: destinationPostcode || null,
          originPostcodeOverride: snapshot?.originPostcodeOverride ?? false,
          destinationPostcodeOverride:
            snapshot?.destinationPostcodeOverride ?? false,
          status: "missing_postcode",
          lastError:
            !originPostcode && !destinationPostcode
              ? "Origin and destination postcodes are missing."
              : !originPostcode
                ? "Origin postcode is missing."
                : "Destination postcode is missing.",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: transportRouteSnapshots.jobLoadId,
          set: {
            originPostcode: originPostcode || null,
            destinationPostcode: destinationPostcode || null,
            status: "missing_postcode",
            lastError:
              !originPostcode && !destinationPostcode
                ? "Origin and destination postcodes are missing."
                : !originPostcode
                  ? "Origin postcode is missing."
                  : "Destination postcode is missing.",
            updatedAt: new Date(),
          },
        });

      continue;
    }

    const weight = numeric(load.netWeight);
    if (weight <= 0 || !validWeightMetric(load.weightMetric)) {
      skippedInvalidWeight += 1;
      continue;
    }

    const sameRouteAsSnapshot =
      snapshot?.originPostcode === originPostcode &&
      snapshot?.destinationPostcode === destinationPostcode;

    const alreadyCalculated =
      Boolean(load.transportCarbonCalculatedAt) &&
      load.transportDistanceKm !== null &&
      sameRouteAsSnapshot &&
      snapshot?.status === "calculated";

    if (alreadyCalculated && !params.force) {
      continue;
    }

    prepared.push({
      load,
      originPostcode,
      destinationPostcode,
      pairKey: routePairKey(originPostcode, destinationPostcode),
    });
  }

  if (prepared.length === 0) {
    return {
      calculatedLoads: 0,
      routePairsCalculated: 0,
      skippedMissingPostcode,
      skippedInvalidWeight,
      failedRoutes: 0,
    };
  }

  const uniquePairs = Array.from(
    new Map(prepared.map((row) => [row.pairKey, row])).values(),
  );

  const cachedRoutes = await database.query.transportPostcodeRouteCache.findMany({
    where: eq(
      transportPostcodeRouteCache.organisationId,
      params.organisationId,
    ),
  });
  const cacheMap = new Map(
    cachedRoutes.map((row) => [
      routePairKey(row.originPostcode, row.destinationPostcode),
      row,
    ]),
  );

  const uncachedPairs = uniquePairs
    .filter((pair) => !cacheMap.has(pair.pairKey))
    .slice(0, maxUniqueRoutes);

  const postcodesToResolve = uncachedPairs.flatMap((pair) => [
    pair.originPostcode,
    pair.destinationPostcode,
  ]);

  let coordinates = new Map<
    string,
    { postcode: string; latitude: number; longitude: number }
  >();

  if (postcodesToResolve.length > 0) {
    try {
      coordinates = await resolvePostcodeCoordinates(postcodesToResolve);
    } catch {
      coordinates = new Map();
    }
  }

  let routePairsCalculated = 0;
  let failedRoutes = 0;

  /*
    Keep routing requests sequential. The public default endpoint is useful for
    development/demo traffic; production can point WASTE_X_OSRM_BASE_URL at a
    self-hosted or managed OSRM-compatible service without changing this code.
  */
  for (const pair of uncachedPairs) {
    const origin = coordinates.get(pair.originPostcode);
    const destination = coordinates.get(pair.destinationPostcode);

    if (!origin || !destination) {
      failedRoutes += 1;
      continue;
    }

    try {
      const route = await getRoadDistance({ origin, destination });

      const [saved] = await database
        .insert(transportPostcodeRouteCache)
        .values({
          organisationId: params.organisationId,
          originPostcode: route.origin.postcode,
          destinationPostcode: route.destination.postcode,
          originLatitude: route.origin.latitude.toFixed(7),
          originLongitude: route.origin.longitude.toFixed(7),
          destinationLatitude: route.destination.latitude.toFixed(7),
          destinationLongitude: route.destination.longitude.toFixed(7),
          distanceKm: route.distanceKm.toFixed(3),
          routeProvider: route.provider,
          routeProfile: route.profile,
          calculatedAt: new Date(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [
            transportPostcodeRouteCache.organisationId,
            transportPostcodeRouteCache.originPostcode,
            transportPostcodeRouteCache.destinationPostcode,
          ],
          set: {
            originLatitude: route.origin.latitude.toFixed(7),
            originLongitude: route.origin.longitude.toFixed(7),
            destinationLatitude: route.destination.latitude.toFixed(7),
            destinationLongitude: route.destination.longitude.toFixed(7),
            distanceKm: route.distanceKm.toFixed(3),
            routeProvider: route.provider,
            routeProfile: route.profile,
            calculatedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();

      if (saved) {
        cacheMap.set(pair.pairKey, saved);
      }

      routePairsCalculated += 1;
    } catch {
      failedRoutes += 1;
    }
  }

  const factor = getTransportCarbonFactor();
  let calculatedLoads = 0;

  for (const item of prepared) {
    const cached = cacheMap.get(item.pairKey);

    if (!cached) {
      const existingSnapshot = snapshotMap.get(item.load.id);
      await database
        .insert(transportRouteSnapshots)
        .values({
          organisationId: params.organisationId,
          jobLoadId: item.load.id,
          originPostcode: item.originPostcode,
          destinationPostcode: item.destinationPostcode,
          originPostcodeOverride:
            existingSnapshot?.originPostcodeOverride ?? false,
          destinationPostcodeOverride:
            existingSnapshot?.destinationPostcodeOverride ?? false,
          status: "route_failed",
          lastError:
            "Waste X could not calculate a road route for these postcodes yet.",
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: transportRouteSnapshots.jobLoadId,
          set: {
            originPostcode: item.originPostcode,
            destinationPostcode: item.destinationPostcode,
            status: "route_failed",
            lastError:
              "Waste X could not calculate a road route for these postcodes yet.",
            updatedAt: new Date(),
          },
        });
      continue;
    }

    const weight = numeric(item.load.netWeight);
    if (!validWeightMetric(item.load.weightMetric)) continue;

    const distanceKm = numeric(cached.distanceKm);

    const calculation =
      distanceKm === 0
        ? {
            tonnes:
              item.load.weightMetric === "Tonnes"
                ? weight
                : item.load.weightMetric === "Kilograms"
                  ? weight / 1000
                  : weight / 1_000_000,
            distanceKm: 0,
            tonneKm: 0,
            co2eKg: 0,
            factor,
          }
        : calculateTransportEmissions({
            weightAmount: weight,
            weightMetric: item.load.weightMetric,
            distance: distanceKm,
            distanceUnit: "km",
            factor,
          });

    const now = new Date();
    const previousState = {
      transportDistanceKm: item.load.transportDistanceKm,
      transportDistanceSource: item.load.transportDistanceSource,
      transportCo2eKg: item.load.transportCo2eKg,
      transportCarbonCalculatedAt: item.load.transportCarbonCalculatedAt,
    };

    await database.transaction(async (tx) => {
      await tx
        .update(jobLoads)
        .set({
          transportDistanceKm: calculation.distanceKm.toFixed(3),
          /* postcode-centroid road routing is an estimate, not odometer data */
          transportDistanceSource: "estimated",
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
            eq(jobLoads.id, item.load.id),
            eq(jobLoads.organisationId, params.organisationId),
          ),
        );

      const existingSnapshot = snapshotMap.get(item.load.id);

      await tx
        .insert(transportRouteSnapshots)
        .values({
          organisationId: params.organisationId,
          jobLoadId: item.load.id,
          originPostcode: item.originPostcode,
          destinationPostcode: item.destinationPostcode,
          originPostcodeOverride:
            existingSnapshot?.originPostcodeOverride ?? false,
          destinationPostcodeOverride:
            existingSnapshot?.destinationPostcodeOverride ?? false,
          originLatitude: cached.originLatitude,
          originLongitude: cached.originLongitude,
          destinationLatitude: cached.destinationLatitude,
          destinationLongitude: cached.destinationLongitude,
          distanceKm: calculation.distanceKm.toFixed(3),
          routeProvider: cached.routeProvider,
          routeProfile: cached.routeProfile,
          status: "calculated",
          lastError: null,
          calculatedAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: transportRouteSnapshots.jobLoadId,
          set: {
            originPostcode: item.originPostcode,
            destinationPostcode: item.destinationPostcode,
            originLatitude: cached.originLatitude,
            originLongitude: cached.originLongitude,
            destinationLatitude: cached.destinationLatitude,
            destinationLongitude: cached.destinationLongitude,
            distanceKm: calculation.distanceKm.toFixed(3),
            routeProvider: cached.routeProvider,
            routeProfile: cached.routeProfile,
            status: "calculated",
            lastError: null,
            calculatedAt: now,
            updatedAt: now,
          },
        });

      await tx.insert(auditEvents).values({
        organisationId: params.organisationId,
        userId: params.userId,
        entityType: "job_load",
        entityId: item.load.id,
        action: "TRANSPORT_EMISSIONS_AUTO_CALCULATED",
        previousState: JSON.stringify(previousState),
        newState: JSON.stringify({
          originPostcode: item.originPostcode,
          destinationPostcode: item.destinationPostcode,
          distanceKm: calculation.distanceKm,
          routeProvider: cached.routeProvider,
          tonneKm: calculation.tonneKm,
          co2eKg: calculation.co2eKg,
          factor: calculation.factor,
        }),
        createdAt: now,
      });
    });

    calculatedLoads += 1;
  }

  return {
    calculatedLoads,
    routePairsCalculated,
    skippedMissingPostcode,
    skippedInvalidWeight,
    failedRoutes,
  };
}
