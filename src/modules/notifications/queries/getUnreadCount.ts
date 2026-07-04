import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserOrganisationId } from "../services/getUserOrganisationId";

export async function getUnreadNotificationsCount(userId: string) {
  if (!userId) return 0;

  const organisationId = await getUserOrganisationId(userId);

  const unread = await database
    .select({
      id: notifications.id,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.organisationId, organisationId),
        eq(notifications.isRead, false),
      ),
    );

  return unread.length;
}