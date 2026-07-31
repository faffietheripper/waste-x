import Link from "next/link";
import { desc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { organisations, wasteTrackingSubmissions } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getPlatformDashboardStats, getRecentAuditEvents } from "./actions";

const ORGANISATION_APPROVAL_ROUTE = "/admin/organisations";

export default async function AdminDashboard() {
  await requirePlatformAdmin();

  const stats = await getPlatformDashboardStats();
  const auditEvents = await getRecentAuditEvents();

  const organisationsAwaitingApproval =
    await database.query.organisations.findMany({
      where: eq(organisations.status, "PENDING"),
      orderBy: [desc(organisations.createdAt)],
      limit: 5,
    });

  const pendingOrganisationCount = organisationsAwaitingApproval.length;

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

      {/* ================= PLATFORM ALERTS ================= */}
      {pendingOrganisationCount > 0 && (
        <OrganisationApprovalAlert
          organisationsAwaitingApproval={organisationsAwaitingApproval}
          pendingOrganisationCount={pendingOrganisationCount}
        />
      )}

      {/* ================= TOP KPIS ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Organisations"
          value={stats.totals.organisations}
          helper={
            pendingOrganisationCount > 0
              ? `${pendingOrganisationCount} awaiting approval`
              : "Total registered organisations"
          }
          warning={pendingOrganisationCount > 0}
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
            <StatusRow
              label="Organisations pending approval"
              value={pendingOrganisationCount}
              warning={pendingOrganisationCount > 0}
            />
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

function OrganisationApprovalAlert({
  organisationsAwaitingApproval,
  pendingOrganisationCount,
}: {
  organisationsAwaitingApproval: any[];
  pendingOrganisationCount: number;
}) {
  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-orange-200 bg-orange-50 shadow-sm">
      <div className="border-b border-orange-200 bg-orange-100/60 px-6 py-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-orange-700">
              New Organisation Alert
            </p>

            <h2 className="mt-2 text-xl font-bold text-gray-950">
              {pendingOrganisationCount === 1
                ? "1 organisation needs approval"
                : `${pendingOrganisationCount} organisations need approval`}
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-900/75">
              A new organisation has requested access to Waste X. Review the
              organisation details and approve or reject the onboarding request.
            </p>
          </div>

          <Link
            href={ORGANISATION_APPROVAL_ROUTE}
            className="inline-flex justify-center rounded-full bg-gray-950 px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Review approvals →
          </Link>
        </div>
      </div>

      <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">
        {organisationsAwaitingApproval.map((organisation) => (
          <PendingOrganisationCard
            key={organisation.id}
            organisation={organisation}
          />
        ))}
      </div>

      {pendingOrganisationCount >= 5 && (
        <div className="border-t border-orange-200 px-6 py-4">
          <p className="text-sm leading-6 text-orange-900/70">
            Showing the latest 5 pending organisations. Open approvals to review
            all pending requests.
          </p>
        </div>
      )}
    </section>
  );
}

function PendingOrganisationCard({ organisation }: { organisation: any }) {
  const capabilities = Array.isArray(organisation.capabilities)
    ? organisation.capabilities
    : [];

  return (
    <div className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-gray-950">
            {organisation.teamName ?? "Unnamed organisation"}
          </p>

          {organisation.emailAddress && (
            <p className="mt-1 truncate text-xs text-gray-500">
              {organisation.emailAddress}
            </p>
          )}
        </div>

        <span className="shrink-0 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-orange-700">
          Pending
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {capabilities.length > 0 ? (
          capabilities.map((capability: string) => (
            <span
              key={capability}
              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600"
            >
              {formatStatus(capability)}
            </span>
          ))
        ) : (
          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-400">
            No capabilities selected
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-2 text-xs text-gray-500">
        {organisation.telephone && (
          <p>
            Phone:{" "}
            <span className="font-medium text-gray-700">
              {organisation.telephone}
            </span>
          </p>
        )}

        {organisation.industry && (
          <p>
            Industry:{" "}
            <span className="font-medium text-gray-700">
              {organisation.industry}
            </span>
          </p>
        )}

        <p>
          Requested:{" "}
          <span className="font-medium text-gray-700">
            {formatDate(organisation.createdAt)}
          </span>
        </p>
      </div>
    </div>
  );
}

function KpiCard({
  title,
  value,
  helper,
  warning = false,
}: {
  title: string;
  value: number | string;
  helper?: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-[1.5rem] border bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        warning ? "border-orange-200" : "border-gray-200"
      }`}
    >
      <p className="text-sm font-medium text-gray-500">{title}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
        {value}
      </p>

      {helper && (
        <p
          className={`mt-2 text-xs leading-5 ${
            warning ? "font-semibold text-orange-700" : "text-gray-400"
          }`}
        >
          {helper}
        </p>
      )}
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
  warning = false,
}: {
  label: string;
  value: number | string;
  warning?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-4 rounded-2xl border px-4 py-3 ${
        warning
          ? "border-orange-200 bg-orange-50"
          : "border-gray-200 bg-gray-50"
      }`}
    >
      <span
        className={`text-sm ${warning ? "font-semibold text-orange-800" : "text-gray-600"}`}
      >
        {label}
      </span>

      <span
        className={`text-sm font-bold ${
          warning ? "text-orange-900" : "text-gray-950"
        }`}
      >
        {value}
      </span>
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
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}