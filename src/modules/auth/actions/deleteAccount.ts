import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function deleteAccount(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  await database.delete(users).where(eq(users.id, userId));

  return { success: true };
}
