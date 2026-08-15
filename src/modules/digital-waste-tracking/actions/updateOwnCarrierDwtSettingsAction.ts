"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, wasteTrackingOrganisationSettings } from "@/db/schema";
import {
  isMeansOfTransport,
  isReasonForNoRegistrationNumber,
  type MeansOfTransport,
  type ReasonForNoRegistrationNumber,
} from "../types/receiveMovement.types";

export type UpdateOwnCarrierDwtSettingsInput = {
  registrationNumber: string;
  reasonForNoRegistrationNumber: string;
  meansOfTransport: string;
};

export type UpdateOwnCarrierDwtSettingsResult =
  | {
      success: true;
      message: string;
      settings: {
        registrationNumber: string | null;
        reasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | null;
        meansOfTransport: MeansOfTransport;
      };
    }
  | {
      success: false;
      message: string;
    };

function clean(value: string | null | undefined) {
  if (typeof value !== "string") return "";
  return value.trim();
}

function canManage(role: string | null | undefined) {
  return (
    role === "administrator" ||
    role === "seniorManagement" ||
    role === "platform_admin"
  );
}

export async function updateOwnCarrierDwtSettingsAction(
  input: UpdateOwnCarrierDwtSettingsInput,
): Promise<UpdateOwnCarrierDwtSettingsResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { success: false, message: "You must be signed in." };
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { id: true, organisationId: true, role: true },
  });

  if (!user?.organisationId) {
    return {
      success: false,
      message: "Your account is not linked to an organisation.",
    };
  }

  if (!canManage(user.role)) {
    return {
      success: false,
      message:
        "Only organisation administrators or senior management can change own-transport DWT defaults.",
    };
  }

  const registrationNumber = clean(input.registrationNumber) || null;
  const rawReason = clean(input.reasonForNoRegistrationNumber);
  const rawMeans = clean(input.meansOfTransport);

  if (rawReason && !isReasonForNoRegistrationNumber(rawReason)) {
    return { success: false, message: "Choose a valid carrier-registration reason." };
  }

  if (!isMeansOfTransport(rawMeans)) {
    return { success: false, message: "Choose a valid means of transport." };
  }

  const reasonForNoRegistrationNumber =
    !registrationNumber && rawReason
      ? (rawReason as ReasonForNoRegistrationNumber)
      : null;

  await database
    .insert(wasteTrackingOrganisationSettings)
    .values({
      organisationId: user.organisationId,
      ownCarrierRegistrationNumber: registrationNumber,
      ownCarrierReasonForNoRegistrationNumber: reasonForNoRegistrationNumber,
      ownCarrierMeansOfTransport: rawMeans,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: wasteTrackingOrganisationSettings.organisationId,
      set: {
        ownCarrierRegistrationNumber: registrationNumber,
        ownCarrierReasonForNoRegistrationNumber: reasonForNoRegistrationNumber,
        ownCarrierMeansOfTransport: rawMeans,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/settings/digital-waste-tracking");
  revalidatePath("/home/dwt");

  return {
    success: true,
    message:
      registrationNumber || reasonForNoRegistrationNumber
        ? "Own-transport DWT defaults saved."
        : "Own-transport defaults saved. Carrier registration details are still incomplete.",
    settings: {
      registrationNumber,
      reasonForNoRegistrationNumber,
      meansOfTransport: rawMeans,
    },
  };
}
