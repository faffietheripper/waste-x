export type CommercialRateUnit = "tonne" | "load" | "job";
export type WeightMetric = "Grams" | "Kilograms" | "Tonnes";

export type CommercialLoadLike = {
  id: string;
  status: string;
  netWeight: string | number | null;
  weightMetric: WeightMetric;

  customerChargeAmount: string | number | null;
  customerChargeUnit: CommercialRateUnit | null;

  haulageCostAmount: string | number | null;
  haulageCostUnit: CommercialRateUnit | null;

  tippingCostAmount: string | number | null;
  tippingCostUnit: CommercialRateUnit | null;
};

export type JobCommercialSummary = {
  completedLoads: number;
  tonnes: number;
  revenue: number;
  haulageCost: number;
  tippingCost: number;
  directCost: number;
  margin: number;
  missingCustomerPrice: boolean;
  missingWeightForPricedLoad: boolean;
  pricingIssues: string[];
};

export function numberValue(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value !== "string") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function weightToTonnes(
  value: string | number | null | undefined,
  metric: WeightMetric,
): number {
  const amount = numberValue(value);

  if (amount <= 0) return 0;

  if (metric === "Kilograms") return amount / 1000;
  if (metric === "Grams") return amount / 1_000_000;

  return amount;
}

function calculateComponent(params: {
  loads: CommercialLoadLike[];
  amountFor: (load: CommercialLoadLike) => string | number | null;
  unitFor: (load: CommercialLoadLike) => CommercialRateUnit | null;
  label: string;
}) {
  let total = 0;
  let countedJobRate = false;
  let hadAnyRate = false;
  let missingWeight = false;
  const issues: string[] = [];

  for (const load of params.loads) {
    const amount = numberValue(params.amountFor(load));
    const unit = params.unitFor(load);

    if (amount <= 0 || !unit) continue;

    hadAnyRate = true;

    if (unit === "job") {
      if (!countedJobRate) {
        total += amount;
        countedJobRate = true;
      }

      continue;
    }

    if (unit === "load") {
      total += amount;
      continue;
    }

    const tonnes = weightToTonnes(load.netWeight, load.weightMetric);

    if (tonnes <= 0) {
      missingWeight = true;
      issues.push(
        `${params.label}: load ${load.id.slice(0, 8)} has a per-tonne rate but no usable net weight.`,
      );
      continue;
    }

    total += amount * tonnes;
  }

  return {
    total,
    hadAnyRate,
    missingWeight,
    issues,
  };
}

export function calculateJobCommercials(
  inputLoads: CommercialLoadLike[],
): JobCommercialSummary {
  const loads = inputLoads.filter((load) => load.status === "completed");

  const tonnes = loads.reduce(
    (sum, load) => sum + weightToTonnes(load.netWeight, load.weightMetric),
    0,
  );

  const revenue = calculateComponent({
    loads,
    amountFor: (load) => load.customerChargeAmount,
    unitFor: (load) => load.customerChargeUnit,
    label: "Customer charge",
  });

  const haulage = calculateComponent({
    loads,
    amountFor: (load) => load.haulageCostAmount,
    unitFor: (load) => load.haulageCostUnit,
    label: "Haulage cost",
  });

  const tipping = calculateComponent({
    loads,
    amountFor: (load) => load.tippingCostAmount,
    unitFor: (load) => load.tippingCostUnit,
    label: "Tipping cost",
  });

  const directCost = haulage.total + tipping.total;
  const margin = revenue.total - directCost;

  return {
    completedLoads: loads.length,
    tonnes,
    revenue: revenue.total,
    haulageCost: haulage.total,
    tippingCost: tipping.total,
    directCost,
    margin,
    missingCustomerPrice: !revenue.hadAnyRate,
    missingWeightForPricedLoad:
      revenue.missingWeight || haulage.missingWeight || tipping.missingWeight,
    pricingIssues: [
      ...revenue.issues,
      ...haulage.issues,
      ...tipping.issues,
    ],
  };
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundTonnes(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}
