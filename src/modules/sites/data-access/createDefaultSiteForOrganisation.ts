// src/modules/sites/data-access/createDefaultSiteForOrganisation.ts

import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, sites } from "@/db/schema";

import {
  DEFAULT_SITE_NAME,
  buildOrganisationFullAddress,
  normaliseSiteName,
} from "../core/siteTypes";

export type CreateDefaultSiteForOrganisationInput = {
  organisationId: string;
  name?: string | null;
};

export async function createDefaultSiteForOrganisation({
  organisationId,
  name,
}: CreateDefaultSiteForOrganisationInput) {
  const siteName = normaliseSiteName(name);

  return database.transaction(async (tx) => {
    const organisation = await tx.query.organisations.findFirst({
      where: eq(organisations.id, organisationId),
    });

    if (!organisation) {
      return null;
    }

    const existingDefaultSite = await tx.query.sites.findFirst({
      where: and(
        eq(sites.organisationId, organisationId),
        eq(sites.isDefault, true),
      ),
    });

    if (existingDefaultSite) {
      return existingDefaultSite;
    }

    const existingMainSite = await tx.query.sites.findFirst({
      where: and(
        eq(sites.organisationId, organisationId),
        eq(sites.name, siteName),
      ),
    });

    if (existingMainSite) {
      const updated = await tx
        .update(sites)
        .set({
          isDefault: true,
          status: "active",
          updatedAt: new Date(),
        })
        .where(eq(sites.id, existingMainSite.id))
        .returning();

      return updated[0] ?? existingMainSite;
    }

    const created = await tx
      .insert(sites)
      .values({
        organisationId,
        name: siteName || DEFAULT_SITE_NAME,
        siteType: "main_site",
        fullAddress: buildOrganisationFullAddress(organisation),
        postcode: organisation.postCode ?? "",
        permitNumber: null,
        isDefault: true,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning();

    return created[0] ?? null;
  });
}