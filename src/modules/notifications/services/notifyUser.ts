import { createNotification } from "./createNotification";

type NotifyUserInput = {
  recipientId: string;
  organisationId?: string | null;
  actorId?: string | null;
  listingId?: number | null;
  type?: string;
  title: string;
  message: string;
};

export async function notifyUser(input: NotifyUserInput) {
  return createNotification(input);
}