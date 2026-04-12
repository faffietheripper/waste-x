import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getUserByEmail(email: string) {
  return database.query.users.findFirst({
    where: eq(users.email, email),
  });
}
