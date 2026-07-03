// src/modules/digital-waste-tracking/data-access/upsertWasteTrackingOrganisationSettings.ts

import { wasteTrackingOrganisationSettings } from "@/db/schema";
import { database } from "@/db/database";

import type { WasteTrackingEnvironment } from "../types/referenceData.types";

export type UpsertWasteTrackingOrganisationSettingsInput = {
  organisationId: string;
  apiCode: string | null;
  environment: WasteTrackingEnvironment;
  isEnabled: boolean;
};

export async function upsertWasteTrackingOrganisationSettings(
  input: UpsertWasteTrackingOrganisationSettingsInput,
) {
  const now = new Date();

  const [settings] = await database
    .insert(wasteTrackingOrganisationSettings)
    .values({
      organisationId: input.organisationId,
      apiCode: input.apiCode,
      environment: input.environment,
      isEnabled: input.isEnabled,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: wasteTrackingOrganisationSettings.organisationId,
      set: {
        apiCode: input.apiCode,
        environment: input.environment,
        isEnabled: input.isEnabled,
        updatedAt: now,
      },
    })
    .returning();

  return settings;
}