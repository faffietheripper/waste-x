// src/modules/sites/data-access/getDefaultSiteForOrganisation.ts

import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { sites } from "@/db/schema";

import { createDefaultSiteForOrganisation } from "./createDefaultSiteForOrganisation";

export type GetDefaultSiteForOrganisationInput = {
  organisationId: string;
  createIfMissing?: boolean;
};

export async function getDefaultSiteForOrganisation({
  organisationId,
  createIfMissing = true,
}: GetDefaultSiteForOrganisationInput) {
  const defaultSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, organisationId),
      eq(sites.isDefault, true),
      eq(sites.status, "active"),
    ),
  });

  if (defaultSite) {
    return defaultSite;
  }

  const anyActiveSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, organisationId),
      eq(sites.status, "active"),
    ),
  });

  if (anyActiveSite) {
    return anyActiveSite;
  }

  if (!createIfMissing) {
    return null;
  }

  return createDefaultSiteForOrganisation({
    organisationId,
  });
}