import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserOrganisationId(userId: string) {
  if (!userId) {
    throw new Error("USER_ID_REQUIRED");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      organisationId: true,
    },
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (!user.organisationId) {
    throw new Error("USER_ORGANISATION_REQUIRED");
  }

  return user.organisationId;
}