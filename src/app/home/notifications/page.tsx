import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, userProfiles } from "@/db/schema";
import { eq } from "drizzle-orm";

import { getUserNotifications } from "@/modules/notifications/queries/getUserNotifications";
import NotificationsClient from "@/components/app/NotificationsClient";

/* =========================================================
   TYPES
========================================================= */

type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  isRead: boolean;
  createdAt: Date | string | null;
  listingId?: number | null;
  actorId?: string | null;
  organisationId?: string | null;
  system?: boolean;
  priority?: "low" | "medium" | "high";
};

/* =========================================================
   PAGE
========================================================= */

export default async function NotificationsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;

  /* =========================================================
     USER SETUP STATE
  ========================================================= */

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

  const userProfile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
    columns: {
      id: true,
      fullName: true,
    },
  });

  /* =========================================================
     USER NOTIFICATIONS
  ========================================================= */

  const userNotifications = await getUserNotifications(userId);

  /* =========================================================
     SYSTEM NOTIFICATIONS

     These are generated from user/account state rather than stored
     notification rows.
  ========================================================= */

  const needsRoleSetup = !user?.role;
  const needsProfileSetup = !userProfile;
  const needsOrganisation = !user?.organisationId;
  const needsDepartment = Boolean(user?.organisationId) && !user?.departmentId;

  const systemNotifications: NotificationRecord[] = [];

  if (needsProfileSetup) {
    systemNotifications.push({
      id: "profile-setup",
      title: "Profile setup required",
      message:
        "Complete your user profile so Waste X can attach actions, audit events and operational records to a named user.",
      type: "system_profile_setup",
      isRead: false,
      createdAt: new Date(),
      system: true,
      priority: "high",
    });
  }

  if (needsRoleSetup) {
    systemNotifications.push({
      id: "role-setup",
      title: "Role setup required",
      message:
        "Your account does not have a role assigned yet. Complete setup before using operational workflows.",
      type: "system_role_setup",
      isRead: false,
      createdAt: new Date(),
      system: true,
      priority: "high",
    });
  }

  if (needsOrganisation) {
    systemNotifications.push({
      id: "organisation-setup",
      title: "Organisation required",
      message:
        "Create or join an organisation to access listings, assignments, departments, incidents and compliance records.",
      type: "system_organisation_setup",
      isRead: false,
      createdAt: new Date(),
      system: true,
      priority: "high",
    });
  }

  if (needsDepartment) {
    systemNotifications.push({
      id: "department-setup",
      title: "Department selection required",
      message:
        "Select or configure your active department so Waste X can show the correct generator, manager, carrier or compliance workflow.",
      type: "system_department_setup",
      isRead: false,
      createdAt: new Date(),
      system: true,
      priority: "medium",
    });
  }

  /* =========================================================
     MERGE + SORT
  ========================================================= */

  const allNotifications: NotificationRecord[] = [
    ...systemNotifications,
    ...(userNotifications as NotificationRecord[]),
  ];

  const sortedNotifications = allNotifications.sort((a, b) => {
    if (a.isRead !== b.isRead) {
      return a.isRead ? 1 : -1;
    }

    const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

    return dateB - dateA;
  });

  const unreadCount = sortedNotifications.filter((n) => !n.isRead).length;

  const systemCount = sortedNotifications.filter((n) => n.system).length;

  const workflowCount = sortedNotifications.filter(
    (n) => !n.system && n.type,
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Notifications
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Notification Centre
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Track workflow alerts, account setup tasks, assignment updates,
                verification events, incident activity and compliance messages
                for your Waste X account.
              </p>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-right lg:block">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Unread
              </p>
              <p className="mt-2 text-3xl font-semibold text-orange-400">
                {unreadCount}
              </p>
              <p className="mt-1 text-xs text-white/45">
                Notifications needing attention
              </p>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard label="Total" value={sortedNotifications.length} />
          <MetricCard
            label="Unread"
            value={unreadCount}
            danger={unreadCount > 0}
          />
          <MetricCard label="System" value={systemCount} />
          <MetricCard label="Workflow" value={workflowCount} />
        </section>

        {/* CLIENT */}
        <NotificationsClient
          notifications={sortedNotifications}
          userId={userId}
        />
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        danger ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-widest ${
          danger ? "text-orange-700" : "text-black/40"
        }`}
      >
        {label}
      </p>

      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-orange-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
