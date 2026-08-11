import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, users, userProfiles } from "@/db/schema";
import { createDefaultSiteForOrganisation } from "@/modules/sites/data-access/createDefaultSiteForOrganisation";

type Capability = "generator" | "carrier" | "manager";

export async function saveOrganisation({
  userId,
  data,
}: {
  userId: string;
  data: {
    teamName: string;
    industry?: string | null;
    telephone: string;
    emailAddress: string;
    country: string;
    streetAddress: string;
    city: string;
    region: string;
    postCode: string;
    profilePicture?: string | null;
    capabilities: Capability[];
  };
}) {
  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });

  const profileCompleted = Boolean(
    profile?.fullName &&
      profile?.telephone &&
      profile?.emailAddress &&
      profile?.country &&
      profile?.streetAddress &&
      profile?.city &&
      profile?.region &&
      profile?.postCode,
  );

  if (!profileCompleted) {
    throw new Error("PROFILE_INCOMPLETE");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      organisationId: true,
    },
  });

  if (user?.organisationId) {
    await database
      .update(organisations)
      .set(data)
      .where(eq(organisations.id, user.organisationId));

    await createDefaultSiteForOrganisation({
      organisationId: user.organisationId,
    });

    return {
      success: true,
      organisationId: user.organisationId,
    };
  }

  const [newOrg] = await database
    .insert(organisations)
    .values({
      ...data,
      operatingMode: "team",
      status: "PENDING",
      createdAt: new Date(),
    })
    .returning();

  if (!newOrg?.id) {
    throw new Error("ORGANISATION_CREATE_FAILED");
  }

  await database
    .update(users)
    .set({
      organisationId: newOrg.id,
      role: "administrator",
      status: "ACTIVE",
      isActive: true,
    })
    .where(eq(users.id, userId));

  await createDefaultSiteForOrganisation({
    organisationId: newOrg.id,
  });

  return {
    success: true,
    organisationId: newOrg.id,
  };
}