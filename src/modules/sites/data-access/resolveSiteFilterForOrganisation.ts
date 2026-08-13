// src/modules/sites/data-access/resolveSiteFilterForOrganisation.ts

import {
  getSiteFilterLabel,
  normaliseSiteFilterValue,
  type ResolvedSiteFilter,
} from "../core/siteFilter";

import { getActiveSitesForOrganisation } from "./getActiveSitesForOrganisation";

export type ResolveSiteFilterForOrganisationInput = {
  organisationId: string;
  requestedSiteId?: string | string[] | null;
  createDefaultIfMissing?: boolean;
};

export async function resolveSiteFilterForOrganisation({
  organisationId,
  requestedSiteId,
  createDefaultIfMissing = true,
}: ResolveSiteFilterForOrganisationInput): Promise<ResolvedSiteFilter> {
  const activeSites = await getActiveSitesForOrganisation({
    organisationId,
    createDefaultIfMissing,
  });

  const normalisedSiteId = normaliseSiteFilterValue(requestedSiteId);

  const selectedSite = normalisedSiteId
    ? activeSites.find((site) => site.id === normalisedSiteId) ?? null
    : null;

  const isAllSites = !selectedSite;

  return {
    requestedSiteId: normalisedSiteId,
    selectedSiteId: selectedSite?.id ?? null,
    selectedSite,
    activeSites,
    isAllSites,
    hasMultipleSites: activeSites.length > 1,
    label: getSiteFilterLabel({
      selectedSite,
      isAllSites,
    }),
  };
}