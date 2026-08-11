// src/modules/sites/core/siteTypes.ts

import type { SiteStatus, SiteType } from "@/db/schema";

export const DEFAULT_SITE_NAME = "Main Site";

export const SITE_TYPE_LABELS: Record<SiteType, string> = {
  main_site: "Main Site",
  transfer_station: "Transfer Station",
  depot: "Depot",
  recycling_yard: "Recycling Yard",
  construction_site: "Construction Site",
  customer_site: "Customer Site",
  other: "Other",
};

export const SITE_STATUS_LABELS: Record<SiteStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  archived: "Archived",
};

export type OrganisationAddressInput = {
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postCode?: string | null;
};

export function buildOrganisationFullAddress(
  organisation: OrganisationAddressInput,
) {
  return [
    organisation.streetAddress,
    organisation.city,
    organisation.region,
    organisation.country,
  ]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(", ");
}

export function normaliseSiteName(value: string | null | undefined) {
  const cleaned = value?.trim();

  return cleaned && cleaned.length > 0 ? cleaned : DEFAULT_SITE_NAME;
}

export function getSiteTypeLabel(siteType: SiteType | null | undefined) {
  if (!siteType) return "Site";

  return SITE_TYPE_LABELS[siteType] ?? "Site";
}

export function getSiteStatusLabel(status: SiteStatus | null | undefined) {
  if (!status) return "Unknown";

  return SITE_STATUS_LABELS[status] ?? "Unknown";
}

export function isActiveSite(status: SiteStatus | null | undefined) {
  return status === "active";
}