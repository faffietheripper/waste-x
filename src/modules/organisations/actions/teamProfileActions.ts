"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { database } from "@/db/database";
import { organisations } from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { createUploadUrlAction } from "@/modules/shared/actions/createUploadUrlsAction";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

type SaveTeamProfileResult = {
  success: boolean;
  message: string;
};

const VALID_CAPABILITIES: Capability[] = ["generator", "carrier", "manager"];

/* =========================================================
   FETCH PROFILE
========================================================= */

export async function fetchTeamProfileAction() {
  const context = await requireOrgUser();

  const organisationId = context.organisationId;

  if (!organisationId) {
    throw new Error("UNAUTHORIZED");
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });

  if (!organisation) {
    return null;
  }

  return {
    profilePicture: organisation.profilePicture ?? null,
    capabilities: normaliseCapabilities(organisation.capabilities),
    teamName: organisation.teamName ?? "",
    industry: organisation.industry ?? "",
    telephone: organisation.telephone ?? "",
    emailAddress: organisation.emailAddress ?? "",
    streetAddress: organisation.streetAddress ?? "",
    postCode: organisation.postCode ?? "",
    city: organisation.city ?? "",
    region: organisation.region ?? "",
    country: organisation.country ?? "",
  };
}

/* =========================================================
   SAVE PROFILE
========================================================= */

export async function saveTeamProfileAction(
  formData: FormData,
): Promise<SaveTeamProfileResult> {
  const context = await requireOrgUser();

  const organisationId = context.organisationId;

  if (!organisationId) {
    return {
      success: false,
      message: "Session expired. Please log in again.",
    };
  }

  const capabilities = formData
    .getAll("capabilities")
    .map((value) => String(value))
    .filter((value): value is Capability =>
      VALID_CAPABILITIES.includes(value as Capability),
    );

  if (capabilities.length === 0) {
    return {
      success: false,
      message: "Select at least one organisation capability.",
    };
  }

  const teamName = getFormString(formData, "teamName");
  const industry = getFormString(formData, "industry");
  const telephone = getFormString(formData, "telephone");
  const emailAddress = getFormString(formData, "emailAddress");
  const streetAddress = getFormString(formData, "streetAddress");
  const postCode = getFormString(formData, "postCode");
  const city = getFormString(formData, "city");
  const region = getFormString(formData, "region");
  const country = getFormString(formData, "country");
  const profilePicture = getFormString(formData, "profilePicture");

  if (
    !teamName ||
    !industry ||
    !telephone ||
    !emailAddress ||
    !streetAddress ||
    !postCode ||
    !city ||
    !region ||
    !country
  ) {
    return {
      success: false,
      message: "Please complete all required fields.",
    };
  }

  await database
    .update(organisations)
    .set({
      teamName,
      industry,
      telephone,
      emailAddress,
      streetAddress,
      postCode,
      city,
      region,
      country,
      profilePicture: profilePicture || null,
      capabilities,
    })
    .where(eq(organisations.id, organisationId));

  revalidatePath("/home/team-dashboard");
  revalidatePath("/home/my-activity");
  revalidatePath("/home/settings/organisation");

  return {
    success: true,
    message: "Organisation profile saved successfully.",
  };
}

/* =========================================================
   RE-EXPORT UPLOAD ACTION
========================================================= */

export { createUploadUrlAction };

/* =========================================================
   HELPERS
========================================================= */

function getFormString(formData: FormData, key: string) {
  const value = formData.get(key);

  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function normaliseCapabilities(value: unknown): Capability[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is Capability =>
    VALID_CAPABILITIES.includes(item as Capability),
  );
}