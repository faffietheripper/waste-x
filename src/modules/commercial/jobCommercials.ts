import type {
  JobCommercialKind,
  JobCommercialUnit,
} from "@/db/commercial-schema";

export type CommercialLoadInput = {
  status: string;
  netWeight: string | number | null;
  weightMetric: "Grams" | "Kilograms" | "Tonnes";
};

export type CommercialLineInput = {
  id: string;
  kind: JobCommercialKind;
  description: string;
  amount: string | number;
  unit: JobCommercialUnit;
  vatRate: string | number;
  sortOrder?: number | null;
};

export type CalculatedCommercialLine = {
  id: string;
  kind: JobCommercialKind;
  description: string;
  quantity: number;
  unit: JobCommercialUnit;
  unitPrice: number;
  vatRate: number;
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
};

function numberValue(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value !== "string") return 0;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function weightToTonnes(
  value: string | number | null | undefined,
  metric: CommercialLoadInput["weightMetric"],
) {
  const amount = numberValue(value);

  if (metric === "Kilograms") return amount / 1000;
  if (metric === "Grams") return amount / 1_000_000;
  return amount;
}

export function completedJobQuantities(loads: CommercialLoadInput[]) {
  const completed = loads.filter((load) => load.status === "completed");

  return {
    completedLoads: completed.length,
    tonnes: roundQuantity(
      completed.reduce(
        (sum, load) => sum + weightToTonnes(load.netWeight, load.weightMetric),
        0,
      ),
    ),
  };
}

export function quantityForUnit(
  unit: JobCommercialUnit,
  quantities: ReturnType<typeof completedJobQuantities>,
) {
  if (unit === "tonne") return quantities.tonnes;
  if (unit === "load") return quantities.completedLoads;
  return 1;
}

export function calculateCommercialLine(
  line: CommercialLineInput,
  quantities: ReturnType<typeof completedJobQuantities>,
): CalculatedCommercialLine {
  const quantity = quantityForUnit(line.unit, quantities);
  const unitPrice = numberValue(line.amount);
  const vatRate = Math.max(0, numberValue(line.vatRate));
  const netAmount = roundMoney(quantity * unitPrice);
  const vatAmount = roundMoney(netAmount * (vatRate / 100));

  return {
    id: line.id,
    kind: line.kind,
    description: line.description,
    quantity,
    unit: line.unit,
    unitPrice,
    vatRate,
    netAmount,
    vatAmount,
    grossAmount: roundMoney(netAmount + vatAmount),
  };
}

export function calculateJobCommercials(params: {
  lines: CommercialLineInput[];
  loads: CommercialLoadInput[];
}) {
  const quantities = completedJobQuantities(params.loads);

  const calculated = [...params.lines]
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((line) => calculateCommercialLine(line, quantities));

  const revenueLines = calculated.filter((line) => line.kind === "revenue");
  const costLines = calculated.filter((line) => line.kind === "cost");

  const revenue = roundMoney(
    revenueLines.reduce((sum, line) => sum + line.netAmount, 0),
  );
  const directCost = roundMoney(
    costLines.reduce((sum, line) => sum + line.netAmount, 0),
  );

  const missingQuantity = calculated.some(
    (line) =>
      (line.unit === "tonne" || line.unit === "load") &&
      line.quantity <= 0,
  );

  return {
    ...quantities,
    calculated,
    revenueLines,
    costLines,
    revenue,
    directCost,
    margin: roundMoney(revenue - directCost),
    hasRevenue: revenueLines.length > 0,
    missingQuantity,
  };
}
