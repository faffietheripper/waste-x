import type {
  JobCommercialCategory,
  JobCommercialKind,
  JobCommercialUnit,
} from "@/db/commercial-schema";

export type BookingCommercialLineInput = {
  kind: JobCommercialKind;
  category: JobCommercialCategory;
  description: string;
  amount: string;
  unit: JobCommercialUnit;
  vatRate: string;
  sortOrder: number;
};

export type ParsedBookingPricing = {
  primaryRevenue: BookingCommercialLineInput | null;
  haulageCost: BookingCommercialLineInput | null;
  tippingCost: BookingCommercialLineInput | null;
  sourceRateId: string | null;
};

export type BookingPricingParseResult =
  | {
      ok: true;
      data: ParsedBookingPricing;
    }
  | {
      ok: false;
      error:
        | "invalid_job_price"
        | "job_price_unit_required"
        | "invalid_job_vat_rate"
        | "invalid_haulage_cost"
        | "haulage_cost_unit_required"
        | "invalid_tipping_cost"
        | "tipping_cost_unit_required";
    };

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalText(value: FormDataEntryValue | null) {
  const valueText = clean(value);
  return valueText || null;
}

function parseMoney(
  value: FormDataEntryValue | null,
): { empty: true; value: null } | { empty: false; value: string | null } {
  const valueText = clean(value).replace(/,/g, "");

  if (!valueText) {
    return {
      empty: true,
      value: null,
    };
  }

  const parsed = Number(valueText);

  if (!Number.isFinite(parsed) || parsed < 0) {
    return {
      empty: false,
      value: null,
    };
  }

  if (parsed === 0) {
    return {
      empty: true,
      value: null,
    };
  }

  return {
    empty: false,
    value: parsed.toFixed(2),
  };
}

function parseUnit(
  value: FormDataEntryValue | null,
): JobCommercialUnit | null {
  const valueText = clean(value);

  if (
    valueText === "tonne" ||
    valueText === "load" ||
    valueText === "job"
  ) {
    return valueText;
  }

  return null;
}

function parseVatRate(
  value: FormDataEntryValue | null,
  fallback = "20.00",
) {
  const valueText = clean(value);

  if (!valueText) return fallback;

  const parsed = Number(valueText);

  if (
    !Number.isFinite(parsed) ||
    parsed < 0 ||
    parsed > 100
  ) {
    return null;
  }

  return parsed.toFixed(2);
}

function parseCost(params: {
  formData: FormData;
  amountName: string;
  unitName: string;
  category: "haulage_cost" | "tipping_cost";
  description: string;
  invalidAmountError: "invalid_haulage_cost" | "invalid_tipping_cost";
  invalidUnitError:
    | "haulage_cost_unit_required"
    | "tipping_cost_unit_required";
  sortOrder: number;
}):
  | {
      ok: true;
      line: BookingCommercialLineInput | null;
    }
  | {
      ok: false;
      error:
        | "invalid_haulage_cost"
        | "invalid_tipping_cost"
        | "haulage_cost_unit_required"
        | "tipping_cost_unit_required";
    } {
  const amount = parseMoney(
    params.formData.get(params.amountName),
  );

  if (!amount.empty && amount.value === null) {
    return {
      ok: false,
      error: params.invalidAmountError,
    };
  }

  if (!amount.value) {
    return {
      ok: true,
      line: null,
    };
  }

  const unit = parseUnit(
    params.formData.get(params.unitName),
  );

  if (!unit) {
    return {
      ok: false,
      error: params.invalidUnitError,
    };
  }

  return {
    ok: true,
    line: {
      kind: "cost",
      category: params.category,
      description: params.description,
      amount: amount.value,
      unit,
      vatRate: "0.00",
      sortOrder: params.sortOrder,
    },
  };
}

