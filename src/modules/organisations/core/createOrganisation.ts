import crypto from "crypto";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import type { OrganisationInput } from "../validators/organisationSchema";

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

  if (!data.capabilities || data.capabilities.length === 0) {
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

    capabilities: data.capabilities,

    // Important:
    // Organisation waits for platform approval.
    status: "PENDING",
  });

  await database
    .update(users)
    .set({
      organisationId,
      role: "administrator",
      status: "ACTIVE",
      isActive: true,
    })
    .where(eq(users.id, userId));

  return {
    success: true,
    organisationId,
  };
}
