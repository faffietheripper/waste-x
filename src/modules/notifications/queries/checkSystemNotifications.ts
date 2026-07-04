import { database } from "@/db/database";
import { userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";

type SystemNotification = {
  id: string;
  organisationId: string | null;
  recipientId: string;
  actorId: string | null;
  listingId: number | null;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: Date;
  isSystemGenerated: true;
  system: true;
  priority: "low" | "medium" | "high";
};

export async function checkSystemNotifications(
  userId: string,
): Promise<SystemNotification[]> {
  const systemNotifications: SystemNotification[] = [];

  if (!userId) return systemNotifications;

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      role: true,
      organisationId: true,
      departmentId: true,
      status: true,
    },
  });

  if (!user) return systemNotifications;

  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
    columns: {
      id: true,
    },
  });

  if (!profile) {
    systemNotifications.push({
      id: "system-profile-setup",
      organisationId: user.organisationId,
      recipientId: userId,
      actorId: null,
      listingId: null,
      type: "system_profile_setup",
      title: "Profile setup required",
      message:
        "Complete your user profile so Waste X can attach actions, audit events and operational records to a named user.",
      isRead: false,
      createdAt: new Date(),
      isSystemGenerated: true,
      system: true,
      priority: "high",
    });
  }

  if (!user.role) {
    systemNotifications.push({
      id: "system-role-setup",
      organisationId: user.organisationId,
      recipientId: userId,
      actorId: null,
      listingId: null,
      type: "system_role_setup",
      title: "Role setup required",
      message:
        "Your account does not have a role assigned yet. Complete setup before using operational workflows.",
      isRead: false,
      createdAt: new Date(),
      isSystemGenerated: true,
      system: true,
      priority: "high",
    });
  }

  if (!user.organisationId) {
    systemNotifications.push({
      id: "system-organisation-setup",
      organisationId: null,
      recipientId: userId,
      actorId: null,
      listingId: null,
      type: "system_organisation_setup",
      title: "Organisation required",
      message:
        "Create or join an organisation to access listings, assignments, departments, incidents and compliance records.",
      isRead: false,
      createdAt: new Date(),
      isSystemGenerated: true,
      system: true,
      priority: "high",
    });
  }

  if (user.organisationId && !user.departmentId) {
    systemNotifications.push({
      id: "system-department-setup",
      organisationId: user.organisationId,
      recipientId: userId,
      actorId: null,
      listingId: null,
      type: "system_department_setup",
      title: "Department selection required",
      message:
        "Select or configure your active department so Waste X can show the correct generator, manager, carrier or compliance workflow.",
      isRead: false,
      createdAt: new Date(),
      isSystemGenerated: true,
      system: true,
      priority: "medium",
    });
  }

  return systemNotifications;
}