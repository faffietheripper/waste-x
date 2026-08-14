import Link from "next/link";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { auditEvents } from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   TYPES
========================================================= */

type AuditSearchParams = {
  entity?: string;
  action?: string;
};

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not recorded";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function safePreview(value: string | null | undefined) {
  if (!value) return "No state captured.";

  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

function truncate(value: string, max = 600) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}...`;
}

/* =========================================================
   PAGE
========================================================= */

export default async function ComplianceAuditPage({
  searchParams,
}: {
  searchParams: AuditSearchParams;
}) {
  const context = await requireOperationalPermission("compliance:audit");

  const organisationId = context.user.organisationId!;

  const entityFilter = searchParams.entity || "all";
  const actionFilter = searchParams.action || "all";

  const auditRows = await database.query.auditEvents.findMany({
    where: eq(auditEvents.organisationId, organisationId),
    with: {
      user: true,
    },
    orderBy: (events, { desc }) => [desc(events.createdAt)],
    limit: 250,
  });

  const filteredRows = auditRows.filter((event) => {
    const entityMatches =
      entityFilter === "all" || event.entityType === entityFilter;

    const actionMatches =
      actionFilter === "all" || event.action === actionFilter;

    return entityMatches && actionMatches;
  });

  const uniqueEntities = Array.from(
    new Set(auditRows.map((event) => event.entityType).filter(Boolean)),
  );

  const uniqueActions = Array.from(
    new Set(auditRows.map((event) => event.action).filter(Boolean)),
  );

  const now = new Date();

  const last24Hours = auditRows.filter((event) => {
    if (!event.createdAt) return false;

    const diff = now.getTime() - new Date(event.createdAt).getTime();
    return diff <= 24 * 60 * 60 * 1000;
  }).length;

  const uniqueUsers = new Set(
    auditRows.map((event) => event.userId).filter(Boolean),
  ).size;

  const stateChanges = auditRows.filter(
    (event) => event.previousState || event.newState,
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Compliance
              </p>

              <h1 className="mt-3 text-3xl font-semibold">Audit Trail</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Review system activity, operational changes and captured before
                / after states. This page supports internal audit checks across
                your organisation.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Pill>Department: {context.departmentLabel}</Pill>
                <Pill>Showing: {filteredRows.length}</Pill>
                <Pill>Permission: compliance:audit</Pill>
              </div>
            </div>

            <Link
              href="/home/compliance/reports/download?type=audit"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Download Audit CSV
            </Link>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard label="Total Events" value={auditRows.length} />
          <MetricCard label="Last 24 Hours" value={last24Hours} />
          <MetricCard label="Unique Users" value={uniqueUsers} />
          <MetricCard label="State Changes" value={stateChanges} />
        </section>

        {/* FILTERS */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                Entity Filter
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <FilterLink
                  href="/home/compliance/audit"
                  active={entityFilter === "all"}
                >
                  All Entities
                </FilterLink>

                {uniqueEntities.map((entity) => (
                  <FilterLink
                    key={entity}
                    href={`/home/compliance/audit?entity=${entity}${
                      actionFilter !== "all" ? `&action=${actionFilter}` : ""
                    }`}
                    active={entityFilter === entity}
                  >
                    {formatLabel(entity)}
                  </FilterLink>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                Action Filter
              </p>

              <div className="mt-4 flex flex-wrap gap-3">
                <FilterLink
                  href={`/home/compliance/audit${
                    entityFilter !== "all" ? `?entity=${entityFilter}` : ""
                  }`}
                  active={actionFilter === "all"}
                >
                  All Actions
                </FilterLink>

                {uniqueActions.map((action) => (
                  <FilterLink
                    key={action}
                    href={`/home/compliance/audit?action=${action}${
                      entityFilter !== "all" ? `&entity=${entityFilter}` : ""
                    }`}
                    active={actionFilter === action}
                  >
                    {formatLabel(action)}
                  </FilterLink>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* AUDIT EVENTS */}
        <section className="space-y-4">
          {filteredRows.length === 0 ? (
            <EmptyState
              title="No audit events found"
              description="No audit records match the selected filters."
            />
          ) : (
            filteredRows.map((event) => (
              <article
                key={event.id}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">
                    {formatLabel(event.action)}
                  </span>

                  <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-xs font-semibold text-black/50">
                    {formatLabel(event.entityType)}
                  </span>

                  <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/40">
                    {formatDate(event.createdAt)}
                  </span>
                </div>

                <h2 className="mt-4 text-xl font-semibold text-black">
                  {formatLabel(event.entityType)} activity
                </h2>

                <p className="mt-2 text-sm text-black/50">
                  Entity ID:{" "}
                  <span className="font-mono text-xs">{event.entityId}</span>
                </p>

                <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <DetailBlock
                    label="Performed By"
                    value={event.user?.name ?? event.userId ?? "System"}
                  />

                  <DetailBlock
                    label="IP Address"
                    value={event.ipAddress ?? "Not captured"}
                  />

                  <DetailBlock label="Audit ID" value={event.id} mono />
                </div>

                {(event.previousState || event.newState) && (
                  <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <StatePanel
                      label="Previous State"
                      value={truncate(safePreview(event.previousState))}
                    />

                    <StatePanel
                      label="New State"
                      value={truncate(safePreview(event.newState))}
                    />
                  </div>
                )}
              </article>
            ))
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-black text-orange-400"
          : "bg-[#fbfaf7] text-black/55 hover:bg-orange-100 hover:text-orange-700"
      }`}
    >
      {children}
    </Link>
  );
}

function DetailBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p
        className={`mt-2 text-sm font-medium text-black ${
          mono ? "break-all font-mono text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function StatePanel({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black p-4 text-xs leading-5 text-orange-300">
        {value}
      </pre>
    </div>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {description}
      </p>
    </section>
  );
}