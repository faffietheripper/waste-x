// src/modules/sites/core/siteTypes.ts

import type {
  SiteStatus,
  SiteType,
} from "@/db/schema";

/* =========================================================
   DEFAULTS
========================================================= */

export const DEFAULT_SITE_NAME =
  "Main Site";

/* =========================================================
   SITE TYPE LABELS
========================================================= */

export const SITE_TYPE_LABELS: Record<
  SiteType,
  string
> = {
  main_site:
    "Main Site",

  waste_receiving_site:
    "Waste Receiving Site",

  transfer_station:
    "Transfer Station",

  depot:
    "Depot",

  recycling_yard:
    "Recycling Yard",

  construction_site:
    "Construction Site",

  customer_site:
    "Customer Site",

  other:
    "Other",
};

/* =========================================================
   SITE STATUS LABELS
========================================================= */

export const SITE_STATUS_LABELS: Record<
  SiteStatus,
  string
> = {
  active:
    "Active",

  inactive:
    "Inactive",

  archived:
    "Archived",
};

/* =========================================================
   ORGANISATION ADDRESS INPUT
========================================================= */

export type OrganisationAddressInput = {
  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postCode?: string | null;
};

/* =========================================================
   ADDRESS HELPERS
========================================================= */

export function buildOrganisationFullAddress(
  organisation: OrganisationAddressInput,
) {
  return [
    organisation.streetAddress,
    organisation.city,
    organisation.region,
    organisation.country,
  ]
    .filter(
      (
        part,
      ): part is string =>
        Boolean(
          part &&
            part.trim(),
        ),
    )
    .join(", ");
}

/* =========================================================
   SITE NAME
========================================================= */

export function normaliseSiteName(
  value:
    | string
    | null
    | undefined,
) {
  const cleaned =
    value?.trim();

  return cleaned &&
    cleaned.length > 0
    ? cleaned
    : DEFAULT_SITE_NAME;
}

/* =========================================================
   SITE TYPE LABEL
========================================================= */

export function getSiteTypeLabel(
  siteType:
    | SiteType
    | null
    | undefined,
) {
  if (!siteType) {
    return "Site";
  }

  return (
    SITE_TYPE_LABELS[
      siteType
    ] ?? "Site"
  );
}

/* =========================================================
   SITE STATUS LABEL
========================================================= */

export function getSiteStatusLabel(
  status:
    | SiteStatus
    | null
    | undefined,
) {
  if (!status) {
    return "Unknown";
  }

  return (
    SITE_STATUS_LABELS[
      status
    ] ?? "Unknown"
  );
}

/* =========================================================
   ACTIVE SITE CHECK
========================================================= */

export function isActiveSite(
  status:
    | SiteStatus
    | null
    | undefined,
) {
  return status === "active";
}