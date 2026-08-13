// src/modules/sites/data-access/getActiveSitesForOrganisation.ts

import { and, asc, desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { sites } from "@/db/schema";

import { createDefaultSiteForOrganisation } from "./createDefaultSiteForOrganisation";

export type ActiveSiteForOrganisation = {
  id: string;
  name: string;
  siteType: string;
  isDefault: boolean;
};

export type GetActiveSitesForOrganisationInput = {
  organisationId: string;
  createDefaultIfMissing?: boolean;
};

async function fetchActiveSites(organisationId: string) {
  return database
    .select({
      id: sites.id,
      name: sites.name,
      siteType: sites.siteType,
      isDefault: sites.isDefault,
    })
    .from(sites)
    .where(
      and(
        eq(sites.organisationId, organisationId),
        eq(sites.status, "active"),
      ),
    )
    .orderBy(desc(sites.isDefault), asc(sites.name));
}

export async function getActiveSitesForOrganisation({
  organisationId,
  createDefaultIfMissing = true,
}: GetActiveSitesForOrganisationInput): Promise<ActiveSiteForOrganisation[]> {
  const activeSites = await fetchActiveSites(organisationId);

  if (activeSites.length > 0 || !createDefaultIfMissing) {
    return activeSites;
  }

  await createDefaultSiteForOrganisation({
    organisationId,
  });

  return fetchActiveSites(organisationId);
}