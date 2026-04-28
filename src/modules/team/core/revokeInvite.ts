import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function revokeInvite(userId: string) {
  await database
    .update(users)
    .set({
      inviteToken: null,
      inviteExpiry: null,
      status: "SUSPENDED",
    })
    .where(eq(users.id, userId));

  return { success: true };
}
