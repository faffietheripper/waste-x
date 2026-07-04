import { database } from "@/db/database";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { createNotification } from "./createNotification";

type NotifyOrganisationUsersInput = {
  organisationId: string;
  actorId?: string | null;
  listingId?: number | null;
  type?: string;
  title: string;
  message: string;
  excludeUserId?: string | null;
};

export async function notifyOrganisationUsers({
  organisationId,
  actorId = null,
  listingId = null,
  type = "system",
  title,
  message,
  excludeUserId = null,
}: NotifyOrganisationUsersInput) {
  const where = excludeUserId
    ? and(
        eq(users.organisationId, organisationId),
        eq(users.isActive, true),
        ne(users.id, excludeUserId),
      )
    : and(eq(users.organisationId, organisationId), eq(users.isActive, true));

  const members = await database.query.users.findMany({
    where,
    columns: {
      id: true,
    },
  });

  await Promise.all(
    members.map((member) =>
      createNotification({
        organisationId,
        recipientId: member.id,
        actorId,
        listingId,
        type,
        title,
        message,
      }),
    ),
  );

  return {
    success: true,
    count: members.length,
  };
}