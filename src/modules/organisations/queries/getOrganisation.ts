import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getOrganisationByUser(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { organisationId: true },
  });

  if (!user?.organisationId) return null;

  return database.query.organisations.findFirst({
    where: eq(organisations.id, user.organisationId),
  });
}
