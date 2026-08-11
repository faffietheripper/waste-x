// src/modules/sites/data-access/getSiteForOrganisation.ts

import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { sites } from "@/db/schema";

import { getDefaultSiteForOrganisation } from "./getDefaultSiteForOrganisation";

export type GetSiteForOrganisationInput = {
  organisationId: string;
  siteId?: string | null;
  fallbackToDefault?: boolean;
};

export async function getSiteForOrganisation({
  organisationId,
  siteId,
  fallbackToDefault = true,
}: GetSiteForOrganisationInput) {
  if (siteId) {
    const selectedSite = await database.query.sites.findFirst({
      where: and(
        eq(sites.id, siteId),
        eq(sites.organisationId, organisationId),
        eq(sites.status, "active"),
      ),
    });

    if (selectedSite) {
      return selectedSite;
    }
  }

  if (!fallbackToDefault) {
    return null;
  }

  return getDefaultSiteForOrganisation({
    organisationId,
    createIfMissing: true,
  });
}