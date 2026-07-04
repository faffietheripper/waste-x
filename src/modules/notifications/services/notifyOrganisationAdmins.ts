import { database } from "@/db/database";
import { users } from "@/db/schema";
import { and, eq, inArray, ne } from "drizzle-orm";
import { createNotification } from "./createNotification";

type NotifyOrganisationAdminsInput = {
  organisationId: string;
  actorId?: string | null;
  listingId?: number | null;
  type?: string;
  title: string;
  message: string;
  includeSeniorManagement?: boolean;
  excludeUserId?: string | null;
};

export async function notifyOrganisationAdmins({
  organisationId,
  actorId = null,
  listingId = null,
  type = "system",
  title,
  message,
  includeSeniorManagement = true,
  excludeUserId = null,
}: NotifyOrganisationAdminsInput) {
  const roles = includeSeniorManagement
    ? ["administrator", "seniorManagement"]
    : ["administrator"];

  const where = excludeUserId
    ? and(
        eq(users.organisationId, organisationId),
        eq(users.isActive, true),
        inArray(users.role, roles as any),
        ne(users.id, excludeUserId),
      )
    : and(
        eq(users.organisationId, organisationId),
        eq(users.isActive, true),
        inArray(users.role, roles as any),
      );

  const admins = await database.query.users.findMany({
    where,
    columns: {
      id: true,
      role: true,
    },
  });

  await Promise.all(
    admins.map((admin) =>
      createNotification({
        organisationId,
        recipientId: admin.id,
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
    count: admins.length,
  };
}