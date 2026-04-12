import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { generateInviteToken } from "@/modules/auth/services/generateInviteToken";

export async function inviteUser({
  name,
  email,
  role,
  organisationId,
}: {
  name: string;
  email: string;
  role: "administrator" | "employee" | "seniorManagement";
  organisationId: string;
}) {
  const existingUser = await database.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existingUser?.passwordHash) {
    throw new Error("USER_ALREADY_ACTIVE");
  }

  const { rawToken, hashedToken, expiry } = generateInviteToken();

  let userRecord;

  if (existingUser) {
    const [updated] = await database
      .update(users)
      .set({
        name,
        role,
        organisationId,
        inviteToken: hashedToken,
        inviteExpiry: expiry,
        status: "INVITED",
      })
      .where(eq(users.id, existingUser.id))
      .returning();

    userRecord = updated;
  } else {
    const [created] = await database
      .insert(users)
      .values({
        name,
        email,
        role,
        organisationId,
        passwordHash: null,
        inviteToken: hashedToken,
        inviteExpiry: expiry,
        status: "INVITED",
      })
      .returning();

    userRecord = created;
  }

  return {
    success: true,
    rawToken,
    user: userRecord,
  };
}
