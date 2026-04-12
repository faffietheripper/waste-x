import { database } from "@/db/database";
import { organisations, users, userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const profileCompleted = !!(
    profile?.fullName &&
    profile?.telephone &&
    profile?.emailAddress &&
    profile?.country &&
    profile?.streetAddress &&
    profile?.city &&
    profile?.region &&
    profile?.postCode
  );

  if (!profileCompleted) {
    throw new Error("PROFILE_INCOMPLETE");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { organisationId: true },
  });

  if (user?.organisationId) {
    await database
      .update(organisations)
      .set(data)
      .where(eq(organisations.id, user.organisationId));

    return { success: true };
  }

  const [newOrg] = await database
    .insert(organisations)
    .values({
      ...data,
      status: "PENDING",
      createdAt: new Date(),
    })
    .returning();

  await database
    .update(users)
    .set({
      organisationId: newOrg.id,
      role: "administrator",
    })
    .where(eq(users.id, userId));

  return { success: true, organisationId: newOrg.id };
}
