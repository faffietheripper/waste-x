import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { getUserOrganisationId } from "./getUserOrganisationId";

type CreateNotificationInput = {
  recipientId: string;
  title: string;
  message: string;
  type?: string;
  listingId?: number | null;
  actorId?: string | null;

  /*
    Optional override.

    If you already know the organisationId, pass it in.
    If not, we safely derive it from recipientId.
  */
  organisationId?: string | null;
};

export async function createNotification({
  recipientId,
  title,
  message,
  type = "system",
  listingId = null,
  actorId = null,
  organisationId = null,
}: CreateNotificationInput) {
  if (!recipientId) {
    throw new Error("RECIPIENT_REQUIRED");
  }

  if (!title?.trim()) {
    throw new Error("NOTIFICATION_TITLE_REQUIRED");
  }

  if (!message?.trim()) {
    throw new Error("NOTIFICATION_MESSAGE_REQUIRED");
  }

  const resolvedOrganisationId =
    organisationId ?? (await getUserOrganisationId(recipientId));

  const [notification] = await database
    .insert(notifications)
    .values({
      organisationId: resolvedOrganisationId,
      recipientId,
      actorId,
      listingId,
      type,
      title,
      message,
      isRead: false,
    })
    .returning();

  return notification;
}
