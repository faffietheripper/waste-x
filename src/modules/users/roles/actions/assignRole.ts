import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

type UserRole =
  | "administrator"
  | "employee"
  | "seniorManagement"
  | "platform_admin";

export async function assignRole({
  userId,
  role,
}: {
  userId: string;
  role: UserRole;
}) {
  await database.update(users).set({ role }).where(eq(users.id, userId));

  return { success: true };
}
