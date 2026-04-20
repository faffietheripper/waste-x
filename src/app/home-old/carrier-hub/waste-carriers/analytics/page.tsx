import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  organisations,
  carrierAssignments,
  wasteListings,
  incidents,
  reviews,
} from "@/db/schema";
import { eq, and, count } from "drizzle-orm";

export default async function CarrierAnalyticsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  /* ===============================
     Get Organisation
  ================================= */
  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, session.user.organisationId),
  });

  if (!organisation || organisation.chainOfCustody !== "wasteCarrier") {
    return (
      <div className="p-12">
        <h1 className="text-xl font-bold text-red-600">
          Access restricted to licensed waste carriers.
        </h1>
      </div>
    );
  }

  /* ===============================
     Carrier Assignments
  ================================= */
  const assignments = await database.query.carrierAssignments.findMany({
    where: eq(carrierAssignments.carrierOrganisationId, organisation.id),
    with: {
      listing: true,
    },
  });

  const totalJobs = assignments.length;
  const pendingJobs = assignments.filter((a) => a.status === "pending").length;
  const acceptedJobs = assignments.filter(
    (a) => a.status === "accepted",
  ).length;
  const completedJobs = assignments.filter(
    (a) => a.status === "completed",
  ).length;
  const rejectedJobs = assignments.filter(
    (a) => a.status === "rejected",
  ).length;

  const totalRevenue = assignments
    .filter((a) => a.status === "completed")
    .reduce((sum, a) => sum + (a.listing?.currentBid ?? 0), 0);

  /* ===============================
     Incidents
  ================================= */
  const carrierIncidents = await database.query.incidents.findMany({
    where: eq(incidents.reportedByOrganisationId, organisation.id),
  });

  const openIncidents = carrierIncidents.filter(
    (i) => i.status === "open" || i.status === "under_review",
  ).length;

  const resolvedIncidents = carrierIncidents.filter(
    (i) => i.status === "resolved",
  ).length;

  /* ===============================
     Reviews
  ================================= */
  const carrierReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewedOrganisationId, organisation.id),
  });

  const totalReviews = carrierReviews.length;

  const averageRating =
    totalReviews > 0
      ? (
          carrierReviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews
        ).toFixed(1)
      : "N/A";

  /* ===============================
     UI
  ================================= */

  return (
    <main className="pt-10 space-y-10">
      <h1 className="text-3xl font-bold">Carrier Hub Analytics</h1>

      {/* KPI GRID */}
      <section className="grid grid-cols-4 gap-6">
        <StatCard title="Total Jobs" value={totalJobs} />
        <StatCard title="Completed Jobs" value={completedJobs} />
        <StatCard title="Pending Jobs" value={pendingJobs} />
        <StatCard title="Rejected Jobs" value={rejectedJobs} />
      </section>

      <section className="grid grid-cols-4 gap-6">
        <StatCard title="Total Revenue (£)" value={totalRevenue} />
        <StatCard title="Open Incidents" value={openIncidents} />
        <StatCard title="Resolved Incidents" value={resolvedIncidents} />
        <StatCard title="Average Rating" value={averageRating} />
      </section>

      {/* Recent Jobs */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">Recent Assignments</h2>

        <div className="bg-gray-100 rounded-lg p-6 space-y-4">
          {assignments.slice(0, 5).map((job) => (
            <div key={job.id} className="border-b pb-3 flex justify-between">
              <div>
                <p className="font-medium">{job.listing?.name}</p>
              </div>

              <div className="text-right">
                <p className="font-semibold">£{job.listing?.currentBid}</p>
                <p className="text-sm capitalize text-gray-500">{job.status}</p>
              </div>
            </div>
          ))}

          {assignments.length === 0 && <p>No assignments yet.</p>}
        </div>
      </section>
    </main>
  );
}

/* ===============================
   Small Stat Card Component
================================= */

function StatCard({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="bg-white shadow rounded-xl p-6">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}
