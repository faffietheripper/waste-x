"use server";

import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { getUserOrganisationId } from "../services/getUserOrganisationId";

export async function markAllNotificationsAsRead(userId: string) {
  if (!userId) {
    throw new Error("USER_ID_REQUIRED");
  }

  const organisationId = await getUserOrganisationId(userId);

  await database
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.organisationId, organisationId),
      ),
    );

  revalidatePath("/home/notifications");

  return { success: true };
}