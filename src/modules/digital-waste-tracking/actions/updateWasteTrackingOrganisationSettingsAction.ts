// src/modules/digital-waste-tracking/actions/updateWasteTrackingOrganisationSettingsAction.ts

"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

import { upsertWasteTrackingOrganisationSettings } from "../data-access/upsertWasteTrackingOrganisationSettings";

import type { WasteTrackingEnvironment } from "../types/referenceData.types";

/* =========================================================
   TYPES
========================================================= */

export type UpdateWasteTrackingOrganisationSettingsInput = {
  apiCode: string;
  environment: WasteTrackingEnvironment;
  isEnabled: boolean;
};

export type UpdateWasteTrackingOrganisationSettingsIssue = {
  field: string;
  message: string;
};

export type UpdateWasteTrackingOrganisationSettingsResult =
  | {
      success: true;
      message: string;
      settings: {
        id: string;
        organisationId: string;
        apiCode: string | null;
        environment: WasteTrackingEnvironment;
        isEnabled: boolean;
      };
    }
  | {
      success: false;
      message: string;
      issues?: UpdateWasteTrackingOrganisationSettingsIssue[];
    };

/* =========================================================
   HELPERS
========================================================= */

function cleanString(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function isWasteTrackingEnvironment(
  value: string,
): value is WasteTrackingEnvironment {
  return value === "test" || value === "production";
}

function isUuidLike(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function canManageDwtSettings(role: string | null | undefined) {
  return (
    role === "administrator" ||
    role === "seniorManagement" ||
    role === "platform_admin"
  );
}

function validateInput(
  input: UpdateWasteTrackingOrganisationSettingsInput,
): UpdateWasteTrackingOrganisationSettingsIssue[] {
  const issues: UpdateWasteTrackingOrganisationSettingsIssue[] = [];

  const apiCode = cleanString(input.apiCode);

  if (!isWasteTrackingEnvironment(input.environment)) {
    issues.push({
      field: "environment",
      message: "Choose either the test or production environment.",
    });
  }

  if (input.isEnabled && !apiCode) {
    issues.push({
      field: "apiCode",
      message:
        "Receiver API Code is required before Digital Waste Tracking can be enabled.",
    });
  }

  if (apiCode && !isUuidLike(apiCode)) {
    issues.push({
      field: "apiCode",
      message:
        "Receiver API Code should be a UUID. Check the code provided by Defra and try again.",
    });
  }

  if (input.environment === "production" && !apiCode) {
    issues.push({
      field: "environment",
      message:
        "Production should only be selected when the organisation has a real production Receiver API Code.",
    });
  }

  return issues;
}

/* =========================================================
   ACTION
========================================================= */

export async function updateWasteTrackingOrganisationSettingsAction(
  input: UpdateWasteTrackingOrganisationSettingsInput,
): Promise<UpdateWasteTrackingOrganisationSettingsResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      message: "You must be signed in before changing DWT settings.",
    };
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    return {
      success: false,
      message:
        "Your account is not linked to an organisation. Create or join an organisation first.",
    };
  }

  if (!canManageDwtSettings(currentUser.role)) {
    return {
      success: false,
      message:
        "Only organisation administrators or senior management can change Digital Waste Tracking settings.",
      issues: [
        {
          field: "permission",
          message:
            "Your role can view these settings, but it cannot update the organisation Receiver API Code.",
        },
      ],
    };
  }

  const issues = validateInput(input);

  if (issues.length > 0) {
    return {
      success: false,
      message:
        "Waste X could not save the Digital Waste Tracking settings. Fix the highlighted issues and try again.",
      issues,
    };
  }

  const apiCode = cleanString(input.apiCode);

  const settings = await upsertWasteTrackingOrganisationSettings({
    organisationId: currentUser.organisationId,
    apiCode,
    environment: input.environment,
    isEnabled: input.isEnabled,
  });

  revalidatePath("/home/settings/digital-waste-tracking");
  revalidatePath("/home/receiving/intake");
  revalidatePath("/home/receiving/submissions");
  revalidatePath("/home/compliance/digital-waste-tracking");

  return {
    success: true,
    message: input.isEnabled
      ? "Digital Waste Tracking settings saved. Waste X can now use this Receiver API Code for receive movement submissions."
      : "Digital Waste Tracking settings saved, but submissions are currently disabled for this organisation.",
    settings: {
      id: settings.id,
      organisationId: settings.organisationId,
      apiCode: settings.apiCode,
      environment: settings.environment,
      isEnabled: settings.isEnabled,
    },
  };
}