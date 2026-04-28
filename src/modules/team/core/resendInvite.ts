import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInviteToken } from "@/modules/auth/services/generateInviteToken";

export async function resendInvite(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) throw new Error("USER_NOT_FOUND");
  if (user.status === "ACTIVE") throw new Error("USER_ALREADY_ACTIVE");

  const { rawToken, hashedToken, expiry } = generateInviteToken();

  await database
    .update(users)
    .set({
      inviteToken: hashedToken,
      inviteExpiry: expiry,
    })
    .where(eq(users.id, userId));

  return {
    success: true,
    rawToken,
    user,
  };
}
