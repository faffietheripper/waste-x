import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  users,
  organisations,
  wasteListings,
  carrierAssignments,
  notifications,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function AppHome() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) {
    return (
      <div className="p-96">
        <h1 className="text-2xl font-semibold mb-4">Welcome 👋</h1>
        <p className="mb-6 text-gray-600">
          You need to create your organisation before accessing the dashboard.
        </p>
        <Link
          href="/home/team-dashboard"
          className="bg-blue-600 text-white px-6 py-3 rounded-md"
        >
          Create Organisation
        </Link>
      </div>
    );
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, dbUser.organisationId),
  });

  /* ===============================
     DATA
  ============================== */

  const orgListings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, dbUser.organisationId),
  });

  const orgAssignments = await database.query.carrierAssignments.findMany({
    where: eq(
      carrierAssignments.assignedByOrganisationId,
      dbUser.organisationId,
    ),
  });

  const orgUsers = await database.query.users.findMany({
    where: eq(users.organisationId, dbUser.organisationId),
  });

  const orgNotifications = await database.query.notifications.findMany({
    where: eq(notifications.recipientId, session.user.id),
  });

  /* ===============================
     SNAPSHOT METRICS
  ============================== */

  const activeListings = orgListings.filter((l) => !l.archived);
  const assignedJobs = orgAssignments.filter(
    (a) => a.status === "pending" || a.status === "accepted",
  );
  const collectedJobs = orgAssignments.filter((a) => a.status === "collected");
  const completedJobs = orgAssignments.filter((a) => a.status === "completed");

  /* ===============================
     RECENT DATA
  ============================== */

  const recentAssignments = orgAssignments
    .sort(
      (a, b) =>
        new Date(b.assignedAt ?? 0).getTime() -
        new Date(a.assignedAt ?? 0).getTime(),
    )
    .slice(0, 5);

  const recentNotifications = orgNotifications
    .sort(
      (a, b) =>
        new Date(b.createdAt ?? 0).getTime() -
        new Date(a.createdAt ?? 0).getTime(),
    )
    .slice(0, 5);

  return (
    <div className="p-8 space-y-10 pl-[24vw] pt-32">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-2">Welcome back, {dbUser.name}</h1>
        <p className="text-sm opacity-90">{organisation?.teamName}</p>
        <p className="text-sm opacity-75">
          {organisation?.city}, {organisation?.country}
        </p>
      </div>

      {/* KPI SNAPSHOT */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <DashboardCard title="Active Listings" value={activeListings.length} />
        <DashboardCard title="Assigned Jobs" value={assignedJobs.length} />
        <DashboardCard title="Collected Jobs" value={collectedJobs.length} />
        <DashboardCard
          title="Completed Transfers"
          value={completedJobs.length}
        />
        <DashboardCard title="Team Members" value={orgUsers.length} />
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ASSIGNMENTS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-6">
            Recent Assignment Activity
          </h2>

          {recentAssignments.length === 0 && (
            <p className="text-gray-500 text-sm">No assignment activity yet.</p>
          )}

          <div className="space-y-4">
            {recentAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="flex justify-between items-center border-b pb-3"
              >
                <div>
                  <div className="font-medium text-sm">
                    Job #{assignment.listingId}
                  </div>
                  <div className="text-xs text-gray-500">
                    {assignment.assignedAt?.toLocaleDateString()}
                  </div>
                </div>

                <StatusBadge status={assignment.status} />
              </div>
            ))}
          </div>
        </div>

        {/* NOTIFICATIONS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-6">Live Notifications</h2>

          {recentNotifications.length === 0 && (
            <p className="text-gray-500 text-sm">No notifications yet.</p>
          )}

          <div className="space-y-4">
            {recentNotifications.map((note) => (
              <div
                key={note.id}
                className={`p-3 rounded-md border ${
                  note.isRead ? "bg-gray-50" : "bg-blue-50 border-blue-200"
                }`}
              >
                <p className="text-sm font-medium">{note.title}</p>
                <p className="text-xs text-gray-500">{note.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div className="bg-gray-50 p-4 rounded-xl border text-xs text-gray-500 text-center">
        Waste X Infrastructure · Operational Overview
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

function DashboardCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border text-center">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    accepted: "bg-blue-100 text-blue-700",
    collected: "bg-purple-100 text-purple-700",
    completed: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };

  return (
    <span
      className={`px-3 py-1 text-xs rounded-full ${
        styles[status] ?? "bg-gray-100 text-gray-700"
      }`}
    >
      {status}
    </span>
  );
}
