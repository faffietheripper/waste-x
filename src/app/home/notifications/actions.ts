"use server";

import { eq, and } from "drizzle-orm";
import { database } from "@/db/database";
import { notifications, users, userProfiles } from "@/db/schema";
import { auth } from "@/auth";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   HELPER — Get user's organisation
========================================================= */

async function getUserOrganisationId(userId: string) {
  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      organisationId: true,
    },
  });

  if (!user?.organisationId) {
    throw new Error("User organisation not found");
  }

  return user.organisationId;
}

/* =========================================================
   CREATE NOTIFICATION (UTILITY — DO NOT WRAP)
========================================================= */

export async function createNotification(
  recipientId: string,
  title: string,
  message: string,
  type: string,
  listingId?: number,
) {
  if (!recipientId) {
    throw new Error("Recipient ID is required");
  }

  const organisationId = await getUserOrganisationId(recipientId);

  await database.insert(notifications).values({
    organisationId,
    recipientId,
    title,
    message,
    type,
    listingId: listingId ?? null,
    isRead: false,
  });
}

/* =========================================================
   GET USER NOTIFICATIONS
========================================================= */

export const getUserNotifications = withErrorHandling(
  async (userId: string) => {
    const organisationId = await getUserOrganisationId(userId);

    return await database
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.organisationId, organisationId),
        ),
      )
      .orderBy(notifications.createdAt);
  },
  {
    actionName: "getUserNotifications",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   MARK AS READ
========================================================= */

export const markAsRead = withErrorHandling(
  async (notificationId: string) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    const organisationId = await getUserOrganisationId(session.user.id);

    await database
      .update(notifications)
      .set({ isRead: true })
      .where(
        and(
          eq(notifications.id, notificationId),
          eq(notifications.organisationId, organisationId),
        ),
      );
  },
  {
    actionName: "markAsRead",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   GET UNREAD COUNT
========================================================= */

export const getUnreadNotificationsCount = withErrorHandling(
  async (userId: string) => {
    const organisationId = await getUserOrganisationId(userId);

    const unread = await database
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.recipientId, userId),
          eq(notifications.organisationId, organisationId),
          eq(notifications.isRead, false),
        ),
      );

    return unread.length;
  },
  {
    actionName: "getUnreadNotificationsCount",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   SYSTEM PROFILE CHECK
========================================================= */

export const checkForSystemNotifications = withErrorHandling(
  async (userId: string): Promise<boolean> => {
    const user = await database.query.users.findFirst({
      where: eq(users.id, userId),
      columns: { role: true },
    });

    const profile = await database.query.userProfiles.findFirst({
      where: eq(userProfiles.userId, userId),
      columns: { id: true },
    });

    return !user?.role || !profile;
  },
  {
    actionName: "checkForSystemNotifications",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);
