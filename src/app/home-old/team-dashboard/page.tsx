import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  users,
  organisations,
  wasteListings,
  carrierAssignments,
  bids,
  notifications,
} from "@/db/schema";
import { eq } from "drizzle-orm";

type Capability = "generator" | "carrier" | "manager";

export default async function TeamDashboard() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user?.organisationId) {
    throw new Error("No organisation");
  }

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, user.organisationId),
  });

  if (!organisation) throw new Error("Organisation not found");

  /* ===============================
     CAPABILITIES
  ============================== */

  const capabilities = (organisation.capabilities as Capability[] | null) ?? [];

  /* ===============================
     DATA
  ============================== */

  const orgListings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, organisation.id),
  });

  const orgAssignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.organisationId, organisation.id),
  });

  const orgBids = await database.query.bids.findMany({
    where: eq(bids.organisationId, organisation.id),
  });

  const orgUsers = await database.query.users.findMany({
    where: eq(users.organisationId, organisation.id),
  });

  const orgNotifications = await database.query.notifications.findMany({
    where: eq(notifications.organisationId, organisation.id),
  });

  /* ===============================
     METRICS
  ============================== */

  const activeListings = orgListings.filter((l) => !l.archived);

  const assignedJobs = orgAssignments.filter(
    (a) => a.status === "pending" || a.status === "accepted",
  );

  const collectedJobs = orgAssignments.filter((a) => a.status === "collected");

  const completedJobs = orgAssignments.filter((a) => a.status === "completed");

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

  /* ===============================
     KPI SYSTEM
  ============================== */

  let kpis: { title: string; value: number }[] = [];

  // GENERATOR
  if (capabilities.includes("generator")) {
    kpis.push(
      { title: "Active Listings", value: activeListings.length },
      { title: "Total Listings", value: orgListings.length },
      { title: "Bids Received", value: orgBids.length },
    );
  }

  // MANAGER
  if (capabilities.includes("manager")) {
    kpis.push(
      { title: "Active Jobs", value: assignedJobs.length },
      { title: "Collected Loads", value: collectedJobs.length },
      { title: "Completed Jobs", value: completedJobs.length },
    );
  }

  // CARRIER
  if (capabilities.includes("carrier")) {
    kpis.push(
      { title: "Assigned Jobs", value: assignedJobs.length },
      { title: "Total Assignments", value: orgAssignments.length },
    );
  }

  // ALWAYS
  kpis.push({
    title: "Team Members",
    value: orgUsers.length,
  });

  /* ===============================
     UI
  ============================== */

  return (
    <div className="pt-6 space-y-10">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-2">{organisation.teamName}</h1>

        <p className="text-sm opacity-80 capitalize">
          {capabilities.join(" · ")}
        </p>

        <p className="text-sm opacity-70">
          {organisation.city}, {organisation.country}
        </p>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        {kpis.map((kpi, i) => (
          <DashboardCard key={i} title={kpi.title} value={kpi.value} />
        ))}
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ACTIVITY */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-6">
            {capabilities.includes("generator")
              ? "Recent Listings"
              : "Recent Assignment Activity"}
          </h2>

          <div className="space-y-4">
            {(capabilities.includes("generator")
              ? activeListings.slice(0, 5)
              : recentAssignments
            ).map((item: any) => (
              <div
                key={item.id}
                className="flex justify-between items-center border-b pb-3"
              >
                <div>
                  <div className="font-medium text-sm">
                    {capabilities.includes("generator")
                      ? item.name
                      : `Job #${item.listingId}`}
                  </div>

                  <div className="text-xs text-gray-500">
                    {item.createdAt?.toLocaleDateString?.() ||
                      item.assignedAt?.toLocaleDateString?.()}
                  </div>
                </div>

                {item.status && <StatusBadge status={item.status} />}
              </div>
            ))}
          </div>
        </div>

        {/* NOTIFICATIONS */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border">
          <h2 className="text-lg font-semibold mb-6">Live Notifications</h2>

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
        Waste X · Organisation Operations Dashboard
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
