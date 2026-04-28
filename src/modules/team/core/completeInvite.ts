import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { users } from "@/db/schema";

export async function completeInvite(input: {
  token: string;
  password: string;
}) {
  if (!input.token) {
    return {
      success: false,
      message: "Invalid or missing invite token.",
    };
  }

  if (!input.password || input.password.length < 8) {
    return {
      success: false,
      message: "Password must be at least 8 characters.",
    };
  }

  const invitedUser = await database.query.users.findFirst({
    where: eq(users.inviteToken, input.token),
  });

  if (!invitedUser) {
    return {
      success: false,
      message: "Invalid invite link.",
    };
  }

  if (invitedUser.status !== "INVITED") {
    return {
      success: false,
      message: "This invite has already been used.",
    };
  }

  if (
    invitedUser.inviteExpiresAt &&
    new Date(invitedUser.inviteExpiresAt) < new Date()
  ) {
    return {
      success: false,
      message: "Invite link has expired.",
    };
  }

  const hashedPassword = await bcrypt.hash(input.password, 12);

  await database
    .update(users)
    .set({
      passwordHash: hashedPassword,
      status: "ACTIVE",
      inviteToken: null,
      inviteExpiresAt: null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, invitedUser.id));

  return {
    success: true,
  };
}
