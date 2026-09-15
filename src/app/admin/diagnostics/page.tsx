import Link from "next/link";

import {
  AdminMetric,
  AdminPageHeader,
  AdminPanel,
  AdminStatusPill,
  TableCell,
  TableHead,
} from "@/components/admin/AdminUi";
import {
  type PlatformDiagnosticOutcome,
  type PlatformDiagnosticSurface,
} from "@/db/client-sync-schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getAdminDiagnostics } from "@/modules/admin/core/getAdminDiagnosticsData";

type PageProps = {
  searchParams?: {
    search?: string;
    organisationId?: string;
    userId?: string;
    deviceId?: string;
    surface?: string;
    outcome?: string;
  };
};

const surfaces = ["WEB", "DESKTOP", "MOBILE", "SERVER"] as const;
const outcomes = [
  "FAILED",
  "RETRYING",
  "REJECTED",
  "CONFLICT",
  "RECOVERED",
  "RESOLVED",
] as const;

function surface(value?: string): PlatformDiagnosticSurface | undefined {
  return surfaces.includes(value as (typeof surfaces)[number])
    ? (value as PlatformDiagnosticSurface)
    : undefined;
}

function outcome(value?: string): PlatformDiagnosticOutcome | undefined {
  return outcomes.includes(value as (typeof outcomes)[number])
    ? (value as PlatformDiagnosticOutcome)
    : undefined;
}

