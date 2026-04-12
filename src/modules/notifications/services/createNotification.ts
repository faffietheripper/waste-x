import { database } from "@/db/database";
import { notifications } from "@/db/schema";
import { getUserOrganisationId } from "./getUserOrganisationId";

export async function createNotification({
  recipientId,
  title,
  message,
  type,
  listingId,
}: {
  recipientId: string;
  title: string;
  message: string;
  type?: string;
  listingId?: number;
}) {
  if (!recipientId) {
    throw new Error("RECIPIENT_REQUIRED");
  }

  const organisationId = await getUserOrganisationId(recipientId);

  await database.insert(notifications).values({
    organisationId,
    recipientId,
    title,
    message,
    type: type ?? "system",
    listingId: listingId ?? null,
    isRead: false,
  });
}
