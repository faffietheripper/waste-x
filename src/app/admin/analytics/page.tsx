// src/app/admin/analytics/page.tsx

import Link from "next/link";
import type { ReactNode } from "react";
import { desc } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteTrackingSubmissions } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getPlatformAnalytics } from "./actions";
import { ListingsOverTimeChart, CompletionFunnelChart } from "./Charts";

export default async function AdminAnalyticsPage() {
  await requirePlatformAdmin();

  const data = await getPlatformAnalytics();

  const recentDwtSubmissions =
    await database.query.wasteTrackingSubmissions.findMany({
      orderBy: [desc(wasteTrackingSubmissions.createdAt)],
      limit: 100,
    });

  const conversionRate =
    data.marketplace.listings > 0
      ? Math.round((data.logistics.completed / data.marketplace.listings) * 100)
      : 0;

  const assignmentCompletionRate =
    data.logistics.assignments > 0
      ? Math.round((data.logistics.completed / data.logistics.assignments) * 100)
      : 0;

  const dwtAttempts = recentDwtSubmissions.length;

  const dwtAccepted = recentDwtSubmissions.filter((submission) =>
    ["accepted", "accepted_with_warnings"].includes(submission.status),
  ).length;

  const dwtRejectedOrFailed = recentDwtSubmissions.filter((submission) =>
    ["rejected", "failed"].includes(submission.status),
  ).length;

  const dwtSuccessRate =
    dwtAttempts > 0 ? Math.round((dwtAccepted / dwtAttempts) * 100) : 0;

  const latestDwtSubmission = recentDwtSubmissions[0] ?? null;

  const listingsOverTime = data.charts.listingsOverTime;

  const funnelData = [
    { stage: "Created", value: data.marketplace.listings },
    { stage: "Assigned", value: data.logistics.assigned },
    { stage: "Completed", value: data.logistics.completed },
  ];

  const investorReadinessScore = calculateInvestorReadinessScore({
    organisations: data.growth.organisations,
    activeOrgs: data.growth.activeOrgs,
    users: data.growth.users,
    completedAssignments: data.logistics.completed,
    dwtAccepted,
    openIncidents: data.risk.openIncidents,
  });

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Waste X Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Platform Analytics
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Business intelligence, adoption metrics, operational performance,
              Digital Waste Tracking activity and investor-facing platform
              signals.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Dashboard
            </Link>

            <Link
              href="/admin/digital-waste-tracking"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              DWT analytics
            </Link>
          </div>
        </div>
      </section>

      {/* ================= EXECUTIVE SNAPSHOT ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Organisations"
          value={data.growth.organisations}
          helper={`${data.growth.activeOrgs} active organisations`}
        />

        <KpiCard
          label="Users"
          value={data.growth.users}
          helper="Registered platform users"
        />

        <KpiCard
          label="Completion rate"
          value={`${conversionRate}%`}
          helper="Completed jobs against listings"
        />

        <KpiCard
          label="Investor readiness"
          value={`${investorReadinessScore}%`}
          helper="Network, usage, DWT and risk signal"
        />
      </section>

      {/* ================= CHARTS ================= */}
      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartPanel
          eyebrow="Growth"
          title="Listings over time"
          description="Shows marketplace activity and demand creation over time."
        >
          <ListingsOverTimeChart data={listingsOverTime} />
        </ChartPanel>

        <ChartPanel
          eyebrow="Lifecycle"
          title="Completion funnel"
          description="Tracks how many listings move through assignment and completion."
        >
          <CompletionFunnelChart data={funnelData} />
        </ChartPanel>
      </section>

      {/* ================= GROWTH + MARKETPLACE ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <AnalyticsSection
          eyebrow="Growth"
          title="Network growth"
          description="How the Waste X network is growing across organisations and users."
          actionHref="/admin/organisations"
          actionLabel="View organisations"
        >
          <MetricGrid>
            <Kpi
              label="Organisations"
              value={data.growth.organisations}
              helper="Total registered organisations"
            />

            <Kpi
              label="Active orgs"
              value={data.growth.activeOrgs}
              helper="Organisations currently active"
            />

            <Kpi
              label="Users"
              value={data.growth.users}
              helper="Total registered users"
            />

            <Kpi
              label="Activation"
              value={`${calculateRate(
                data.growth.activeOrgs,
                data.growth.organisations,
              )}%`}
              helper="Active orgs / total orgs"
            />
          </MetricGrid>
        </AnalyticsSection>

        <AnalyticsSection
          eyebrow="Marketplace"
          title="Marketplace activity"
          description="Listings, bids and value moving through the platform."
          actionHref="/admin/audit/entity"
          actionLabel="Explore entities"
        >
          <MetricGrid>
            <Kpi
              label="Total listings"
              value={data.marketplace.listings}
              helper="All created waste listings"
            />

            <Kpi
              label="Total bids"
              value={data.marketplace.bids}
              helper="Marketplace engagement"
            />

            <Kpi
              label="Marketplace value"
              value={formatCurrency(data.marketplace.totalValue)}
              helper="Estimated platform value"
            />

            <Kpi
              label="Avg bids / listing"
              value={Number(data.marketplace.avgBids ?? 0).toFixed(2)}
              helper="Competition signal"
            />
          </MetricGrid>
        </AnalyticsSection>
      </section>

      {/* ================= LOGISTICS + DWT ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <AnalyticsSection
          eyebrow="Operations"
          title="Operational lifecycle"
          description="How jobs move from creation through assignment and completion."
          actionHref="/admin/audit/chain"
          actionLabel="Chain of custody"
        >
          <MetricGrid>
            <Kpi
              label="Created"
              value={data.marketplace.listings}
              helper="Listings created"
            />

            <Kpi
              label="Assigned"
              value={data.logistics.assigned}
              helper="Jobs assigned to carriers"
            />

            <Kpi
              label="Completed"
              value={data.logistics.completed}
              helper="Completed operational jobs"
            />

            <Kpi
              label="Assignment completion"
              value={`${assignmentCompletionRate}%`}
              helper="Completed / assignments"
            />
          </MetricGrid>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-gray-950">
                  Lifecycle conversion
                </h3>

                <p className="mt-1 text-sm leading-6 text-gray-500">
                  This helps show whether Waste X is only creating demand, or
                  actually moving jobs through the operational workflow.
                </p>
              </div>

              <span className="rounded-full bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
                {conversionRate}% conversion
              </span>
            </div>
          </div>
        </AnalyticsSection>

        <AnalyticsSection
          eyebrow="Digital Waste Tracking"
          title="DWT API performance"
          description="Recent Digital Waste Tracking test/API submission activity."
          actionHref="/admin/digital-waste-tracking"
          actionLabel="Open DWT"
        >
          <MetricGrid>
            <Kpi
              label="API attempts"
              value={dwtAttempts}
              helper="Latest 100 DWT records"
            />

            <Kpi
              label="Accepted"
              value={dwtAccepted}
              helper="Accepted or accepted with warnings"
            />

            <Kpi
              label="Rejected / failed"
              value={dwtRejectedOrFailed}
              helper="Needs review"
            />

            <Kpi
              label="DWT success rate"
              value={`${dwtSuccessRate}%`}
              helper="Accepted / total attempts"
            />
          </MetricGrid>

          <div className="mt-5 rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-400">
              Latest DWT submission
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

                <div className="grid gap-2 text-sm text-gray-500 md:grid-cols-2">
                  <p>
                    Endpoint:{" "}
                    <span className="font-medium text-gray-700">
                      {latestDwtSubmission.endpoint}
                    </span>
                  </p>

                  <p>
                    Method:{" "}
                    <span className="font-medium text-gray-700">
                      {latestDwtSubmission.method}
                    </span>
                  </p>

                  <p>
                    Submitted:{" "}
                    <span className="font-medium text-gray-700">
                      {formatDate(latestDwtSubmission.submittedAt)}
                    </span>
                  </p>

                  <p>
                    Last attempted:{" "}
                    <span className="font-medium text-gray-700">
                      {formatDate(latestDwtSubmission.lastAttemptedAt)}
                    </span>
                  </p>
                </div>
              </div>
            ) : (
              <p className="mt-3 text-sm leading-6 text-gray-500">
                No Digital Waste Tracking submissions have been recorded yet.
              </p>
            )}
          </div>
        </AnalyticsSection>
      </section>

      {/* ================= TRUST + RISK ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        <AnalyticsSection
          eyebrow="Trust"
          title="Trust and reputation"
          description="Reviews and reputation signals across the platform."
          actionHref="/admin/reviews"
          actionLabel="Review monitoring"
        >
          <MetricGrid>
            <Kpi
              label="Average rating"
              value={Number(data.trust.avgRating ?? 0).toFixed(2)}
              helper="Overall review quality"
            />

            <Kpi
              label="Total reviews"
              value={data.trust.totalReviews}
              helper="All review records"
            />

            <Kpi
              label="Reviews / organisation"
              value={calculateAverage(
                data.trust.totalReviews,
                data.growth.organisations,
              )}
              helper="Review density"
            />

            <Kpi
              label="Reputation status"
              value={Number(data.trust.avgRating ?? 0) >= 4 ? "Strong" : "Watch"}
              helper="Basic quality signal"
            />
          </MetricGrid>
        </AnalyticsSection>

        <AnalyticsSection
          eyebrow="Risk"
          title="Risk and incident posture"
          description="Incident and compliance risk indicators that may need admin review."
          actionHref="/admin/incidents"
          actionLabel="Incident management"
        >
          <MetricGrid>
            <Kpi
              label="Open incidents"
              value={data.risk.openIncidents}
              helper="Currently unresolved"
            />

            <Kpi
              label="Resolved incidents"
              value={data.risk.resolvedIncidents}
              helper="Closed incident records"
            />

            <Kpi
              label="Resolution ratio"
              value={`${calculateRate(
                data.risk.resolvedIncidents,
                data.risk.openIncidents + data.risk.resolvedIncidents,
              )}%`}
              helper="Resolved / total known incidents"
            />

            <Kpi
              label="Risk status"
              value={data.risk.openIncidents > 0 ? "Review" : "Clear"}
              helper="Current platform risk"
            />
          </MetricGrid>
        </AnalyticsSection>
      </section>

      {/* ================= SYSTEM ACTIVITY ================= */}
      <AnalyticsSection
        eyebrow="System"
        title="System activity"
        description="Recent platform activity and user engagement signals."
        actionHref="/admin/audit/live"
        actionLabel="View live activity"
      >
        <MetricGrid>
          <Kpi
            label="Events in 24h"
            value={data.system.events24h}
            helper="Recent audit activity"
          />

          <Kpi
            label="Active users in 24h"
            value={data.system.activeUsers24h}
            helper="Recent user engagement"
          />

          <Kpi
            label="Activity / user"
            value={calculateAverage(data.system.events24h, data.system.activeUsers24h)}
            helper="Events per active user"
          />

          <Kpi
            label="System signal"
            value={data.system.events24h > 0 ? "Active" : "Quiet"}
            helper="Current platform movement"
          />
        </MetricGrid>
      </AnalyticsSection>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function AnalyticsSection({
  eyebrow,
  title,
  description,
  actionHref,
  actionLabel,
  children,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
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

function ChartPanel({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
          {eyebrow}
        </p>

        <h2 className="mt-2 text-lg font-bold text-gray-950">{title}</h2>

        <p className="mt-2 text-sm leading-6 text-gray-500">{description}</p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-gray-50 p-4">
        {children}
      </div>
    </section>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

function KpiCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper?: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
        {value}
      </p>

      {helper && <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>}
    </div>
  );
}

function Kpi({
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

/* =========================================================
   HELPERS
========================================================= */

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;

  return Math.round((value / total) * 100);
}

function calculateAverage(value: number, total: number) {
  if (!total || total <= 0) return "0.00";

  return (value / total).toFixed(2);
}

function calculateInvestorReadinessScore(params: {
  organisations: number;
  activeOrgs: number;
  users: number;
  completedAssignments: number;
  dwtAccepted: number;
  openIncidents: number;
}) {
  let score = 0;

  if (params.organisations > 0) score += 15;
  if (params.organisations >= 3) score += 10;
  if (params.activeOrgs > 0) score += 15;
  if (params.users >= 5) score += 10;
  if (params.completedAssignments > 0) score += 20;
  if (params.dwtAccepted > 0) score += 20;
  if (params.openIncidents === 0) score += 10;

  return Math.min(score, 100);
}

function formatCurrency(value: number | string) {
  const numericValue =
    typeof value === "number" ? value : Number.parseFloat(String(value));

  if (!Number.isFinite(numericValue)) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(numericValue);
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