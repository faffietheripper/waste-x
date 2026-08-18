"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import {
  auditEvents,
  jobLoads,
} from "@/db/schema";

import {
  TRANSPORT_DISTANCE_SOURCES,
  calculateTransportEmissions,
  type TransportDistanceSource,
  type TransportDistanceUnit,
  type TransportWeightMetric,
} from "@/modules/carbon/core/calculateTransportEmissions";

import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

function clean(
  value: FormDataEntryValue | null,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function routeError(code: string): never {
  redirect(
    `/home/reports/transport-emissions?error=${encodeURIComponent(
      code,
    )}`,
  );
}

function isDistanceUnit(
  value: string,
): value is TransportDistanceUnit {
  return value === "km" ||
    value === "miles";
}

function isDistanceSource(
  value: string,
): value is TransportDistanceSource {
  return (
    TRANSPORT_DISTANCE_SOURCES as readonly string[]
  ).includes(value);
}

function isWeightMetric(
  value: string,
): value is TransportWeightMetric {
  return (
    value === "Tonnes" ||
    value === "Kilograms" ||
    value === "Grams"
  );
}

export async function saveTransportEmissionsAction(
  formData: FormData,
) {
  /*
    Viewing the report uses reports:view.
    Changing factual movement distance is an operational mutation, so the
    stronger worksheet:operate permission is required here.
  */
  const context =
    await requireSoloPermission(
      "worksheet:operate",
    );

  const loadId =
    clean(formData.get("loadId"));

  const rawDistance =
    clean(formData.get("distance"));

  const distance =
    Number(rawDistance);

  const distanceUnit =
    clean(formData.get("distanceUnit"));

  const distanceSource =
    clean(formData.get("distanceSource"));

  if (!loadId) {
    routeError("load_required");
  }

  if (
    !Number.isFinite(distance) ||
    distance <= 0
  ) {
    routeError("distance_required");
  }

  if (!isDistanceUnit(distanceUnit)) {
    routeError("invalid_distance_unit");
  }

  if (!isDistanceSource(distanceSource)) {
    routeError("invalid_distance_source");
  }

  const load =
    await database.query.jobLoads.findFirst({
      where: and(
        eq(jobLoads.id, loadId),
        eq(
          jobLoads.organisationId,
          context.organisationId,
        ),
      ),

      columns: {
        id: true,
        jobId: true,
        status: true,

        netWeight: true,
        weightMetric: true,

        transportDistanceKm: true,
        transportDistanceSource: true,

        transportCarbonMethod: true,
        transportCarbonFactorKgPerTonneKm:
          true,
        transportCarbonFactorSource: true,
        transportCarbonFactorYear: true,
        transportCo2eKg: true,
        transportCarbonCalculatedAt: true,
      },
    });

  if (!load) {
    routeError("load_not_found");
  }

  if (load.status !== "completed") {
    routeError("load_not_completed");
  }

  const weight =
    Number(load.netWeight ?? "0");

  if (
    !Number.isFinite(weight) ||
    weight <= 0
  ) {
    routeError("net_weight_required");
  }

  if (!isWeightMetric(load.weightMetric)) {
    routeError("invalid_weight_metric");
  }

  const calculation =
    calculateTransportEmissions({
      weightAmount: weight,
      weightMetric: load.weightMetric,
      distance,
      distanceUnit,
    });

  const now = new Date();

  const previousState = {
    transportDistanceKm:
      load.transportDistanceKm,
    transportDistanceSource:
      load.transportDistanceSource,
    transportCarbonMethod:
      load.transportCarbonMethod,
    transportCarbonFactorKgPerTonneKm:
      load.transportCarbonFactorKgPerTonneKm,
    transportCarbonFactorSource:
      load.transportCarbonFactorSource,
    transportCarbonFactorYear:
      load.transportCarbonFactorYear,
    transportCo2eKg:
      load.transportCo2eKg,
    transportCarbonCalculatedAt:
      load.transportCarbonCalculatedAt,
  };

  const newState = {
    transportDistanceKm:
      calculation.distanceKm.toFixed(3),

    transportDistanceSource:
      distanceSource,

    transportCarbonMethod:
      "tonne_km" as const,

    transportCarbonFactorKgPerTonneKm:
      calculation.factor.kgCo2ePerTonneKm.toFixed(
        6,
      ),

    transportCarbonFactorSource:
      calculation.factor.source,

    transportCarbonFactorYear:
      calculation.factor.year,

    transportCo2eKg:
      calculation.co2eKg.toFixed(3),

    transportCarbonCalculatedAt:
      now,
  };

  await database.transaction(async (tx) => {
    await tx
      .update(jobLoads)
      .set({
        ...newState,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoads.id, load.id),
          eq(
            jobLoads.organisationId,
            context.organisationId,
          ),
        ),
      );

    await tx.insert(auditEvents).values({
      organisationId:
        context.organisationId,

      userId:
        context.userId,

      entityType:
        "job_load",

      entityId:
        load.id,

      action:
        "TRANSPORT_EMISSIONS_CALCULATED",

      previousState:
        JSON.stringify(previousState),

      newState:
        JSON.stringify({
          ...newState,
          input: {
            distance,
            distanceUnit,
            distanceSource,
            netWeight:
              load.netWeight,
            weightMetric:
              load.weightMetric,
          },
          tonneKm:
            calculation.tonneKm,
        }),

      createdAt:
        now,
    });
  });

  revalidatePath(
    "/home/reports/transport-emissions",
  );
  revalidatePath("/home/reports");
  revalidatePath("/home/worksheet");
  revalidatePath(`/home/jobs/${load.jobId}`);

  redirect(
    `/home/reports/transport-emissions?success=calculated&loadId=${encodeURIComponent(
      load.id,
    )}`,
  );
}
