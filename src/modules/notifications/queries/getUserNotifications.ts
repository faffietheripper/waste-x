import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { getUserOrganisationId } from "../services/getUserOrganisationId";

export async function getUserNotifications(userId: string) {
  const organisationId = await getUserOrganisationId(userId);

  return database
    .select()
    .from(notifications)
    .where(
      and(
        eq(notifications.recipientId, userId),
        eq(notifications.organisationId, organisationId),
      ),
    )
    .orderBy(notifications.createdAt);
}
