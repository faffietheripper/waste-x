import { database } from "@/db/database";
import { users, userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function checkSystemNotifications(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });

  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
    columns: { id: true },
  });

  return !user?.role || !profile;
}
