// src/app/admin/errors/ErrorsClient.tsx

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { resolveErrorAction } from "./actions";

/* ===============================
   TYPES
=============================== */

type Severity = "low" | "medium" | "high" | "critical";

type ErrorLog = {
  id: string;
  code: string;
  message: string;
  severity: Severity;
  createdAt: string | null;
  updatedAt?: string | null;
  resolvedAt?: string | null;
  route?: string | null;
  userId?: string | null;
  organisationId?: string | null;
  metadata?: string | null;
  resolved?: boolean | null;
};

type GroupedError = {
  key: string;
  code: string;
  message: string;
  severity: Severity;
  count: number;
  activeCount: number;
  latest: string | null;
  latestError: ErrorLog;
};

/* ===============================
   COMPONENT
=============================== */

export default function ErrorsClient({
  initialErrors = [],
}: {
  initialErrors: ErrorLog[];
}) {
  const [selected, setSelected] = useState<ErrorLog | null>(
    initialErrors[0] ?? null,
  );

  const [view, setView] = useState<"raw" | "grouped">("raw");
  const [isPending, startTransition] = useTransition();

  const searchParams = useSearchParams();
  const router = useRouter();

  const currentSeverity = searchParams.get("severity") || "";
  const currentCode = searchParams.get("code") || "";
  const currentStatus = searchParams.get("status") || "active";

  const groupedErrors = useMemo(() => {
    const groups = new Map<string, GroupedError>();

    for (const error of initialErrors) {
      const key = `${error.code}-${error.severity}`;

      const existing = groups.get(key);

      if (!existing) {
        groups.set(key, {
          key,
          code: error.code,
          message: error.message,
          severity: error.severity,
          count: 1,
          activeCount: error.resolved ? 0 : 1,
          latest: error.createdAt,
          latestError: error,
        });

        continue;
      }

      existing.count += 1;

      if (!error.resolved) {
        existing.activeCount += 1;
      }

      const existingTime = existing.latest
        ? new Date(existing.latest).getTime()
        : 0;

      const currentTime = error.createdAt
        ? new Date(error.createdAt).getTime()
        : 0;

      if (currentTime > existingTime) {
        existing.latest = error.createdAt;
        existing.latestError = error;
        existing.message = error.message;
      }
    }

    return Array.from(groups.values()).sort((first, second) => {
      const severityDifference =
        getSeverityRank(second.severity) - getSeverityRank(first.severity);

      if (severityDifference !== 0) return severityDifference;

      const firstTime = first.latest ? new Date(first.latest).getTime() : 0;
      const secondTime = second.latest ? new Date(second.latest).getTime() : 0;

      return secondTime - firstTime;
    });
  }, [initialErrors]);

  const stats = useMemo(() => {
    return {
      total: initialErrors.length,
      critical: initialErrors.filter((error) => error.severity === "critical")
        .length,
      high: initialErrors.filter((error) => error.severity === "high").length,
      active: initialErrors.filter((error) => !error.resolved).length,
      resolved: initialErrors.filter((error) => error.resolved).length,
    };
  }, [initialErrors]);

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (value && value.trim().length > 0) {
      params.set(key, value.trim());
    } else {
      params.delete(key);
    }

    router.replace(`?${params.toString()}`);
  }

  function clearFilters() {
    router.replace("/admin/errors");
  }

  function handleResolve(errorId: string) {
    startTransition(async () => {
      await resolveErrorAction(errorId);

      if (selected?.id === errorId) {
        setSelected({
          ...selected,
          resolved: true,
          resolvedAt: new Date().toISOString(),
        });
      }

      router.refresh();
    });
  }

  const hasFilters =
    Boolean(currentSeverity) ||
    Boolean(currentCode) ||
    currentStatus !== "active";

  return (
    <div className="space-y-6">
      {/* ================= CONTROL BAR ================= */}
      <section className="rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Error Register
            </p>

            <h3 className="mt-2 text-lg font-bold text-gray-950">
              Inspect system errors
            </h3>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              View raw error logs or group repeated errors by code and severity.
              Select an error to inspect metadata, route, user and organisation
              context.
            </p>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-200 bg-white p-1">
            <button
              type="button"
              onClick={() => setView("raw")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                view === "raw"
                  ? "bg-gray-950 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Raw
            </button>

            <button
              type="button"
              onClick={() => setView("grouped")}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                view === "grouped"
                  ? "bg-gray-950 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              Grouped
            </button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="mt-6 grid gap-3 lg:grid-cols-4">
          <input
            placeholder="Search by error code..."
            defaultValue={currentCode}
            className="min-h-[3rem] rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400"
            onChange={(event) => updateParam("code", event.target.value || null)}
          />

          <select
            value={currentSeverity}
            className="min-h-[3rem] rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400"
            onChange={(event) =>
              updateParam("severity", event.target.value || null)
            }
          >
            <option value="">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={currentStatus}
            className="min-h-[3rem] rounded-2xl border border-gray-200 bg-white px-4 text-sm text-gray-900 outline-none transition focus:border-gray-400"
            onChange={(event) => updateParam("status", event.target.value)}
          >
            <option value="active">Active only</option>
            <option value="resolved">Resolved only</option>
            <option value="all">All errors</option>
          </select>

          <button
            type="button"
            onClick={clearFilters}
            disabled={!hasFilters}
            className="min-h-[3rem] rounded-2xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Clear filters
          </button>
        </div>
      </section>

      {/* ================= MINI STATS ================= */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        <MiniStat label="Total" value={stats.total} />
        <MiniStat
          label="Critical"
          value={stats.critical}
          tone={stats.critical > 0 ? "danger" : "default"}
        />
        <MiniStat
          label="High"
          value={stats.high}
          tone={stats.high > 0 ? "danger" : "default"}
        />
        <MiniStat
          label="Active"
          value={stats.active}
          tone={stats.active > 0 ? "danger" : "default"}
        />
        <MiniStat label="Resolved" value={stats.resolved} />
      </section>

      {/* ================= BODY ================= */}
      <section className="grid gap-6 xl:grid-cols-2">
        {/* LEFT LIST */}
        <div className="rounded-[1.5rem] border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-gray-200 p-5">
            <div>
              <h3 className="text-sm font-bold text-gray-950">
                {view === "raw" ? "Raw error feed" : "Grouped error feed"}
              </h3>

              <p className="mt-1 text-xs text-gray-500">
                {view === "raw"
                  ? `${initialErrors.length} individual error records`
                  : `${groupedErrors.length} grouped error signatures`}
              </p>
            </div>
          </div>

          <div className="max-h-[46rem] overflow-y-auto">
            {initialErrors.length === 0 ? (
              <EmptyList />
            ) : view === "raw" ? (
              <div className="divide-y divide-gray-200">
                {initialErrors.map((error) => (
                  <RawErrorRow
                    key={error.id}
                    error={error}
                    selected={selected?.id === error.id}
                    onSelect={() => setSelected(error)}
                  />
                ))}
              </div>
            ) : (
              <div className="divide-y divide-gray-200">
                {groupedErrors.map((error) => (
                  <GroupedErrorRow
                    key={error.key}
                    error={error}
                    selected={selected?.id === error.latestError.id}
                    onSelect={() => setSelected(error.latestError)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* RIGHT DETAILS */}
        <div className="rounded-[1.5rem] border border-gray-200 bg-white p-6 shadow-sm">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
              <p className="text-sm font-semibold text-gray-950">
                Select an error to inspect.
              </p>

              <p className="mt-2 text-sm leading-6 text-gray-500">
                Choose an error from the feed to view route, metadata, user,
                organisation and resolution controls.
              </p>
            </div>
          ) : (
            <ErrorDetails
              error={selected}
              isPending={isPending}
              onResolve={() => handleResolve(selected.id)}
            />
          )}
        </div>
      </section>
    </div>
  );
}

/* ===============================
   ROWS
=============================== */

function RawErrorRow({
  error,
  selected,
  onSelect,
}: {
  error: ErrorLog;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full p-5 text-left transition ${
        selected ? "bg-gray-100" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={error.severity} />
            <StatusBadge resolved={Boolean(error.resolved)} />
          </div>

          <h4 className="mt-3 truncate text-sm font-bold text-gray-950">
            {error.code}
          </h4>

          <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">
            {error.message}
          </p>
        </div>

        <p className="shrink-0 text-xs text-gray-400">
          {formatDate(error.createdAt)}
        </p>
      </div>
    </button>
  );
}

function GroupedErrorRow({
  error,
  selected,
  onSelect,
}: {
  error: GroupedError;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`block w-full p-5 text-left transition ${
        selected ? "bg-gray-100" : "hover:bg-gray-50"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={error.severity} />

            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${getOccurrenceTone(
                error.count,
              )}`}
            >
              {error.count} occurrence{error.count === 1 ? "" : "s"}
            </span>

            {error.activeCount > 0 && (
              <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
                {error.activeCount} active
              </span>
            )}
          </div>

          <h4 className="mt-3 truncate text-sm font-bold text-gray-950">
            {error.code}
          </h4>

          <p className="mt-1 line-clamp-2 text-sm leading-6 text-gray-500">
            {error.message}
          </p>
        </div>

        <p className="shrink-0 text-xs text-gray-400">
          {formatDate(error.latest)}
        </p>
      </div>
    </button>
  );
}

/* ===============================
   DETAILS
=============================== */

function ErrorDetails({
  error,
  isPending,
  onResolve,
}: {
  error: ErrorLog;
  isPending: boolean;
  onResolve: () => void;
}) {
  const metadata = formatMetadata(error.metadata);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-5 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={error.severity} />
            <StatusBadge resolved={Boolean(error.resolved)} />
          </div>

          <h2 className="mt-4 break-words text-xl font-bold text-gray-950">
            {error.code}
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500">
            {error.message}
          </p>
        </div>

        {!error.resolved ? (
          <button
            type="button"
            disabled={isPending}
            onClick={onResolve}
            className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending ? "Resolving..." : "Mark resolved"}
          </button>
        ) : (
          <span className="rounded-full border border-gray-900 bg-gray-950 px-4 py-2 text-sm font-semibold text-white">
            Resolved
          </span>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <InfoCard label="Created" value={formatDate(error.createdAt)} />
        <InfoCard label="Resolved at" value={formatDate(error.resolvedAt ?? null)} />
        <InfoCard label="Route" value={error.route || "N/A"} />
        <InfoCard label="User ID" value={error.userId || "N/A"} />
        <InfoCard
          label="Organisation ID"
          value={error.organisationId || "N/A"}
        />
        <InfoCard label="Error ID" value={error.id} />
      </div>

      <div className="flex flex-wrap gap-3">
        {error.userId && (
          <Link
            href={`/admin/users/${encodeURIComponent(error.userId)}`}
            className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
          >
            Open user
          </Link>
        )}

        {error.organisationId && (
          <Link
            href={`/admin/organisations/${encodeURIComponent(
              error.organisationId,
            )}`}
            className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
          >
            Open organisation
          </Link>
        )}

        <Link
          href={`/admin/audit/entity?entityId=${encodeURIComponent(error.id)}`}
          className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:bg-white"
        >
          Open audit
        </Link>
      </div>

      <details className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <summary className="cursor-pointer text-sm font-bold text-gray-950">
          Metadata
        </summary>

        <pre className="mt-4 max-h-[26rem] overflow-auto whitespace-pre-wrap break-words rounded-2xl border border-gray-200 bg-white p-4 text-xs leading-6 text-gray-700">
          {metadata}
        </pre>
      </details>
    </div>
  );
}

/* ===============================
   SMALL COMPONENTS
=============================== */

function MiniStat({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number | string;
  tone?: "default" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p
        className={`mt-2 text-2xl font-bold ${
          tone === "danger" ? "text-red-700" : "text-gray-950"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function EmptyList() {
  return (
    <div className="p-8 text-center">
      <p className="text-sm font-semibold text-gray-950">No errors found.</p>

      <p className="mt-2 text-sm leading-6 text-gray-500">
        Try changing the filters or checking all resolved errors.
      </p>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 break-words text-sm font-semibold text-gray-950">
        {value}
      </p>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: Severity }) {
  const className =
    severity === "critical" || severity === "high"
      ? "border-red-200 bg-red-50 text-red-700"
      : severity === "medium"
        ? "border-gray-300 bg-gray-100 text-gray-800"
        : "border-gray-200 bg-white text-gray-600";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${className}`}
    >
      {severity}
    </span>
  );
}

function StatusBadge({ resolved }: { resolved: boolean }) {
  if (resolved) {
    return (
      <span className="rounded-full border border-gray-900 bg-gray-950 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
        Resolved
      </span>
    );
  }

  return (
    <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
      Active
    </span>
  );
}

/* ===============================
   HELPERS
=============================== */

function formatDate(dateString: string | null) {
  if (!dateString) return "N/A";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString));
}

function getSeverityRank(severity: Severity) {
  const rank: Record<Severity, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  return rank[severity];
}

function getOccurrenceTone(count: number) {
  if (count > 20) return "border-red-200 bg-red-50 text-red-700";
  if (count > 5) return "border-gray-300 bg-gray-100 text-gray-800";
  return "border-gray-200 bg-white text-gray-600";
}

function formatMetadata(metadata: string | null | undefined) {
  if (!metadata) return "No metadata recorded.";

  try {
    const parsed = JSON.parse(metadata);

    return JSON.stringify(parsed, null, 2);
  } catch {
    return metadata;
  }
}