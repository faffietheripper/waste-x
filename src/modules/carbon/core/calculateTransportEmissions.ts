export const TRANSPORT_DISTANCE_SOURCES = [
  "measured",
  "estimated",
  "customer_provided",
] as const;

export type TransportDistanceSource =
  (typeof TRANSPORT_DISTANCE_SOURCES)[number];

export type TransportDistanceUnit =
  | "km"
  | "miles";

export type TransportWeightMetric =
  | "Grams"
  | "Kilograms"
  | "Tonnes";

export type TransportCarbonFactor = {
  kgCo2ePerTonneKm: number;
  source: string;
  year: number;
  isConfiguredOverride: boolean;
};

/*
  MVP FALLBACK FACTOR
  -------------------

  Waste X uses the UK Government freight tonne-km methodology.

  We have deliberately NOT invented an exact 2026 workbook coefficient.

  Until the organisation/deployment pins a verified current coefficient through
  environment configuration, the calculation uses the transparent UK Government
  analytical HGV baseline of 0.07 kg CO2e per tonne-km.

  The source/year is snapshotted onto every calculated Job Load.

  Production can pin the exact current workbook factor without changing schema:
    WASTE_X_TRANSPORT_CO2E_FACTOR_KG_PER_TKM
    WASTE_X_TRANSPORT_CO2E_FACTOR_SOURCE
    WASTE_X_TRANSPORT_CO2E_FACTOR_YEAR
*/
const UK_GOV_HGV_BASELINE_KG_CO2E_PER_TKM =
  0.07;

const UK_GOV_HGV_BASELINE_SOURCE =
  "UK Government HGV all-diesel 100% laden analytical baseline";

const UK_GOV_HGV_BASELINE_YEAR = 2024;

function positiveNumber(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed) &&
    parsed > 0
    ? parsed
    : null;
}

export function getTransportCarbonFactor(): TransportCarbonFactor {
  const configuredFactor =
    positiveNumber(
      process.env
        .WASTE_X_TRANSPORT_CO2E_FACTOR_KG_PER_TKM,
    );

  const configuredYear =
    Number(
      process.env
        .WASTE_X_TRANSPORT_CO2E_FACTOR_YEAR,
    );

  if (configuredFactor) {
    return {
      kgCo2ePerTonneKm:
        configuredFactor,

      source:
        process.env
          .WASTE_X_TRANSPORT_CO2E_FACTOR_SOURCE
          ?.trim() ||
        "Configured UK Government freight factor",

      year:
        Number.isInteger(configuredYear) &&
        configuredYear >= 2000
          ? configuredYear
          : 2026,

      isConfiguredOverride: true,
    };
  }

  return {
    kgCo2ePerTonneKm:
      UK_GOV_HGV_BASELINE_KG_CO2E_PER_TKM,

    source:
      UK_GOV_HGV_BASELINE_SOURCE,

    year:
      UK_GOV_HGV_BASELINE_YEAR,

    isConfiguredOverride: false,
  };
}

export function convertDistanceToKm(params: {
  distance: number;
  unit: TransportDistanceUnit;
}) {
  if (
    !Number.isFinite(params.distance) ||
    params.distance <= 0
  ) {
    throw new Error("invalid_distance");
  }

  if (params.unit === "miles") {
    return params.distance * 1.609344;
  }

  return params.distance;
}

export function convertWeightToTonnes(params: {
  amount: number;
  metric: TransportWeightMetric;
}) {
  if (
    !Number.isFinite(params.amount) ||
    params.amount <= 0
  ) {
    throw new Error("invalid_weight");
  }

  if (params.metric === "Kilograms") {
    return params.amount / 1000;
  }

  if (params.metric === "Grams") {
    return params.amount / 1_000_000;
  }

  return params.amount;
}

export function calculateTransportEmissions(params: {
  weightAmount: number;
  weightMetric: TransportWeightMetric;
  distance: number;
  distanceUnit: TransportDistanceUnit;
  factor?: TransportCarbonFactor;
}) {
  const tonnes =
    convertWeightToTonnes({
      amount: params.weightAmount,
      metric: params.weightMetric,
    });

  const distanceKm =
    convertDistanceToKm({
      distance: params.distance,
      unit: params.distanceUnit,
    });

  const factor =
    params.factor ??
    getTransportCarbonFactor();

  const tonneKm =
    tonnes * distanceKm;

  const co2eKg =
    tonneKm *
    factor.kgCo2ePerTonneKm;

  return {
    tonnes,
    distanceKm,
    tonneKm,
    co2eKg,
    co2eTonnes: co2eKg / 1000,
    factor,
  };
}
