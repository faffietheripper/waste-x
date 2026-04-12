import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcryptjs from "bcryptjs";

export async function updatePassword({
  userId,
  currentPassword,
  newPassword,
}: {
  userId: string;
  currentPassword?: string;
  newPassword: string;
}) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  if (currentPassword) {
    const isMatch = await bcryptjs.compare(
      currentPassword,
      user.passwordHash ?? "",
    );

    if (!isMatch) {
      throw new Error("INVALID_CURRENT_PASSWORD");
    }
  }

  const hashedPassword = await bcryptjs.hash(newPassword, 10);

  await database
    .update(users)
    .set({
      passwordHash: hashedPassword,
    })
    .where(eq(users.id, userId));

  return { success: true };
}
