import crypto from "crypto";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import { createDefaultSiteForOrganisation } from "@/modules/sites/data-access/createDefaultSiteForOrganisation";

import {
  SOLO_DEFAULT_CAPABILITIES,
  normaliseOperatingMode,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

import type { OrganisationInput } from "../validators/organisationSchema";

function getApprovedCapabilities({
  operatingMode,
  capabilities,
}: {
  operatingMode: string;
  capabilities: OrganisationCapability[];
}) {
  /*
    Solo mode must always mean full single-operator workflow.
    Do not trust partial capabilities from the form.
  */
  if (operatingMode === "solo") {
    return SOLO_DEFAULT_CAPABILITIES;
  }

  return Array.from(new Set(capabilities));
}

export async function createOrganisation({
  userId,
  data,
}: {
  userId: string;
  data: OrganisationInput;
}) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  if (user.organisationId) {
    throw new Error("USER_ALREADY_HAS_ORGANISATION");
  }

  const operatingMode = normaliseOperatingMode(data.operatingMode);

  const requestedCapabilities =
    (data.capabilities as OrganisationCapability[] | undefined) ?? [];

  const capabilities = getApprovedCapabilities({
    operatingMode,
    capabilities: requestedCapabilities,
  });

  /*
    Demo/debug safety:
    This must say "solo" when solo was selected.
    If action logs solo but this logs team, something is stripping it before core.
  */
  console.log("CREATE ORG CORE operatingMode:", operatingMode);
  console.log("CREATE ORG CORE capabilities:", capabilities);

  if (!capabilities.length) {
    throw new Error("NO_CAPABILITIES");
  }

  const organisationId = crypto.randomUUID();

  await database.insert(organisations).values({
    id: organisationId,

    teamName: data.teamName,
    industry: data.industry,

    telephone: data.telephone,
    emailAddress: data.emailAddress,

    streetAddress: data.streetAddress,
    city: data.city,
    region: data.region,
    postCode: data.postCode,
    country: data.country,

    profilePicture: data.profilePicture ?? null,

    capabilities,

    /*
      Critical:
      This is what fixes your issue.
      If solo was selected, this stores "solo" and stops the dashboard/nav
      treating the org as Chain/Team mode.
    */
    operatingMode,

    status: "PENDING",
  });

  await database
    .update(users)
    .set({
      organisationId,
      role: "administrator",
      status: "ACTIVE",
      isActive: true,

      /*
        No department on creation.
        Departments are created/assigned during platform approval.
        This prevents old/stale Compliance department state being carried in.
      */
      departmentId: null,
    })
    .where(eq(users.id, userId));

  await createDefaultSiteForOrganisation({
    organisationId,
  });

  return {
    success: true,
    organisationId,
    operatingMode,
    capabilities,
  };
}