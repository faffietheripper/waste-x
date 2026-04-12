"use server";

import { auth } from "@/auth";

import { getUserNotifications } from "@/modules/notifications/queries/getUserNotifications";
import { getUnreadNotificationsCount } from "@/modules/notifications/queries/getUnreadCount";
import { markNotificationAsRead } from "@/modules/notifications/actions/markAsRead";
import { checkSystemNotifications } from "@/modules/notifications/queries/checkSystemNotifications";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   GET NOTIFICATIONS
============================== */

export const getUserNotificationsAction = withErrorHandling(
  async () => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("UNAUTHORIZED");

    return getUserNotifications(session.user.id);
  },
  {
    actionName: "getUserNotificationsAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ===============================
   MARK AS READ
============================== */

export const markAsReadAction = withErrorHandling(
  async (notificationId: string) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("UNAUTHORIZED");

    return markNotificationAsRead({
      notificationId,
      userId: session.user.id,
    });
  },
  {
    actionName: "markAsReadAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);
