import { database } from "@/db/database";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getProfile(userId: string) {
  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });

  return profile ?? null;
}
