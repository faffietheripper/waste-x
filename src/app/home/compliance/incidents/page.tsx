import Link from "next/link";
import type { ReactNode } from "react";
import { eq, inArray, or } from "drizzle-orm";

import { database } from "@/db/database";
import { carrierAssignments, incidents } from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { hasOperationalPermissionForOrganisation } from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type IncidentStatus =
  | "all"
  | "open"
  | "under_review"
  | "resolved"
  | "rejected";

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

function getStatusClass(status: string | null | undefined) {
  switch (status) {
    case "open":
      return "border-red-300 bg-red-50 text-red-700";
    case "under_review":
      return "border-orange-300 bg-orange-50 text-orange-700";
    case "resolved":
      return "border-green-300 bg-green-50 text-green-700";
    case "rejected":
      return "border-gray-300 bg-gray-100 text-gray-700";
    default:
      return "border-black/10 bg-[#f7f3ed] text-black/50";
  }
}

/* =========================================================
   PAGE
========================================================= */

type ComplianceIncidentsPageProps = {
  searchParams?: Promise<{ status?: string }> | { status?: string };
};

export default async function ComplianceIncidentsPage({
  searchParams,
}: ComplianceIncidentsPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};

  const context = await requireOperationalPermission("incident:view");

  const organisationId = context.user.organisationId!;

  const canResolveIncidents = hasOperationalPermissionForOrganisation({
    capabilities: context.capabilities,
    departmentType: context.storedDepartmentType ?? context.departmentType,
    permission: "incident:resolve",
    operatingMode: context.organisation?.operatingMode ?? null,
  });

  const assignmentRows = await database.query.carrierAssignments.findMany({
    where: or(
      eq(carrierAssignments.organisationId, organisationId),
      eq(carrierAssignments.assignedByOrganisationId, organisationId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
      eq(carrierAssignments.managerOrganisationId, organisationId),
    ),
    columns: {
      id: true,
    },
  });

  const assignmentIds = assignmentRows.map((assignment) => assignment.id);

  const incidentWhere =
    assignmentIds.length > 0
      ? or(
          eq(incidents.organisationId, organisationId),
          eq(incidents.reportedByOrganisationId, organisationId),
          inArray(incidents.assignmentId, assignmentIds),
        )
      : or(
          eq(incidents.organisationId, organisationId),
          eq(incidents.reportedByOrganisationId, organisationId),
        );

  const incidentRows = await database.query.incidents.findMany({
    where: incidentWhere,
    with: {
      listing: true,
      assignment: {
        with: {
          carrierOrganisation: true,
          managerOrganisation: true,
          assignedByOrganisation: true,
        },
      },
      reportedByUser: true,
      reportedByOrganisation: true,
    },
    orderBy: (rows, { desc }) => [desc(rows.createdAt)],
  });

  const selectedStatus = (resolvedSearchParams.status || "all") as IncidentStatus;

  const filteredIncidents =
    selectedStatus === "all"
      ? incidentRows
      : incidentRows.filter((incident) => incident.status === selectedStatus);

  const metrics = {
    total: incidentRows.length,
    open: incidentRows.filter((incident) => incident.status === "open").length,
    underReview: incidentRows.filter(
      (incident) => incident.status === "under_review",
    ).length,
    resolved: incidentRows.filter((incident) => incident.status === "resolved")
      .length,
    rejected: incidentRows.filter((incident) => incident.status === "rejected")
      .length,
  };

  const unresolvedCount = metrics.open + metrics.underReview;

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

              <h1 className="mt-3 text-3xl font-semibold">Incident Review</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Review reported incidents, investigation findings, corrective
                actions, preventative actions and closure evidence. Incidents
                remain part of the compliance record and can affect assignment
                completion.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Pill>Department: {context.departmentLabel}</Pill>
                <Pill>Unresolved: {unresolvedCount}</Pill>
                <Pill>
                  Resolve Access: {canResolveIncidents ? "Yes" : "No"}
                </Pill>
              </div>
            </div>

            <Link
              href="/home/compliance/reports/download?type=incidents"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Download Incident CSV
            </Link>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-5">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard label="Open" value={metrics.open} />
          <MetricCard label="Under Review" value={metrics.underReview} />
          <MetricCard label="Resolved" value={metrics.resolved} />
          <MetricCard label="Rejected" value={metrics.rejected} />
        </section>

        {/* FILTERS */}
        <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <FilterLink
              href="/home/compliance/incidents"
              active={selectedStatus === "all"}
            >
              All
            </FilterLink>

            <FilterLink
              href="/home/compliance/incidents?status=open"
              active={selectedStatus === "open"}
            >
              Open
            </FilterLink>

            <FilterLink
              href="/home/compliance/incidents?status=under_review"
              active={selectedStatus === "under_review"}
            >
              Under Review
            </FilterLink>

            <FilterLink
              href="/home/compliance/incidents?status=resolved"
              active={selectedStatus === "resolved"}
            >
              Resolved
            </FilterLink>

            <FilterLink
              href="/home/compliance/incidents?status=rejected"
              active={selectedStatus === "rejected"}
            >
              Rejected
            </FilterLink>
          </div>
        </section>

        {/* INCIDENTS */}
        <section className="space-y-5">
          {filteredIncidents.length === 0 ? (
            <EmptyState
              title="No incidents found"
              description="No incident records match the selected status filter."
            />
          ) : (
            filteredIncidents.map((incident) => (
              <article
                key={incident.id}
                className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
                          incident.status,
                        )}`}
                      >
                        {formatLabel(incident.status)}
                      </span>

                      <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-xs font-semibold text-black/50">
                        {formatLabel(incident.type)}
                      </span>

                      <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-xs font-semibold text-black/40">
                        Reported {formatDate(incident.createdAt)}
                      </span>
                    </div>

                    <h2 className="mt-4 text-xl font-semibold text-black">
                      {incident.summary}
                    </h2>

                    <p className="mt-2 text-sm text-black/50">
                      Listing:{" "}
                      <span className="font-medium text-black">
                        {incident.listing?.name ?? `#${incident.listingId}`}
                      </span>
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-3">
                    <Link
                      href={`/home/marketplace/browse/${incident.listingId}`}
                      className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                    >
                      View Listing →
                    </Link>

                    <Link
                      href={`/home/operations/assignments/${incident.assignmentId}`}
                      className="rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
                    >
                      Review Assignment →
                    </Link>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
                  <DetailBlock
                    label="Incident Date"
                    value={formatDate(incident.incidentDate)}
                  />

                  <DetailBlock
                    label="Incident Location"
                    value={incident.incidentLocation ?? "Not recorded"}
                  />

                  <DetailBlock
                    label="Reported By"
                    value={incident.reportedByUser?.name ?? "Unknown"}
                  />

                  <DetailBlock
                    label="Reported Organisation"
                    value={
                      incident.reportedByOrganisation?.teamName ?? "Unknown"
                    }
                  />

                  <DetailBlock
                    label="Responsible Person"
                    value={incident.responsiblePerson ?? "Not assigned"}
                  />

                  <DetailBlock
                    label="Date Closed"
                    value={formatDate(incident.dateClosed)}
                  />
                </div>

                <div className="mt-6 grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <TextPanel
                    label="Immediate Action"
                    value={incident.immediateAction}
                  />

                  <TextPanel
                    label="Investigation Findings"
                    value={incident.investigationFindings}
                  />

                  <TextPanel
                    label="Corrective Actions"
                    value={incident.correctiveActions}
                  />

                  <TextPanel
                    label="Preventative Measures"
                    value={incident.preventativeMeasures}
                  />

                  <TextPanel
                    label="Compliance Review"
                    value={incident.complianceReview}
                  />

                  <TextPanel
                    label="Resolution"
                    value={
                      incident.resolvedAt
                        ? `Resolved at ${formatDate(
                            incident.resolvedAt,
                          )} by ${incident.resolvedByUserId ?? "Unknown"}`
                        : "Not resolved yet."
                    }
                  />
                </div>

                <div className="mt-6 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
                  <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                    Assignment Context
                  </p>

                  <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-4">
                    <DetailBlock
                      label="Assignment Status"
                      value={formatLabel(incident.assignment?.status)}
                    />

                    <DetailBlock
                      label="Generator"
                      value={
                        incident.assignment?.assignedByOrganisation?.teamName ??
                        "Unknown"
                      }
                    />

                    <DetailBlock
                      label="Manager"
                      value={
                        incident.assignment?.managerOrganisation?.teamName ??
                        "Not assigned"
                      }
                    />

                    <DetailBlock
                      label="Carrier"
                      value={
                        incident.assignment?.carrierOrganisation?.teamName ??
                        "Not assigned"
                      }
                    />

                    <DetailBlock
                      label="Verification Code Generated"
                      value={
                        incident.assignment?.codeGeneratedAt
                          ? "Yes"
                          : "Not recorded"
                      }
                    />

                    <DetailBlock
                      label="Verification Code Used"
                      value={
                        incident.assignment?.codeUsedAt
                          ? formatDate(incident.assignment.codeUsedAt)
                          : "Not used"
                      }
                    />

                    <DetailBlock
                      label="Collected At"
                      value={formatDate(incident.assignment?.collectedAt)}
                    />

                    <DetailBlock
                      label="Completed At"
                      value={formatDate(incident.assignment?.completedAt)}
                    />
                  </div>
                </div>
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

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p className="mt-2 break-words text-sm font-medium text-black">{value}</p>
    </div>
  );
}

function TextPanel({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-[0.25em] text-black/35">
        {label}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/60">
        {value || "Not recorded."}
      </p>
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