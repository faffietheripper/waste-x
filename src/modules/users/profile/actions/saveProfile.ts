import { database } from "@/db/database";
import { userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function saveProfile({
  userId,
  data,
}: {
  userId: string;
  data: {
    profilePicture?: string;
    fullName: string;
    telephone?: string;
    emailAddress?: string;
    country?: string;
    streetAddress?: string;
    city?: string;
    region?: string;
    postCode?: string;
  };
}) {
  const existingProfile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });

  if (existingProfile) {
    await database
      .update(userProfiles)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(userProfiles.userId, userId));
  } else {
    await database.insert(userProfiles).values({
      userId,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return { success: true };
}
