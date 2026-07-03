// src/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings.ts

import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingOrganisationSettings } from "@/db/schema";

export type WasteTrackingOrganisationSettingsRecord =
  typeof wasteTrackingOrganisationSettings.$inferSelect;

export async function getWasteTrackingOrganisationSettings(params: {
  organisationId: string;
}): Promise<WasteTrackingOrganisationSettingsRecord | null> {
  const settings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        params.organisationId,
      ),
    });

  return settings ?? null;
}