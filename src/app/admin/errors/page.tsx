import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

import { getErrorsAction, resolveErrorAction } from "./actions";

type Severity = "low" | "medium" | "high" | "critical";
type Status = "active" | "resolved" | "all";

type PageProps = {
  searchParams?: {
    severity?: string;
    code?: string;
    status?: string;
  };
};

export default async function AdminSystemHealthPage({
  searchParams,
}: PageProps) {
  await requirePlatformAdmin();

  const severity = normaliseSeverity(searchParams?.severity);
  const status = normaliseStatus(searchParams?.status);
  const code = normaliseCode(searchParams?.code);

  const errors = await getErrorsAction({
    severity,
    code,
    status,
  });

  const unresolved = errors.filter((error) => !error.resolved).length;

  const critical = errors.filter(
    (error) => error.severity === "critical" && !error.resolved,
  ).length;

  const external = errors.filter(
    (error) => error.layer === "external" && !error.resolved,
  ).length;

  const auth = errors.filter(
    (error) => error.layer === "auth" && !error.resolved,
  ).length;

  return (
    <div className="space-y-7">
      {/* =====================================================
          HEADER
      ===================================================== */}

      <AdminPageHeader
        eyebrow="Platform Operations"
        title="System Health"
        description="Application, database, authentication, validation and external-service errors. Digital Waste Tracking and PAT remain protected and unchanged."
        actions={
          <>
            <Link
              href="/admin/alerts"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white transition hover:border-red-500"
            >
              Alerts
            </Link>

            <Link
              href="/admin/digital-waste-tracking"
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
            >
              DWT Control
            </Link>
          </>
        }
      />

      {/* =====================================================
          METRICS
      ===================================================== */}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric
          label="Unresolved"
          value={unresolved}
          helper="Current filtered result set"
          danger={unresolved > 0}
        />

        <AdminMetric
          label="Critical"
          value={critical}
          helper="Urgent platform errors"
          danger={critical > 0}
        />

        <AdminMetric
          label="External"
          value={external}
          helper="External service failures"
          danger={external > 0}
        />

        <AdminMetric
          label="Authentication"
          value={auth}
          helper="Authentication-layer errors"
          danger={auth > 0}
        />
      </section>

      {/* =====================================================
          FILTERS
      ===================================================== */}

      <AdminPanel
        eyebrow="Filters"
        title="Narrow the error register"
        description="Filter by status, severity or exact error code."
      >
        <form className="grid gap-3 lg:grid-cols-[1fr_220px_220px_auto_auto]">
          <input
            name="code"
            defaultValue={code ?? ""}
            placeholder="Exact error code..."
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-red-500"
          />

          <select
            name="severity"
            defaultValue={severity ?? ""}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-red-500"
          >
            <option value="">All severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            name="status"
            defaultValue={status}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold text-black outline-none focus:border-red-500"
          >
            <option value="active">Active</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>

          <button
            type="submit"
            className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white transition hover:bg-red-600"
          >
            Apply
          </button>

          <Link
            href="/admin/errors"
            className="rounded-2xl border border-black/10 px-5 py-3 text-center text-sm font-black text-black transition hover:border-red-300 hover:text-red-600"
          >
            Clear
          </Link>
        </form>
      </AdminPanel>

      {/* =====================================================
          ERROR REGISTER
      ===================================================== */}

      <AdminPanel
        eyebrow="Error Register"
        title="Investigate and resolve"
        description="Latest 100 matching error records. Resolve only after the underlying issue has been reviewed."
      >
        {errors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No errors match this view.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-black/10">
            <div className="overflow-x-auto">
              <table className="min-w-[1250px] w-full divide-y divide-black/10 text-sm">
                <thead>
                  <tr>
                    <TableHead>Severity</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Layer</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Route</TableHead>
                    <TableHead>Created</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Action</TableHead>
                  </tr>
                </thead>

                <tbody className="divide-y divide-black/10 bg-white">
                  {errors.map((error) => (
                    <tr
                      key={error.id}
                      className="align-top transition hover:bg-red-50/30"
                    >
                      {/* SEVERITY */}
                      <TableCell>
                        <AdminStatusPill
                          label={formatLabel(error.severity)}
                          tone={
                            error.severity === "critical" ||
                            error.severity === "high"
                              ? "danger"
                              : "neutral"
                          }
                        />
                      </TableCell>

                      {/* CODE */}
                      <TableCell>
                        <span className="font-black text-black">
                          {error.code}
                        </span>
                      </TableCell>

                      {/* LAYER */}
                      <TableCell>{formatLabel(error.layer)}</TableCell>

                      {/* MESSAGE */}
                      <TableCell>
                        <div className="max-w-md whitespace-normal">
                          <p className="font-semibold text-black">
                            {error.message}
                          </p>

                          {error.method ? (
                            <p className="mt-1 text-xs text-black/35">
                              {error.method}
                            </p>
                          ) : null}
                        </div>
                      </TableCell>

                      {/* ROUTE */}
                      <TableCell>
                        <span className="font-mono text-xs text-black/55">
                          {error.route ?? "—"}
                        </span>
                      </TableCell>

                      {/* CREATED */}
                      <TableCell>{formatDate(error.createdAt)}</TableCell>

                      {/* STATUS */}
                      <TableCell>
                        <AdminStatusPill
                          label={error.resolved ? "Resolved" : "Active"}
                          tone={error.resolved ? "neutral" : "danger"}
                        />
                      </TableCell>

                      {/* ACTION */}
                      <TableCell>
                        {!error.resolved ? (
                          <form
                            action={resolveErrorAction.bind(null, error.id)}
                          >
                            <button
                              type="submit"
                              className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-600"
                            >
                              Mark resolved
                            </button>
                          </form>
                        ) : (
                          <span className="text-xs font-semibold text-black/30">
                            Done
                          </span>
                        )}
                      </TableCell>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function normaliseSeverity(value?: string): Severity | undefined {
  return ["low", "medium", "high", "critical"].includes(value ?? "")
    ? (value as Severity)
    : undefined;
}

function normaliseStatus(value?: string): Status {
  return ["resolved", "all"].includes(value ?? "")
    ? (value as Status)
    : "active";
}

function normaliseCode(value?: string) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : undefined;
}

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";

  const date = new Date(value);

  if (!Number.isFinite(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}