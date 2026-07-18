// src/app/admin/errors/page.tsx

import Link from "next/link";

import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getErrorsAction } from "./actions";
import ErrorsClient from "./ErrorsClient";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "active" | "resolved" | "all";

type AdminErrorsSearchParams =
  | {
      severity?: string;
      code?: string;
      status?: string;
    }
  | Promise<{
      severity?: string;
      code?: string;
      status?: string;
    }>;

/* =========================================================
   PAGE
========================================================= */

export default async function AdminErrorsPage({
  searchParams,
}: {
  searchParams?: AdminErrorsSearchParams;
}) {
  await requirePlatformAdmin();

  const resolvedSearchParams = searchParams ? await searchParams : {};

  const severity = normaliseSeverity(resolvedSearchParams.severity);
  const status = normaliseStatus(resolvedSearchParams.status);
  const code = normaliseCode(resolvedSearchParams.code);

  const errors = await getErrorsAction({
    severity,
    code,
    status,
  });

  const safeErrors = Array.isArray(errors)
    ? errors.map((error) => {
        const row = error as Record<string, unknown>;

        return {
          ...error,
          createdAt: serialiseDate(row.createdAt),
          resolvedAt: serialiseDate(row.resolvedAt),
          updatedAt: serialiseDate(row.updatedAt),
        };
      })
    : [];

  const totalErrors = safeErrors.length;

  const criticalErrors = safeErrors.filter(
    (error) => error.severity === "critical",
  ).length;

  const highErrors = safeErrors.filter(
    (error) => error.severity === "high",
  ).length;

  const mediumErrors = safeErrors.filter(
    (error) => error.severity === "medium",
  ).length;

  const lowErrors = safeErrors.filter(
    (error) => error.severity === "low",
  ).length;

  const activeFilters = [
    severity ? `Severity: ${formatLabel(severity)}` : null,
    status ? `Status: ${formatLabel(status)}` : null,
    code ? `Code: ${code}` : null,
  ].filter(isNonEmptyString);

  const hasActiveFilters =
    Boolean(severity) || Boolean(code) || status !== "active";

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              System Monitoring
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Error Monitoring
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Review platform errors, failed server actions, system exceptions
              and operational problems that need investigation or resolution.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/alerts"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Alerts
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
      <section className="grid gap-5 md:grid-cols-2 xl:grid-cols-5">
        <Metric
          label="Errors shown"
          value={totalErrors}
          helper="Current filtered result set"
          tone={totalErrors > 0 ? "danger" : "default"}
        />

        <Metric
          label="Critical"
          value={criticalErrors}
          helper="Needs urgent review"
          tone={criticalErrors > 0 ? "danger" : "default"}
        />

        <Metric
          label="High"
          value={highErrors}
          helper="Important system issues"
          tone={highErrors > 0 ? "danger" : "default"}
        />

        <Metric
          label="Medium"
          value={mediumErrors}
          helper="Moderate severity"
        />

        <Metric label="Low" value={lowErrors} helper="Low severity" />
      </section>

      {/* ================= FILTER SUMMARY ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Current View
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Error filters
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              The error register below is filtered by severity, error code and
              resolution status.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {activeFilters.length > 0 ? (
                activeFilters.map((filter) => (
                  <span
                    key={filter}
                    className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600"
                  >
                    {filter}
                  </span>
                ))
              ) : (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-semibold text-gray-600">
                  Active errors
                </span>
              )}
            </div>
          </div>

          {hasActiveFilters && (
            <Link
              href="/admin/errors"
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              Clear filters
            </Link>
          )}
        </div>
      </section>

      {/* ================= CLIENT REGISTER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="mb-6 border-b border-gray-200 pb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Error Register
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            System errors and failed operations
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            Use this area to inspect errors, filter by severity or code, and
            resolve issues once they have been reviewed.
          </p>
        </div>

        <ErrorsClient initialErrors={safeErrors} />
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Metric({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string | number;
  helper: string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p
        className={`mt-3 text-3xl font-bold tracking-tight ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normaliseSeverity(value: string | undefined): Severity | undefined {
  if (
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "critical"
  ) {
    return value;
  }

  return undefined;
}

function normaliseStatus(value: string | undefined): Status {
  if (value === "active" || value === "resolved" || value === "all") {
    return value;
  }

  return "active";
}

function normaliseCode(value: string | undefined) {
  if (!value) return undefined;

  const cleaned = value.trim();

  return cleaned.length > 0 ? cleaned : undefined;
}

function serialiseDate(value: unknown) {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);

    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  return null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}