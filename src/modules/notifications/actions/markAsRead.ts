import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserOrganisationId } from "../services/getUserOrganisationId";

export async function markNotificationAsRead({
  notificationId,
  userId,
}: {
  notificationId: string;
  userId: string;
}) {
  const organisationId = await getUserOrganisationId(userId);

  await database
    .update(notifications)
    .set({ isRead: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.organisationId, organisationId),
      ),
    );

  return { success: true };
}
