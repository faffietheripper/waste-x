import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { carrierAssignments, users, notifications } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import Link from "next/link";

export default async function Analytics() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser?.organisationId) throw new Error("No organisation");

  const organisationId = dbUser.organisationId;

  // ==============================
  // 📊 COUNT METRICS
  // ==============================

  const allAssignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.assignedByOrganisationId, organisationId),
  });

  const pending = allAssignments.filter((a) => a.status === "pending").length;

  const accepted = allAssignments.filter((a) => a.status === "accepted").length;

  const collected = allAssignments.filter((a) => a.collectedAt !== null).length;

  const completed = allAssignments.filter(
    (a) => a.status === "completed",
  ).length;

  // ✅ FIXED recipientId
  const unreadNotifications = await database.query.notifications.findMany({
    where: and(
      eq(notifications.recipientId, session.user.id),
      eq(notifications.isRead, false),
    ),
  });

  // ==============================
  // 📋 RECENT ACTIVITY
  // ==============================

  const recentAssignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.assignedByOrganisationId, organisationId),
    with: {
      listing: true, // ✅ FIXED (was item)
      carrierOrganisation: true,
    },
    orderBy: desc(carrierAssignments.assignedAt),
    limit: 5,
  });

  return (
    <div className="p-8 space-y-10">
      {/* ================= HEADER ================= */}
      <div>
        <h1 className="text-3xl font-bold">Carrier Hub Overview</h1>
        <p className="text-gray-500">
          Summary of your waste carrier operations
        </p>
      </div>

      {/* ================= KPI GRID ================= */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <StatCard title="Total Assigned" value={allAssignments.length} />
        <StatCard title="Pending Response" value={pending} />
        <StatCard title="Accepted" value={accepted} />
        <StatCard title="Collected" value={collected} />
        <StatCard title="Completed" value={completed} />
      </div>

      {/* ================= SECOND GRID ================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* ===== RECENT ASSIGNMENTS ===== */}
        <div className="bg-white shadow-sm rounded-2xl p-6 border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">Recent Carrier Activity</h2>
            <Link href="#" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>

          {recentAssignments.length === 0 && (
            <p className="text-gray-500 text-sm">No recent carrier activity.</p>
          )}

          <div className="space-y-4">
            {recentAssignments.map((assignment) => (
              <div
                key={assignment.id}
                className="p-4 rounded-xl border hover:shadow-sm transition"
              >
                {/* ✅ FIXED listing instead of item */}
                <div className="font-medium">{assignment.listing?.name}</div>

                <div className="text-sm text-gray-600">
                  Carrier: {assignment.carrierOrganisation?.teamName}
                </div>

                <div className="text-xs mt-1">
                  Status:{" "}
                  <span className="capitalize font-medium">
                    {assignment.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ===== NOTIFICATIONS ===== */}
        <div className="bg-white shadow-sm rounded-2xl p-6 border">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-semibold text-lg">Notifications</h2>
            <Link href="#" className="text-sm text-blue-600 hover:underline">
              View All
            </Link>
          </div>

          <div className="text-4xl font-bold">{unreadNotifications.length}</div>
          <p className="text-sm text-gray-500 mt-2">Unread notifications</p>
        </div>
      </div>
    </div>
  );
}

/* ================= REUSABLE STAT CARD ================= */

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border hover:shadow-md transition">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </div>
  );
}
