import { database } from "@/db/database";
import { users } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { createNotification } from "./createNotification";

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

type NotifyDepartmentUsersInput = {
  organisationId: string;
  departmentTypes: DepartmentType[];
  actorId?: string | null;
  listingId?: number | null;
  type?: string;
  title: string;
  message: string;
  excludeUserId?: string | null;
};

export async function notifyDepartmentUsers({
  organisationId,
  departmentTypes,
  actorId = null,
  listingId = null,
  type = "system",
  title,
  message,
  excludeUserId = null,
}: NotifyDepartmentUsersInput) {
  if (!departmentTypes.length) {
    return {
      success: true,
      count: 0,
    };
  }

  const where = excludeUserId
    ? and(
        eq(users.organisationId, organisationId),
        eq(users.isActive, true),
        ne(users.id, excludeUserId),
      )
    : and(eq(users.organisationId, organisationId), eq(users.isActive, true));

  const members = await database.query.users.findMany({
    where,
    with: {
      department: true,
    },
  });

  const recipients = members.filter((member) => {
    const departmentType = member.department?.type as DepartmentType | undefined;

    if (!departmentType) return false;

    return departmentTypes.includes(departmentType);
  });

  await Promise.all(
    recipients.map((recipient) =>
      createNotification({
        organisationId,
        recipientId: recipient.id,
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
    count: recipients.length,
  };
}