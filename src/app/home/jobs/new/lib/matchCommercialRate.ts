import type { BookJobRate } from "./types";

type RateContext = {
  rateType: BookJobRate["rateType"];
  counterpartyId: string | null;
  counterpartySiteId: string | null;
  ownSiteId: string | null;
  materialProfileId: string | null;
  at: Date;
};

function isEffective(rate: BookJobRate, at: Date) {
  const from = rate.effectiveFrom ? new Date(rate.effectiveFrom) : null;
  const to = rate.effectiveTo ? new Date(rate.effectiveTo) : null;

  if (from && from > at) return false;
  if (to && to < at) return false;
  return true;
}

function scopedValueMatches(
  configured: string | null,
  actual: string | null,
) {
  return configured === null || configured === actual;
}

function specificity(rate: BookJobRate) {
  let score = 0;

  if (rate.counterpartyId) score += 16;
  if (rate.counterpartySiteId) score += 8;
  if (rate.materialProfileId) score += 4;
  if (rate.ownSiteId) score += 2;

  return score;
}

export function matchCommercialRate(
  rates: BookJobRate[],
  context: RateContext,
) {
  const candidates = rates
    .filter((rate) => rate.rateType === context.rateType)
    .filter((rate) => isEffective(rate, context.at))
    .filter((rate) =>
      scopedValueMatches(rate.counterpartyId, context.counterpartyId),
    )
    .filter((rate) =>
      scopedValueMatches(rate.counterpartySiteId, context.counterpartySiteId),
    )
    .filter((rate) =>
      scopedValueMatches(rate.ownSiteId, context.ownSiteId),
    )
    .filter((rate) =>
      scopedValueMatches(rate.materialProfileId, context.materialProfileId),
    )
    .sort((a, b) => {
      const specificityDifference = specificity(b) - specificity(a);
      if (specificityDifference !== 0) return specificityDifference;

      const aFrom = a.effectiveFrom ? new Date(a.effectiveFrom).getTime() : 0;
      const bFrom = b.effectiveFrom ? new Date(b.effectiveFrom).getTime() : 0;
      if (aFrom !== bFrom) return bFrom - aFrom;

      return a.id.localeCompare(b.id);
    });

  return candidates[0] ?? null;
}