export default async function AdminDiagnosticsPage({
  searchParams,
}: PageProps) {
  await requirePlatformAdmin();

  const filters = {
    search: searchParams?.search?.trim() || undefined,
    organisationId: searchParams?.organisationId?.trim() || undefined,
    userId: searchParams?.userId?.trim() || undefined,
    deviceId: searchParams?.deviceId?.trim() || undefined,
    surface: surface(searchParams?.surface),
    outcome: outcome(searchParams?.outcome),
  };

  const result = await getAdminDiagnostics(filters);
  const rows = result.rows;

  const unresolved = rows.filter(
    (row) =>
      !row.resolvedAt &&
      ["FAILED", "RETRYING", "REJECTED", "CONFLICT"].includes(row.outcome),
  ).length;
  const critical = rows.filter((row) => row.severity === "critical").length;
  const clients = new Set(rows.map((row) => row.surface)).size;

  return (
    <div className="space-y-7">
      <AdminPageHeader
        eyebrow="Operational Diagnostics"
        title="Diagnostics"
        description="Sanitised cross-surface problem context for Web, Desktop, Mobile and server operations. This view contains support metadata only — never raw sync payloads, auth secrets, local databases or customer file contents."
        actions={
          <>
            <Link
              href="/admin/errors"
              className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-bold text-white hover:border-red-500"
            >
              System Health
            </Link>
            <Link
              href="/admin/devices"
              className="rounded-full bg-red-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-red-700"
            >
              Devices
            </Link>
          </>
        }
      />

      {!result.storageReady ? (
        <div className="rounded-[1.5rem] border border-amber-300 bg-amber-50 p-5 text-sm font-semibold leading-6 text-amber-900">
          Diagnostics storage is not available in this environment yet. Patch C
          source is present, but the canonical diagnostics migration still needs
          to be applied before events can be queried here. The rest of Platform
          Admin remains available.
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminMetric label="Events" value={rows.length} helper="Current filtered view" />
        <AdminMetric
          label="Needs attention"
          value={unresolved}
          helper="Failed / retrying / rejected / conflict"
          danger={unresolved > 0}
        />
        <AdminMetric
          label="Critical"
          value={critical}
          helper="Critical severity events"
          danger={critical > 0}
        />
        <AdminMetric label="Surfaces" value={clients} helper="Surfaces represented in result" />
      </section>

      <AdminPanel
        eyebrow="Filters"
        title="Correlate a problem"
        description="Search safe message/code/correlation/entity context or filter by client surface and outcome."
      >
        <form className="grid gap-3 xl:grid-cols-[1fr_180px_190px_auto_auto]">
          <input
            name="search"
            defaultValue={filters.search ?? ""}
            placeholder="Code, operation, correlation, entity..."
            className="min-h-[3rem] rounded-2xl border border-black/15 px-4 text-sm font-semibold outline-none focus:border-red-500"
          />

          <select
            name="surface"
            defaultValue={filters.surface ?? ""}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold"
          >
            <option value="">All surfaces</option>
            {surfaces.map((value) => (
              <option key={value} value={value}>
                {formatLabel(value)}
              </option>
            ))}
          </select>

          <select
            name="outcome"
            defaultValue={filters.outcome ?? ""}
            className="min-h-[3rem] rounded-2xl border border-black/15 bg-white px-4 text-sm font-semibold"
          >
            <option value="">All outcomes</option>
            {outcomes.map((value) => (
              <option key={value} value={value}>
                {formatLabel(value)}
              </option>
            ))}
          </select>

          <button className="rounded-2xl bg-black px-5 py-3 text-sm font-black text-white hover:bg-red-600">
            Apply
          </button>

          <Link
            href="/admin/diagnostics"
            className="rounded-2xl border border-black/10 px-5 py-3 text-center text-sm font-black text-black"
          >
            Clear
          </Link>
        </form>

        {filters.organisationId || filters.userId || filters.deviceId ? (
          <p className="mt-3 text-xs font-semibold text-black/40">
            This view also has a direct Organisation/User/Device correlation
            filter supplied by another Admin page.
          </p>
        ) : null}
      </AdminPanel>

      <AdminPanel
        eyebrow="Sanitised Event Stream"
        title="Problem context"
        description="Only the Patch C safe diagnostic envelope is shown. Existing generic server errors remain in System Health."
      >
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-black/15 p-7 text-sm font-semibold text-black/40">
            No diagnostic events match this view.
          </div>
        ) : (
          <div className="space-y-4">
            {rows.map((row) => (
              <article
                key={row.id}
                className="rounded-2xl border border-black/10 p-5"
              >
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminStatusPill
                        label={formatLabel(row.severity)}
                        tone={severityTone(row.severity)}
                      />
                      <AdminStatusPill
                        label={formatLabel(row.outcome)}
                        tone={outcomeTone(row.outcome)}
                      />
                      <AdminStatusPill
                        label={formatLabel(row.surface)}
                        tone="dark"
                      />
                      <span className="font-mono text-xs font-black text-black/55">
                        {row.code}
                      </span>
                    </div>

                    <p className="mt-4 text-sm font-black text-black">
                      {row.safeMessage}
                    </p>
                    <p className="mt-2 text-xs font-semibold text-black/40">
                      {row.operation}
                      {row.clientVersion ? ` · v${row.clientVersion}` : ""}
                      {row.route ? ` · ${row.route}` : ""}
                    </p>

                    <div className="mt-4 grid gap-2 text-xs md:grid-cols-2 xl:grid-cols-4">
                      <Meta
                        label="Organisation"
                        value={row.organisationName ?? row.organisationId ?? "—"}
                        href={
                          row.organisationId
                            ? `/admin/organisations/${row.organisationId}`
                            : undefined
                        }
                      />
                      <Meta
                        label="User"
                        value={row.userName ?? row.userEmail ?? row.userId ?? "—"}
                        href={row.userId ? `/admin/users/${row.userId}` : undefined}
                      />
                      <Meta
                        label="Device"
                        value={row.deviceName ?? row.deviceId ?? "—"}
                        href={
                          row.deviceId
                            ? `/admin/devices/${row.deviceId}`
                            : undefined
                        }
                      />
                      <Meta
                        label="Entity"
                        value={
                          row.entityType && row.entityId
                            ? `${row.entityType} · ${row.entityId}`
                            : "—"
                        }
                        href={entityHref(row.entityType, row.entityId)}
                      />
                    </div>

                    {Object.keys(row.safeContext ?? {}).length > 0 ? (
                      <div className="mt-4 rounded-xl bg-black/[0.03] p-3 font-mono text-[11px] leading-5 text-black/55">
                        {Object.entries(row.safeContext)
                          .map(([key, value]) => `${key}=${String(value)}`)
                          .join(" · ")}
                      </div>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-right">
                    <p className="text-xs font-black text-black">
                      {formatDateTime(row.occurredAt)}
                    </p>
                    <p className="mt-2 font-mono text-[10px] text-black/30">
                      {row.correlationId}
                    </p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminPanel>
    </div>
  );
}

function Meta({
  label,
  value,
  href,
}: {
  label: string;
  value: string;
  href?: string;
}) {
  const content = (
    <>
      <span className="block font-black uppercase tracking-[0.12em] text-black/30">
        {label}
      </span>
      <span className="mt-1 block break-all font-bold text-black/65">
        {value}
      </span>
    </>
  );

  return href ? (
    <Link
      href={href}
      className="rounded-xl border border-black/10 p-3 hover:border-red-300 hover:bg-red-50"
    >
      {content}
    </Link>
  ) : (
    <div className="rounded-xl border border-black/10 p-3">{content}</div>
  );
}

function entityHref(type: string | null, id: string | null) {
  if (!type || !id) return undefined;
  if (type === "job_load") return `/admin/loads/${id}`;
  if (type === "job") return `/admin/jobs/${id}`;
  return undefined;
}

function severityTone(value: string) {
  if (value === "critical" || value === "high") return "danger" as const;
  if (value === "medium") return "warning" as const;
  return "neutral" as const;
}

function outcomeTone(value: string) {
  if (value === "RESOLVED" || value === "RECOVERED") return "success" as const;
  if (value === "RETRYING" || value === "CONFLICT") return "warning" as const;
  return "danger" as const;
}

function formatLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
