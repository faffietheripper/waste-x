// src/app/admin/incidents/page.tsx

import Link from "next/link";
import type { ReactNode } from "react";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getFilteredIncidents, getIncidentKpis } from "./actions";
import Filters from "./filters";

interface Props {
  searchParams?:
    | {
        status?: string | string[];
        from?: string | string[];
        to?: string | string[];
        q?: string | string[];
      }
    | Promise<{
        status?: string | string[];
        from?: string | string[];
        to?: string | string[];
        q?: string | string[];
      }>;
}

type IncidentStatus = "open" | "under_review" | "resolved" | "rejected";

export default async function AdminIncidentsPage({ searchParams }: Props) {
  await requirePlatformAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const filters = {
    status: normaliseParam(resolvedSearchParams.status),
    from: normaliseParam(resolvedSearchParams.from),
    to: normaliseParam(resolvedSearchParams.to),
    q: normaliseParam(resolvedSearchParams.q),
  };

  const incidents = await getFilteredIncidents(filters);
  const kpis = await getIncidentKpis();

  const totalIncidents =
    Number(kpis.open ?? 0) +
    Number(kpis.underReview ?? 0) +
    Number(kpis.resolved ?? 0) +
    Number(kpis.rejected ?? 0);

  const unresolvedIncidents =
    Number(kpis.open ?? 0) + Number(kpis.underReview ?? 0);

  const resolutionRate = calculateRate(Number(kpis.resolved ?? 0), totalIncidents);

  const filteredCount = incidents.length;

  const hasActiveFilters =
    Boolean(filters.status) ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.q);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Compliance Monitoring
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Incident Monitoring
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Monitor reported incidents across Waste X, review unresolved
              compliance issues, and investigate records linked to listings,
              assignments and organisations.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/compliance"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Compliance audit
            </Link>

            <Link
              href="/admin/audit/live"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Live activity
            </Link>
          </div>
        </div>
      </section>

      {/* ================= KPI GRID ================= */}
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Open"
          value={kpis.open}
          helper="Requires immediate review"
          tone={Number(kpis.open ?? 0) > 0 ? "danger" : "default"}
        />

        <KpiCard
          title="Under Review"
          value={kpis.underReview}
          helper="Currently being investigated"
          tone={Number(kpis.underReview ?? 0) > 0 ? "warning" : "default"}
        />

        <KpiCard
          title="Resolved"
          value={kpis.resolved}
          helper={`${resolutionRate}% resolution rate`}
        />

        <KpiCard
          title="Rejected"
          value={kpis.rejected}
          helper="Rejected incident reports"
        />
      </section>

      {/* ================= INCIDENT HEALTH ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Incident Health
          </p>

          <div className="mt-5 flex items-end gap-3">
            <p
              className={`text-5xl font-black tracking-tight ${
                unresolvedIncidents > 0 ? "text-red-700" : "text-gray-950"
              }`}
            >
              {unresolvedIncidents}
            </p>

            <p className="pb-2 text-sm font-semibold text-gray-400">
              unresolved
            </p>
          </div>

          <p className="mt-4 text-sm leading-6 text-gray-500">
            Open and under-review incidents can block completion and reduce
            compliance confidence until they are resolved.
          </p>
        </section>

        <section className="grid gap-5 md:grid-cols-2 xl:col-span-2">
          <MiniMetric
            label="Total incidents"
            value={totalIncidents}
            helper="All recorded incident statuses"
          />

          <MiniMetric
            label="Filtered results"
            value={filteredCount}
            helper={hasActiveFilters ? "Matching active filters" : "Current list"}
          />

          <MiniMetric
            label="Resolution rate"
            value={`${resolutionRate}%`}
            helper="Resolved / total incidents"
          />

          <MiniMetric
            label="Risk status"
            value={unresolvedIncidents > 0 ? "Review" : "Clear"}
            helper={
              unresolvedIncidents > 0
                ? "Unresolved incidents exist"
                : "No unresolved incidents"
            }
            tone={unresolvedIncidents > 0 ? "danger" : "default"}
          />
        </section>
      </section>

      {/* ================= FILTERS ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Filters
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Filter incident records
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Filter by status, date range or search term to focus on the
              incident records that need admin attention.
            </p>
          </div>

          {hasActiveFilters && (
            <Link
              href="/admin/incidents"
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              Clear filters
            </Link>
          )}
        </div>

        <Filters />
      </section>

      {/* ================= INCIDENT TABLE ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Incident Register
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Reported incidents
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Review the incident status, reporting organisation, listing
              relationship and investigation links.
            </p>
          </div>

          <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
            {incidents.length} result{incidents.length === 1 ? "" : "s"}
          </span>
        </div>

        {incidents.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No incidents found.
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Try clearing the filters or checking a different date range.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="overflow-x-auto">
              <table className="min-w-[1050px] w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <TableHead>Date</TableHead>
                    <TableHead>Organisation</TableHead>
                    <TableHead>Listing</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Actions</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-gray-200 bg-white">
                  {incidents.map((incident) => {
                    const summary = getIncidentSummary(incident);
                    const assignmentId = getIncidentAssignmentId(incident);

                    return (
                      <tr key={incident.id} className="transition hover:bg-gray-50">
                        <TableCell>{formatDate(incident.createdAt)}</TableCell>

                        <TableCell>
                          <div>
                            <p className="font-semibold text-gray-950">
                              {incident.reportedByOrganisation?.teamName ?? "—"}
                            </p>

                            <p className="mt-1 text-xs text-gray-400">
                              Incident #{shortId(incident.id)}
                            </p>
                          </div>
                        </TableCell>

                        <TableCell>
                          {incident.listingId ? (
                            <Link
                              href={`/admin/audit/chain/${incident.listingId}`}
                              className="font-semibold text-gray-800 underline-offset-4 hover:underline"
                            >
                              #{incident.listingId}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </TableCell>

                        <TableCell>
                          <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-600">
                            {formatLabel(incident.type)}
                          </span>
                        </TableCell>

                        <TableCell>
                          <StatusBadge status={incident.status as IncidentStatus} />
                        </TableCell>

                        <TableCell>
                          <p className="max-w-[24rem] truncate text-gray-600">
                            {summary || "No summary recorded"}
                          </p>
                        </TableCell>

                        <TableCell>
                          <div className="flex flex-wrap items-center gap-2">
                            <Link
                              href={`/admin/audit/entity?entityId=${encodeURIComponent(
                                incident.id,
                              )}`}
                              className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                            >
                              Audit
                            </Link>

                            {incident.listingId && (
                              <Link
                                href={`/admin/audit/chain/${incident.listingId}`}
                                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                              >
                                Chain
                              </Link>
                            )}

                            {assignmentId && (
                              <Link
                                href={`/admin/audit/entity?entityId=${encodeURIComponent(
                                  assignmentId,
                                )}`}
                                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
                              >
                                Assignment
                              </Link>
                            )}
                          </div>
                        </TableCell>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
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
  tone = "default",
}: {
  title: string;
  value: number | string;
  helper: string;
  tone?: "default" | "warning" | "danger";
}) {
  const valueClass =
    tone === "danger"
      ? "text-red-700"
      : tone === "warning"
        ? "text-gray-950"
        : "text-gray-950";

  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>

      <p className={`mt-3 text-3xl font-bold tracking-tight ${valueClass}`}>
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function MiniMetric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: number | string;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-2xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: IncidentStatus | string }) {
  const className =
    status === "resolved"
      ? "border-gray-900 bg-gray-950 text-white"
      : status === "under_review"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : status === "open"
          ? "border-red-200 bg-red-50 text-red-700"
          : status === "rejected"
            ? "border-gray-200 bg-gray-50 text-gray-600"
            : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`inline-flex rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {formatLabel(status)}
    </span>
  );
}

function TableHead({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
      {children}
    </th>
  );
}

function TableCell({ children }: { children: ReactNode }) {
  return (
    <td className="whitespace-nowrap px-4 py-4 align-middle text-sm text-gray-600">
      {children}
    </td>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normaliseParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function calculateRate(value: number, total: number) {
  if (!total || total <= 0) return 0;
  return Math.round((value / total) * 100);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(new Date(date));
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function shortId(value: string | number | null | undefined) {
  if (!value) return "—";

  const text = String(value);

  if (text.length <= 8) return text;

  return text.slice(0, 8);
}

function getIncidentSummary(incident: unknown) {
  if (!incident || typeof incident !== "object") return null;

  const row = incident as {
    summary?: string | null;
    immediateAction?: string | null;
  };

  return row.summary ?? row.immediateAction ?? null;
}

function getIncidentAssignmentId(incident: unknown) {
  if (!incident || typeof incident !== "object") return null;

  const row = incident as {
    assignmentId?: string | null;
  };

  return row.assignmentId ?? null;
}