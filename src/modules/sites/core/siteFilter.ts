// src/modules/sites/core/siteFilter.ts

export const ALL_SITES_FILTER_VALUE = "all";

export type SiteFilterSearchParams = {
  siteId?: string | string[] | null;
};

export type SiteFilterOption = {
  id: string;
  name: string;
  siteType: string;
  isDefault: boolean;
};

export type ResolvedSiteFilter = {
  requestedSiteId: string | null;
  selectedSiteId: string | null;
  selectedSite: SiteFilterOption | null;
  activeSites: SiteFilterOption[];
  isAllSites: boolean;
  hasMultipleSites: boolean;
  label: string;
};

export function normaliseSiteFilterValue(
  value: string | string[] | null | undefined,
) {
  const rawValue = Array.isArray(value) ? value[0] : value;

  if (!rawValue) {
    return null;
  }

  const cleaned = rawValue.trim();

  if (!cleaned || cleaned === ALL_SITES_FILTER_VALUE) {
    return null;
  }

  return cleaned;
}

export function getSiteFilterLabel({
  selectedSite,
  isAllSites,
}: {
  selectedSite: SiteFilterOption | null;
  isAllSites: boolean;
}) {
  if (isAllSites) {
    return "All Sites";
  }

  return selectedSite?.name ?? "Selected Site";
}

export function buildSiteFilteredHref({
  pathname,
  siteId,
  existingSearchParams,
}: {
  pathname: string;
  siteId?: string | null;
  existingSearchParams?: URLSearchParams;
}) {
  const params = new URLSearchParams(existingSearchParams?.toString());

  if (siteId && siteId !== ALL_SITES_FILTER_VALUE) {
    params.set("siteId", siteId);
  } else {
    params.delete("siteId");
  }

  const query = params.toString();

  return query ? `${pathname}?${query}` : pathname;
}