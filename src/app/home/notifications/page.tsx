import React from "react";
import { auth } from "@/auth";
import { getUserNotifications } from "@/modules/notifications/queries/getUserNotifications";
import { database } from "@/db/database";
import { users, userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import NotificationsClient from "@/components/app/NotificationsClient";

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { role: true },
  });

  const userProfile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
    columns: { id: true },
  });

  const userNotifications = await getUserNotifications(userId);

  const needsRoleSetup = !user?.role;
  const needsProfileSetup = !userProfile;

  const systemNotifications: any[] = [];

  if (needsRoleSetup) {
    systemNotifications.push({
      id: "role-setup",
      title: "Complete Your Profile",
      message: "You haven't selected a role yet.",
      isRead: false,
      createdAt: new Date(),
    });
  }

  if (needsProfileSetup) {
    systemNotifications.push({
      id: "profile-setup",
      title: "Profile Setup Needed",
      message: "You need to set up your profile.",
      isRead: false,
      createdAt: new Date(),
    });
  }

  const allNotifications = [...systemNotifications, ...userNotifications];

  const sortedNotifications = allNotifications.sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    return dateB - dateA;
  });

  return (
    <NotificationsClient notifications={sortedNotifications} userId={userId} />
  );
}
