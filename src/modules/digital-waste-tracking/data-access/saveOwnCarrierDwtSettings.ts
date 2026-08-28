/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */

import { database } from "@/db/database";
import { wasteTrackingOrganisationSettings } from "@/db/schema";

import {
  isMeansOfTransport,
  isReasonForNoRegistrationNumber,
  type MeansOfTransport,
  type ReasonForNoRegistrationNumber,
} from "../types/receiveMovement.types";

export type OwnCarrierDwtSettingsInput = {
  registrationNumber?: string | null;
  reasonForNoRegistrationNumber?: string | null;
  meansOfTransport?: string | null;
};

export type NormalisedOwnCarrierDwtSettings = {
  registrationNumber: string | null;
  reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | null;
  meansOfTransport: MeansOfTransport;
};

export type SaveOwnCarrierDwtSettingsResult =
  | {
      ok: true;
      settings: NormalisedOwnCarrierDwtSettings;
    }
  | {
      ok: false;
      code: "invalid_reason" | "invalid_means";
      error: string;
    };

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function canManageOwnCarrierDwtSettings(
  role: string | null | undefined,
) {
  return (
    role === "administrator" ||
    role === "seniorManagement" ||
    role === "platform_admin"
  );
}

export function normaliseOwnCarrierDwtSettings(
  input: OwnCarrierDwtSettingsInput,
): SaveOwnCarrierDwtSettingsResult {
  const rawRegistration = clean(input.registrationNumber);
  const registrationNumber = rawRegistration
    ? rawRegistration.toUpperCase()
    : null;

  const rawReason = clean(input.reasonForNoRegistrationNumber);
  const rawMeans = clean(input.meansOfTransport) || "Road";

  if (rawReason && !isReasonForNoRegistrationNumber(rawReason)) {
    return {
      ok: false,
      code: "invalid_reason",
      error: "Choose a valid reason for having no carrier registration number.",
    };
  }

  if (!isMeansOfTransport(rawMeans)) {
    return {
      ok: false,
      code: "invalid_means",
      error: "Choose a valid means of transport.",
    };
  }

  return {
    ok: true,
    settings: {
      registrationNumber,
      reasonForNoRegistrationNumber:
        !registrationNumber && rawReason
          ? (rawReason as ReasonForNoRegistrationNumber)
          : null,
      meansOfTransport: rawMeans,
    },
  };
}

export async function saveOwnCarrierDwtSettings(params: {
  organisationId: string;
  input: OwnCarrierDwtSettingsInput;
}): Promise<SaveOwnCarrierDwtSettingsResult> {
  const normalised = normaliseOwnCarrierDwtSettings(params.input);

  if (!normalised.ok) return normalised;

  await database
    .insert(wasteTrackingOrganisationSettings)
    .values({
      organisationId: params.organisationId,
      ownCarrierRegistrationNumber: normalised.settings.registrationNumber,
      ownCarrierReasonForNoRegistrationNumber:
        normalised.settings.reasonForNoRegistrationNumber,
      ownCarrierMeansOfTransport: normalised.settings.meansOfTransport,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: wasteTrackingOrganisationSettings.organisationId,
      set: {
        ownCarrierRegistrationNumber: normalised.settings.registrationNumber,
        ownCarrierReasonForNoRegistrationNumber:
          normalised.settings.reasonForNoRegistrationNumber,
        ownCarrierMeansOfTransport: normalised.settings.meansOfTransport,
        updatedAt: new Date(),
      },
    });

  return normalised;
}
