import Link from "next/link";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getPlatformDashboardStats, getRecentAuditEvents } from "./actions";

export default async function AdminDashboard() {
  await requirePlatformAdmin();

  const stats = await getPlatformDashboardStats();
  const auditEvents = await getRecentAuditEvents();

  const recentDwtSubmissions =
    await database.query.wasteTrackingSubmissions.findMany({
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 100,
    });

  const dwtAttempts = recentDwtSubmissions.length;

  const dwtAccepted = recentDwtSubmissions.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(submission.status),
  ).length;

  const dwtNeedsAttention = recentDwtSubmissions.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  ).length;

  const latestDwtSubmission = recentDwtSubmissions[0] ?? null;

  const activeOperations =
    Number(stats.totals.activeListings ?? 0) +
    Number(stats.marketplace.assignments.accepted ?? 0);

  const investorSignals = [
    {
      label: "Organisations onboarded",
      value: stats.totals.organisations,
      helper: "Platform network size",
    },
    {
      label: "Users registered",
      value: stats.totals.users,
      helper: "Total platform accounts",
    },
    {
      label: "Completed assignments",
      value: stats.marketplace.assignments.completed,
      helper: "Operational proof",
    },
    {
      label: "DWT accepted records",
      value: dwtAccepted,
      helper: "Latest 100 API attempts",
    },
  ];

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Waste X Admin
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Platform Overview
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              High-level system activity, operational movement, compliance risk
              and investor-facing platform signals.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/analytics"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              View analytics
            </Link>

            <Link
              href="/admin/digital-waste-tracking"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              DWT control room
            </Link>
          </div>
        </div>
      </section>

      {/* ================= TOP KPIS ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Organisations"
          value={stats.totals.organisations}
          helper="Total registered organisations"
        />

        <KpiCard
          title="Users"
          value={stats.totals.users}
          helper="Across all organisations"
        />

        <KpiCard
          title="Active Operations"
          value={activeOperations}
          helper="Listings plus accepted assignments"
        />

        <KpiCard
          title="DWT Accepted"
          value={dwtAccepted}
          helper="Accepted test/API records"
        />
      </section>

      {/* ================= MAIN GRID ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* MARKETPLACE / OPERATIONS */}
        <Panel
          className="xl:col-span-2"
          eyebrow="Operations"
          title="Marketplace and movement activity"
          description="A quick view of waste listing activity, bids and assignment progress."
          actionHref="/admin/audit/chain"
          actionLabel="Chain of custody"
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Stat
              label="Listings this month"
              value={stats.marketplace.listingsThisMonth}
              helper="New waste listing activity"
            />

            <Stat
              label="Bids this month"
              value={stats.marketplace.bidsThisMonth}
              helper="Marketplace engagement"
            />

            <Stat
              label="Avg bids / listing"
              value={Number(stats.marketplace.avgBidsPerListing ?? 0).toFixed(
                2,
              )}
              helper="Competition signal"
            />
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-950">
                  Assignment lifecycle
                </h3>

                <p className="mt-1 text-sm leading-6 text-gray-500">
                  Tracks operational jobs moving from assignment through to
                  completion.
                </p>
              </div>

              <div className="grid min-w-[18rem] gap-2 text-sm">
                <StatusRow
                  label="Pending"
                  value={stats.marketplace.assignments.pending}
                />
                <StatusRow
                  label="Accepted"
                  value={stats.marketplace.assignments.accepted}
                />
                <StatusRow
                  label="Completed"
                  value={stats.marketplace.assignments.completed}
                />
              </div>
            </div>
          </div>
        </Panel>

        {/* DWT */}
        <Panel
          eyebrow="Digital Waste Tracking"
          title="DWT submission health"
          description="Latest Waste Tracking Service submission activity from Waste X."
          actionHref="/admin/digital-waste-tracking"
          actionLabel="Open DWT"
        >
          <div className="space-y-3">
            <StatusRow label="API attempts" value={dwtAttempts} />
            <StatusRow label="Accepted" value={dwtAccepted} />
            <StatusRow label="Needs attention" value={dwtNeedsAttention} />
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Latest DWT result
            </p>

            {latestDwtSubmission ? (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={latestDwtSubmission.status} />

                  {latestDwtSubmission.wasteTrackingId && (
                    <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600">
                      ID: {latestDwtSubmission.wasteTrackingId}
                    </span>
                  )}
                </div>

                <p className="text-sm text-gray-500">
                  Endpoint:{" "}
                  <span className="font-medium text-gray-700">
                    {latestDwtSubmission.endpoint}
                  </span>
                </p>

                <p className="text-sm text-gray-500">
                  Submitted:{" "}
                  <span className="font-medium text-gray-700">
                    {formatDate(latestDwtSubmission.submittedAt)}
                  </span>
                </p>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-gray-500">
                No DWT submissions have been recorded yet.
              </p>
            )}
          </div>
        </Panel>
      </section>

      {/* ================= RISK + INVESTOR SNAPSHOT ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <Panel
          eyebrow="Risk"
          title="Risk and compliance"
          description="Signals that may need platform admin attention."
          actionHref="/admin/audit/compliance"
          actionLabel="Compliance audit"
        >
          <div className="space-y-3">
            <StatusRow label="Open incidents" value={stats.totals.openIncidents} />
            <StatusRow label="Under review" value={stats.risk.underReview} />
            <StatusRow
              label="Suspended users"
              value={stats.risk.suspendedUsers}
            />
            <StatusRow
              label="Archived listings"
              value={stats.risk.archivedListings}
            />
          </div>
        </Panel>

        <Panel
          className="xl:col-span-2"
          eyebrow="Investor Snapshot"
          title="Platform traction signals"
          description="A cleaner snapshot of network growth, operational usage and compliance proof."
          actionHref="/admin/analytics"
          actionLabel="Investor analytics"
        >
          <div className="grid gap-4 md:grid-cols-4">
            {investorSignals.map((signal) => (
              <Stat
                key={signal.label}
                label={signal.label}
                value={signal.value}
                helper={signal.helper}
              />
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="grid gap-4 md:grid-cols-2">
              <Stat
                label="Average rating"
                value={Number(stats.reviews.averageRating ?? 0).toFixed(2)}
                helper="Reputation signal"
              />

              <Stat
                label="Reviews this week"
                value={stats.reviews.reviewsThisWeek}
                helper="Recent trust activity"
              />
            </div>
          </div>
        </Panel>
      </section>

      {/* ================= RECENT ACTIVITY ================= */}
      <Panel
        eyebrow="Live Activity"
        title="Recent platform activity"
        description="Recent audit events across the platform."
        actionHref="/admin/audit/live"
        actionLabel="View live activity"
      >
        {auditEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6">
            <p className="text-sm font-semibold text-gray-900">
              No recent audit events.
            </p>

            <p className="mt-2 text-sm leading-6 text-gray-500">
              Platform actions will appear here as users create listings,
              assignments, incidents, submissions and account updates.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-gray-200">
            <div className="divide-y divide-gray-200 bg-white">
              {auditEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-col gap-2 px-5 py-4 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-950">
                      {event.action}
                    </p>

                    <p className="mt-1 text-xs text-gray-400">
                      Audit event #{event.id}
                    </p>
                  </div>

                  <span className="text-sm text-gray-500">
                    {event.createdAt
                      ? new Date(event.createdAt).toLocaleString()
                      : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function KpiCard({
  title,
  value,
  helper,
}: {
  title: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-medium text-gray-500">{title}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
        {value}
      </p>

      {helper && <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>}
    </div>
  );
}

function Panel({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  className = "",
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              {eyebrow}
            </p>
          )}

          <h2 className="mt-2 text-lg font-bold text-gray-950">{title}</h2>

          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              {description}
            </p>
          )}
        </div>

        {actionHref && actionLabel && (
          <Link
            href={actionHref}
            className="inline-flex rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
          >
            {actionLabel} →
          </Link>
        )}
      </div>

      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-sm text-gray-500">{label}</p>

      <p className="mt-2 text-xl font-bold text-gray-950">{value}</p>

      {helper && <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>}
    </div>
  );
}

function StatusRow({
  label,
  value,
}: {
  label: string;
  value: number | string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <span className="text-sm text-gray-600">{label}</span>
      <span className="text-sm font-bold text-gray-950">{value}</span>
    </div>
  );
}

function StatusBadge({ status }: { status: string | null | undefined }) {
  const formatted = formatStatus(status);

  const className =
    status === "accepted"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "accepted_with_warnings"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "rejected" || status === "failed"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatted}
    </span>
  );
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}