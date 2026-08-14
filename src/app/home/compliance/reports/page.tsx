import Link from "next/link";
import type { ReactNode } from "react";
import { eq, inArray, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  auditEvents,
  carrierAssignments,
  incidents,
  wasteEvents,
  wasteListings,
} from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

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

/* =========================================================
   PAGE
========================================================= */

export default async function ComplianceReportsPage() {
  const context = await requireOperationalPermission("compliance:reports");

  const organisationId = context.user.organisationId!;

  const assignmentRows = await database.query.carrierAssignments.findMany({
    where: or(
      eq(carrierAssignments.organisationId, organisationId),
      eq(carrierAssignments.assignedByOrganisationId, organisationId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
      eq(carrierAssignments.managerOrganisationId, organisationId),
    ),
    with: {
      listing: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
      bid: true,
    },
    orderBy: (rows, { desc }) => [desc(rows.assignedAt)],
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

  const [incidentRows, eventRows, listingRows, auditRows] = await Promise.all([
    database.query.incidents.findMany({
      where: incidentWhere,
      with: {
        listing: true,
        assignment: true,
        reportedByUser: true,
        reportedByOrganisation: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.wasteEvents.findMany({
      where: or(
        eq(wasteEvents.organisationId, organisationId),
        eq(wasteEvents.actorOrganisationId, organisationId),
        eq(wasteEvents.targetOrganisationId, organisationId),
      ),
      with: {
        listing: true,
        user: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.wasteListings.findMany({
      where: eq(wasteListings.organisationId, organisationId),
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
    }),

    database.query.auditEvents.findMany({
      where: eq(auditEvents.organisationId, organisationId),
      with: {
        user: true,
      },
      orderBy: (rows, { desc }) => [desc(rows.createdAt)],
      limit: 50,
    }),
  ]);

  const unresolvedIncidents = incidentRows.filter(
    (incident) =>
      incident.status === "open" || incident.status === "under_review",
  );

  const completedAssignments = assignmentRows.filter(
    (assignment) => assignment.status === "completed",
  );

  const activeAssignments = assignmentRows.filter((assignment) =>
    ["pending", "accepted", "in_progress"].includes(assignment.status),
  );

  const missingVerificationCodes = assignmentRows.filter(
    (assignment) =>
      !assignment.verificationCode &&
      assignment.status !== "cancelled" &&
      assignment.status !== "rejected",
  );

  const completedWithoutCodeUsed = assignmentRows.filter(
    (assignment) => assignment.status === "completed" && !assignment.codeUsedAt,
  );

  const completedWithOpenIncident = completedAssignments.filter((assignment) =>
    unresolvedIncidents.some(
      (incident) => incident.assignmentId === assignment.id,
    ),
  );

  const assignedListingsWithoutAssignment = listingRows.filter((listing) => {
    const looksAssigned = Boolean(
      listing.status === "assigned" ||
        listing.status === "in_progress" ||
        listing.status === "completed" ||
        listing.assignedAt ||
        listing.assignedCarrierOrganisationId ||
        listing.assignedCarrierDepartmentId ||
        listing.winnerBidId,
    );

    const hasAssignment = assignmentRows.some(
      (assignment) => assignment.listingId === listing.id,
    );

    return looksAssigned && !hasAssignment;
  });

  const eventCounts = eventRows.reduce<Record<string, number>>((acc, event) => {
    acc[event.eventType] = (acc[event.eventType] ?? 0) + 1;
    return acc;
  }, {});

  const complianceWarnings = [
    ...missingVerificationCodes.map((assignment) => ({
      title: "Missing Verification Code",
      description: `Assignment ${assignment.id} does not have a verification code recorded.`,
      severity: "High",
      href: `/home/operations/assignments/${assignment.id}`,
    })),

    ...completedWithoutCodeUsed.map((assignment) => ({
      title: "Completed Without Code Use",
      description: `Assignment ${assignment.id} is completed but codeUsedAt is not recorded.`,
      severity: "Medium",
      href: `/home/operations/assignments/${assignment.id}`,
    })),

    ...completedWithOpenIncident.map((assignment) => ({
      title: "Completed With Unresolved Incident",
      description: `Assignment ${assignment.id} is completed while an incident remains open or under review.`,
      severity: "High",
      href: `/home/operations/assignments/${assignment.id}`,
    })),

    ...assignedListingsWithoutAssignment.map((listing) => ({
      title: "Listing Assignment Mismatch",
      description: `Listing #${listing.id} looks assigned but no carrier assignment row was found.`,
      severity: "High",
      href: `/home/marketplace/browse/${listing.id}`,
    })),
  ];

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

              <h1 className="mt-3 text-3xl font-semibold">
                Compliance Reports
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Audit-ready reporting across assignments, chain-of-custody
                events, incidents, verification codes and listing lifecycle
                consistency.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Pill>Department: {context.departmentLabel}</Pill>
                <Pill>Assignments: {assignmentRows.length}</Pill>
                <Pill>Chain Events: {eventRows.length}</Pill>
                <Pill>Warnings: {complianceWarnings.length}</Pill>
              </div>
            </div>

            <Link
              href="/home/compliance/reports/download?type=summary"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Download Summary CSV
            </Link>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard label="Assignments" value={assignmentRows.length} />
          <MetricCard label="Completed" value={completedAssignments.length} />
          <MetricCard label="Active" value={activeAssignments.length} />
          <MetricCard
            label="Unresolved Incidents"
            value={unresolvedIncidents.length}
          />
          <MetricCard label="Chain Events" value={eventRows.length} />
          <MetricCard label="Audit Events" value={auditRows.length} />
          <MetricCard label="Listings" value={listingRows.length} />
          <MetricCard label="Warnings" value={complianceWarnings.length} />
        </section>

        {/* DOWNLOADS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
          <DownloadCard
            title="Summary"
            description="High-level compliance metrics and readiness checks."
            href="/home/compliance/reports/download?type=summary"
          />

          <DownloadCard
            title="Assignments"
            description="Assignment lifecycle, verification and completion data."
            href="/home/compliance/reports/download?type=assignments"
          />

          <DownloadCard
            title="Incidents"
            description="Investigation, corrective action and closure records."
            href="/home/compliance/reports/download?type=incidents"
          />

          <DownloadCard
            title="Chain of Custody"
            description="Waste movement events from creation to disposal."
            href="/home/compliance/reports/download?type=chain-of-custody"
          />

          <DownloadCard
            title="Audit Trail"
            description="System activity and before/after state records."
            href="/home/compliance/reports/download?type=audit"
          />
        </section>

        {/* WARNINGS */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Compliance Readiness
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                System Checks
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                These checks highlight records that may weaken your audit trail,
                such as missing verification codes, unresolved incidents or
                inconsistent listing/assignment state.
              </p>
            </div>

            <span
              className={`rounded-full px-4 py-2 text-xs font-semibold ${
                complianceWarnings.length === 0
                  ? "bg-green-50 text-green-700"
                  : "bg-orange-50 text-orange-700"
              }`}
            >
              {complianceWarnings.length === 0
                ? "No warnings"
                : `${complianceWarnings.length} warning(s)`}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {complianceWarnings.length === 0 ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
                No major compliance warnings detected from the available system
                data.
              </div>
            ) : (
              complianceWarnings.map((warning, index) => (
                <Link
                  key={`${warning.title}-${index}`}
                  href={warning.href}
                  className="block rounded-2xl border border-orange-200 bg-orange-50 p-5 transition hover:bg-orange-100"
                >
                  <div className="flex items-start justify-between gap-6">
                    <div>
                      <p className="text-sm font-semibold text-orange-900">
                        {warning.title}
                      </p>
                      <p className="mt-1 text-sm leading-6 text-orange-800">
                        {warning.description}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase text-orange-700">
                      {warning.severity}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        {/* CHAIN OF CUSTODY */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Chain of Custody
              </p>

              <h2 className="mt-2 text-2xl font-semibold text-black">
                Waste Event Coverage
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                Waste events provide the chronological movement record across
                creation, assignment, collection, receipt, processing and
                disposal.
              </p>
            </div>

            <Link
              href="/home/compliance/reports/download?type=chain-of-custody"
              className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
            >
              Download Events
            </Link>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
            {Object.keys(eventCounts).length === 0 ? (
              <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-5 text-sm text-black/45 md:col-span-4">
                No waste events have been recorded for this organisation yet.
              </div>
            ) : (
              Object.entries(eventCounts).map(([eventType, count]) => (
                <div
                  key={eventType}
                  className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5"
                >
                  <p className="text-xs uppercase tracking-widest text-black/35">
                    {formatLabel(eventType)}
                  </p>
                  <p className="mt-3 text-3xl font-semibold text-black">
                    {count}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        {/* RECENT ACTIVITY */}
        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Panel title="Recent Assignments" subtitle="Lifecycle Snapshot">
            {assignmentRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-5 text-sm text-black/45">
                No assignments found.
              </p>
            ) : (
              assignmentRows.slice(0, 8).map((assignment) => (
                <Link
                  key={assignment.id}
                  href={`/home/operations/assignments/${assignment.id}`}
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:border-orange-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-black">
                        {assignment.listing?.name ??
                          `Listing #${assignment.listingId}`}
                      </p>

                      <p className="mt-1 text-xs text-black/45">
                        Assigned {formatDate(assignment.assignedAt)}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/50">
                      {formatLabel(assignment.status)}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Panel>

          <Panel title="Recent Audit Events" subtitle="System Activity">
            {auditRows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-5 text-sm text-black/45">
                No audit events found.
              </p>
            ) : (
              auditRows.slice(0, 8).map((event) => (
                <Link
                  key={event.id}
                  href="/home/compliance/audit"
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:border-orange-300"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-black">
                        {formatLabel(event.action)}
                      </p>

                      <p className="mt-1 text-xs text-black/45">
                        {formatLabel(event.entityType)} ·{" "}
                        {formatDate(event.createdAt)}
                      </p>
                    </div>

                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/50">
                      {event.user?.name ?? "System"}
                    </span>
                  </div>
                </Link>
              ))
            )}
          </Panel>
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

function DownloadCard({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md"
    >
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        CSV Export
      </p>

      <h2 className="mt-3 text-lg font-semibold text-black">{title}</h2>

      <p className="mt-2 min-h-[3rem] text-sm leading-6 text-black/50">
        {description}
      </p>

      <span className="mt-5 inline-flex rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition group-hover:bg-orange-500 group-hover:text-black">
        Download →
      </span>
    </Link>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {title}
      </p>

      <h2 className="mt-2 text-xl font-semibold text-black">{subtitle}</h2>

      <div className="mt-6 space-y-3">{children}</div>
    </div>
  );
}