function parsePrimaryRevenue(params: {
  formData: FormData;
  amountName: string;
  unitName: string;
  vatName: string;
  descriptionName: string;
  defaultDescription: string;
  category: "customer_charge" | "material_sale";
}):
  | {
      ok: true;
      line: BookingCommercialLineInput | null;
    }
  | {
      ok: false;
      error:
        | "invalid_job_price"
        | "job_price_unit_required"
        | "invalid_job_vat_rate";
    } {
  const amount = parseMoney(
    params.formData.get(params.amountName),
  );

  if (!amount.empty && amount.value === null) {
    return {
      ok: false,
      error: "invalid_job_price",
    };
  }

  if (!amount.value) {
    return {
      ok: true,
      line: null,
    };
  }

  const unit = parseUnit(
    params.formData.get(params.unitName),
  );

  if (!unit) {
    return {
      ok: false,
      error: "job_price_unit_required",
    };
  }

  const vatRate = parseVatRate(
    params.formData.get(params.vatName),
  );

  if (!vatRate) {
    return {
      ok: false,
      error: "invalid_job_vat_rate",
    };
  }

  return {
    ok: true,
    line: {
      kind: "revenue",
      category: params.category,
      description:
        optionalText(
          params.formData.get(params.descriptionName),
        ) ?? params.defaultDescription,
      amount: amount.value,
      unit,
      vatRate,
      sortOrder: 10,
    },
  };
}

export function parseIncomingBookingPricing(
  formData: FormData,
): BookingPricingParseResult {
  const primary = parsePrimaryRevenue({
    formData,
    amountName: "customerChargeAmount",
    unitName: "customerChargeUnit",
    vatName: "customerVatRate",
    descriptionName: "customerChargeDescription",
    defaultDescription: "Waste acceptance / disposal",
    category: "customer_charge",
  });

  if (!primary.ok) return primary;

  const haulage = parseCost({
    formData,
    amountName: "haulageCostAmount",
    unitName: "haulageCostUnit",
    category: "haulage_cost",
    description: "Haulage cost",
    invalidAmountError: "invalid_haulage_cost",
    invalidUnitError: "haulage_cost_unit_required",
    sortOrder: 100,
  });

  if (!haulage.ok) return haulage;

  const tipping = parseCost({
    formData,
    amountName: "tippingCostAmount",
    unitName: "tippingCostUnit",
    category: "tipping_cost",
    description: "External facility / tipping cost",
    invalidAmountError: "invalid_tipping_cost",
    invalidUnitError: "tipping_cost_unit_required",
    sortOrder: 110,
  });

  if (!tipping.ok) return tipping;

  return {
    ok: true,
    data: {
      primaryRevenue: primary.line,
      haulageCost: haulage.line,
      tippingCost: tipping.line,
      sourceRateId:
        optionalText(
          formData.get("pricingSourceRateId"),
        ) ?? null,
    },
  };
}

export function parseOutgoingBookingPricing(
  formData: FormData,
): BookingPricingParseResult {
  const primary = parsePrimaryRevenue({
    formData,
    amountName: "materialSaleAmount",
    unitName: "materialSaleUnit",
    vatName: "materialSaleVatRate",
    descriptionName: "materialSaleDescription",
    defaultDescription: "Material sale / outgoing service",
    category: "material_sale",
  });

  if (!primary.ok) return primary;

  const haulage = parseCost({
    formData,
    amountName: "haulageCostAmount",
    unitName: "haulageCostUnit",
    category: "haulage_cost",
    description: "Haulage cost",
    invalidAmountError: "invalid_haulage_cost",
    invalidUnitError: "haulage_cost_unit_required",
    sortOrder: 100,
  });

  if (!haulage.ok) return haulage;

  const tipping = parseCost({
    formData,
    amountName: "tippingCostAmount",
    unitName: "tippingCostUnit",
    category: "tipping_cost",
    description: "External facility / tipping cost",
    invalidAmountError: "invalid_tipping_cost",
    invalidUnitError: "tipping_cost_unit_required",
    sortOrder: 110,
  });

  if (!tipping.ok) return tipping;

  return {
    ok: true,
    data: {
      primaryRevenue: primary.line,
      haulageCost: haulage.line,
      tippingCost: tipping.line,
      sourceRateId:
        optionalText(
          formData.get("pricingSourceRateId"),
        ) ?? null,
    },
  };
}

export function bookingCommercialLines(
  pricing: ParsedBookingPricing,
) {
  return [
    pricing.primaryRevenue,
    pricing.haulageCost,
    pricing.tippingCost,
  ].filter(
    (
      value,
    ): value is BookingCommercialLineInput =>
      Boolean(value),
  );
}
