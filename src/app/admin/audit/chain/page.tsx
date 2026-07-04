import Link from "next/link";
import { desc, eq, inArray } from "drizzle-orm";

import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  wasteListings,
  wasteTrackingSubmissions,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: string | null | undefined) {
  if (status === "completed" || status === "accepted") {
    return "border-gray-900 bg-gray-950 text-white";
  }

  if (
    status === "accepted_with_warnings" ||
    status === "assigned" ||
    status === "in_progress"
  ) {
    return "border-gray-300 bg-gray-100 text-gray-800";
  }

  if (
    status === "rejected" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "open" ||
    status === "under_review"
  ) {
    return "border-red-200 bg-red-50 text-red-700";
  }

  return "border-gray-200 bg-white text-gray-600";
}

/* =========================================================
   PAGE
========================================================= */

export default async function ChainIndexPage() {
  await requirePlatformAdmin();

  const listings = await database
    .select()
    .from(wasteListings)
    .orderBy(desc(wasteListings.createdAt))
    .limit(40);

  const listingIds = listings.map((listing) => listing.id);

  const assignments =
    listingIds.length > 0
      ? await database.query.carrierAssignments.findMany({
          where: inArray(carrierAssignments.listingId, listingIds),
          columns: {
            id: true,
            listingId: true,
            status: true,
            completedAt: true,
          },
        })
      : [];

  const dwtSubmissions =
    listingIds.length > 0
      ? await database.query.wasteTrackingSubmissions.findMany({
          where: inArray(wasteTrackingSubmissions.listingId, listingIds),
          columns: {
            id: true,
            listingId: true,
            status: true,
            wasteTrackingId: true,
            createdAt: true,
          },
          orderBy: [desc(wasteTrackingSubmissions.createdAt)],
        })
      : [];

  const incidentRows =
    listingIds.length > 0
      ? await database.query.incidents.findMany({
          where: inArray(incidents.listingId, listingIds),
          columns: {
            id: true,
            listingId: true,
            status: true,
          },
        })
      : [];

  const assignmentCountByListing = new Map<number, number>();
  const completedAssignmentCountByListing = new Map<number, number>();
  const latestDwtByListing = new Map<
    number,
    (typeof dwtSubmissions)[number]
  >();
  const incidentCountByListing = new Map<number, number>();
  const unresolvedIncidentCountByListing = new Map<number, number>();

  for (const assignment of assignments) {
    assignmentCountByListing.set(
      assignment.listingId,
      (assignmentCountByListing.get(assignment.listingId) ?? 0) + 1,
    );

    if (assignment.status === "completed" || assignment.completedAt) {
      completedAssignmentCountByListing.set(
        assignment.listingId,
        (completedAssignmentCountByListing.get(assignment.listingId) ?? 0) + 1,
      );
    }
  }

  for (const submission of dwtSubmissions) {
    if (!latestDwtByListing.has(submission.listingId)) {
      latestDwtByListing.set(submission.listingId, submission);
    }
  }

  for (const incident of incidentRows) {
    incidentCountByListing.set(
      incident.listingId,
      (incidentCountByListing.get(incident.listingId) ?? 0) + 1,
    );

    if (incident.status === "open" || incident.status === "under_review") {
      unresolvedIncidentCountByListing.set(
        incident.listingId,
        (unresolvedIncidentCountByListing.get(incident.listingId) ?? 0) + 1,
      );
    }
  }

  const completedListings = listings.filter(
    (listing) => listing.status === "completed",
  ).length;

  const listingsWithDwt = listings.filter((listing) =>
    latestDwtByListing.has(listing.id),
  ).length;

  const listingsWithIncidents = listings.filter(
    (listing) => (incidentCountByListing.get(listing.id) ?? 0) > 0,
  ).length;

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Audit Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Chain of Custody
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Select a waste listing to inspect its operational lifecycle,
              assignments, incidents, Digital Waste Tracking submissions and
              audit trail.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/live"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Live activity
            </Link>

            <Link
              href="/admin/audit/compliance"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Compliance audit
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-4">
        <SummaryCard
          label="Listings shown"
          value={listings.length}
          helper="Latest 40 records"
        />

        <SummaryCard
          label="Completed"
          value={completedListings}
          helper="Completed waste listings"
        />

        <SummaryCard
          label="With DWT"
          value={listingsWithDwt}
          helper="Has DWT submission"
        />

        <SummaryCard
          label="With incidents"
          value={listingsWithIncidents}
          helper="Any incident record"
        />
      </section>

      {/* ================= LIST ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Listing Register
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Recent listings with custody signals
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Each card gives a quick view of operational, incident and DWT
              activity before opening the full custody timeline.
            </p>
          </div>
        </div>

        {listings.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No listings found.
            </p>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Waste listing custody records will appear here once organisations
              create listings.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-4">
            {listings.map((listing) => {
              const assignmentCount =
                assignmentCountByListing.get(listing.id) ?? 0;

              const completedAssignmentCount =
                completedAssignmentCountByListing.get(listing.id) ?? 0;

              const latestDwt = latestDwtByListing.get(listing.id);

              const incidentCount = incidentCountByListing.get(listing.id) ?? 0;

              const unresolvedIncidentCount =
                unresolvedIncidentCountByListing.get(listing.id) ?? 0;

              return (
                <Link
                  key={listing.id}
                  href={`/admin/audit/chain/${listing.id}`}
                  className="block rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-md"
                >
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getStatusClass(
                            listing.status,
                          )}`}
                        >
                          {formatStatus(listing.status)}
                        </span>

                        {latestDwt && (
                          <span
                            className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getStatusClass(
                              latestDwt.status,
                            )}`}
                          >
                            DWT: {formatStatus(latestDwt.status)}
                          </span>
                        )}

                        {unresolvedIncidentCount > 0 && (
                          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                            {unresolvedIncidentCount} unresolved
                          </span>
                        )}
                      </div>

                      <h3 className="mt-3 text-lg font-bold text-gray-950">
                        {listing.name}
                      </h3>

                      <p className="mt-2 text-sm leading-6 text-gray-500">
                        ID: {listing.id} • {listing.location || "No location"} •
                        Created {formatDate(listing.createdAt)}
                      </p>
                    </div>

                    <div className="grid gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:min-w-[24rem]">
                      <MiniStat
                        label="Assignments"
                        value={assignmentCount}
                        helper={`${completedAssignmentCount} completed`}
                      />

                      <MiniStat
                        label="Incidents"
                        value={incidentCount}
                        helper={`${unresolvedIncidentCount} unresolved`}
                      />

                      <MiniStat
                        label="DWT ID"
                        value={latestDwt?.wasteTrackingId ?? "—"}
                        helper={latestDwt ? formatStatus(latestDwt.status) : "No DWT yet"}
                      />

                      <MiniStat
                        label="Open"
                        value="View"
                        helper="Full audit trail"
                      />
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className="mt-3 text-3xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs font-medium text-gray-400">{label}</p>

      <p className="mt-1 truncate text-sm font-bold text-gray-950">{value}</p>

      <p className="mt-1 text-xs text-gray-400">{helper}</p>
    </div>
  );
}