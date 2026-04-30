import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, users } from "@/db/schema";

export async function getOrganisationByUser(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user?.organisationId) {
    return null;
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, user.organisationId),
  });

  return organisation ?? null;
}
