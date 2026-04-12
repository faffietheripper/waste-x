import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserOrganisationId(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { organisationId: true },
  });

  if (!user?.organisationId) {
    throw new Error("USER_ORG_NOT_FOUND");
  }

  return user.organisationId;
}
