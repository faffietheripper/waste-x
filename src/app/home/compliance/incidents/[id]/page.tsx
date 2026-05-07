import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  incidents,
  carrierAssignments,
  wasteListings,
  organisations,
  users,
} from "@/db/schema";

import IncidentResolutionForm from "@/components/app/CarrierHub/IncidentResolutionForm";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance" | null;

type IncidentStatus = "open" | "under_review" | "resolved" | "rejected";

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getIncidentStatusClass(status: string | null | undefined) {
  switch (status) {
    case "resolved":
      return "border-green-300 bg-green-100 text-green-700";

    case "under_review":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "rejected":
      return "border-gray-300 bg-gray-100 text-gray-700";

    case "open":
      return "border-red-300 bg-red-100 text-red-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getAssignmentStatusClass(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "accepted":
      return "border-green-300 bg-green-100 text-green-700";

    case "in_progress":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "completed":
      return "border-black bg-black text-white";

    case "rejected":
    case "cancelled":
      return "border-red-300 bg-red-100 text-red-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getIncidentWorkflowMessage({
  status,
  departmentType,
}: {
  status: string;
  departmentType: DepartmentType;
}) {
  if (status === "open") {
    if (departmentType === "compliance") {
      return "This incident has been reported and needs compliance review. Investigation, corrective action and preventative measures should be recorded before resolution.";
    }

    return "This incident has been reported and is waiting for review.";
  }

  if (status === "under_review") {
    return "This incident is under review. Resolution should include findings, corrective actions, preventative measures and a compliance review note.";
  }

  if (status === "resolved") {
    return "This incident has been resolved and is retained as part of the assignment compliance record.";
  }

  if (status === "rejected") {
    return "This incident was reviewed and rejected. The decision remains part of the audit trail.";
  }

  return "Incident record available for review.";
}

/* =========================================================
   PAGE
========================================================= */

export default async function IncidentDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  if (!session.user.organisationId) {
    redirect("/home");
  }

  const organisationId = session.user.organisationId;
  const departmentType =
    (session.user.activeDepartment?.type as DepartmentType) ?? null;

  const carrierOrg = alias(organisations, "carrierOrg");
  const managerOrg = alias(organisations, "managerOrg");
  const generatorOrg = alias(organisations, "generatorOrg");
  const reporterOrg = alias(organisations, "reporterOrg");
  const assignedByOrg = alias(organisations, "assignedByOrg");
  const reportedByUser = alias(users, "reportedByUser");

  /*
    IMPORTANT:
    Use leftJoin for manager/carrier organisations.

    In the new flow:
    - managerOrganisationId can exist before carrierOrganisationId
    - carrierOrganisationId can be null until manager assigns carrier
    - using innerJoin on carrier would hide valid records
  */

  const [incident] = await database
    .select({
      id: incidents.id,
      organisationId: incidents.organisationId,
      assignmentId: incidents.assignmentId,
      listingId: incidents.listingId,

      type: incidents.type,
      summary: incidents.summary,
      status: incidents.status,

      incidentDate: incidents.incidentDate,
      incidentLocation: incidents.incidentLocation,

      immediateAction: incidents.immediateAction,
      investigationFindings: incidents.investigationFindings,
      correctiveActions: incidents.correctiveActions,
      preventativeMeasures: incidents.preventativeMeasures,
      complianceReview: incidents.complianceReview,

      responsiblePerson: incidents.responsiblePerson,
      dateClosed: incidents.dateClosed,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,

      reportedByUserId: incidents.reportedByUserId,
      reportedByOrganisationId: incidents.reportedByOrganisationId,
      resolvedByUserId: incidents.resolvedByUserId,

      assignmentStatus: carrierAssignments.status,
      assignmentMethod: carrierAssignments.assignmentMethod,
      assignmentAssignedAt: carrierAssignments.assignedAt,
      assignmentManagerAcceptedAt: carrierAssignments.managerAcceptedAt,
      assignmentCarrierAssignedAt: carrierAssignments.carrierAssignedAt,
      assignmentRespondedAt: carrierAssignments.respondedAt,
      assignmentCollectedAt: carrierAssignments.collectedAt,
      assignmentCompletedAt: carrierAssignments.completedAt,

      assignmentCarrierOrgId: carrierAssignments.carrierOrganisationId,
      assignmentManagerOrgId: carrierAssignments.managerOrganisationId,
      assignmentGeneratorOrgId: carrierAssignments.organisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,
      listingStatus: wasteListings.status,

      carrierOrgName: carrierOrg.teamName,
      managerOrgName: managerOrg.teamName,
      generatorOrgName: generatorOrg.teamName,
      reporterOrgName: reporterOrg.teamName,
      assignedByOrgName: assignedByOrg.teamName,

      reportedByUserName: reportedByUser.name,
      reportedByUserEmail: reportedByUser.email,
    })
    .from(incidents)
    .leftJoin(
      carrierAssignments,
      eq(incidents.assignmentId, carrierAssignments.id),
    )
    .leftJoin(wasteListings, eq(incidents.listingId, wasteListings.id))
    .leftJoin(
      carrierOrg,
      eq(carrierAssignments.carrierOrganisationId, carrierOrg.id),
    )
    .leftJoin(
      managerOrg,
      eq(carrierAssignments.managerOrganisationId, managerOrg.id),
    )
    .leftJoin(
      generatorOrg,
      eq(carrierAssignments.organisationId, generatorOrg.id),
    )
    .leftJoin(
      assignedByOrg,
      eq(carrierAssignments.assignedByOrganisationId, assignedByOrg.id),
    )
    .leftJoin(
      reporterOrg,
      eq(incidents.reportedByOrganisationId, reporterOrg.id),
    )
    .leftJoin(reportedByUser, eq(incidents.reportedByUserId, reportedByUser.id))
    .where(eq(incidents.id, params.id));

  if (!incident) {
    notFound();
  }

  /*
    Access supports the current assignment model:
    - incident owning organisation
    - reported-by organisation
    - generator-side assignment organisation
    - assigned-by organisation
    - manager organisation
    - carrier organisation
  */

  const canAccess =
    incident.organisationId === organisationId ||
    incident.reportedByOrganisationId === organisationId ||
    incident.assignmentGeneratorOrgId === organisationId ||
    incident.assignedByOrganisationId === organisationId ||
    incident.assignmentManagerOrgId === organisationId ||
    incident.assignmentCarrierOrgId === organisationId;

  if (!canAccess) {
    notFound();
  }

  const isResolved = incident.status === "resolved";

  /*
    Resolution authority:

    For now:
    - compliance can resolve
    - generator can resolve
    - manager can resolve if they are the assigned manager organisation

    Carrier should report incidents, but not close them.
  */

  const isAssignedManager = incident.assignmentManagerOrgId === organisationId;

  const canResolve =
    !isResolved &&
    incident.status !== "rejected" &&
    (departmentType === "compliance" ||
      departmentType === "generator" ||
      (departmentType === "manager" && isAssignedManager));

  const workflowMessage = getIncidentWorkflowMessage({
    status: incident.status,
    departmentType,
  });

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-12 py-32">
      <div className="space-y-8">
        {/* BACK LINKS */}
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/home/compliance/incidents"
            className="text-sm font-medium text-black/45 transition hover:text-orange-600"
          >
            ← Back to incidents
          </Link>

          <span className="text-black/20">/</span>

          <Link
            href={`/home/operations/assignments/${incident.assignmentId}`}
            className="text-sm font-medium text-black/45 transition hover:text-orange-600"
          >
            View assignment →
          </Link>
        </div>

        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Compliance Incident
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                {formatLabel(incident.type)}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                {incident.listingName ?? "Unknown listing"} ·{" "}
                {incident.listingLocation ?? "Unknown location"}
              </p>
            </div>

            <div className="flex flex-col items-end gap-2">
              <span
                className={`rounded-full border px-4 py-2 text-sm font-semibold ${getIncidentStatusClass(
                  incident.status,
                )}`}
              >
                {formatLabel(incident.status)}
              </span>

              <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium capitalize text-white/70">
                Department: {departmentType ?? "not selected"}
              </span>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-4 text-sm leading-6 text-orange-100">
            {workflowMessage}
          </div>
        </section>

        {/* GRID */}
        <div className="grid grid-cols-6 gap-8">
          {/* LEFT */}
          <section className="col-span-4 space-y-8">
            {/* JOB CONTEXT */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Assignment Context
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Job Context
                </h2>

                <p className="mt-2 text-sm text-black/45">
                  Operational parties and linked assignment information.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-5 text-sm">
                <InfoCard
                  label="Listing"
                  value={incident.listingName ?? "Unknown"}
                />

                <InfoCard
                  label="Location"
                  value={incident.listingLocation ?? "Unknown"}
                />

                <InfoCard
                  label="Generator"
                  value={incident.generatorOrgName ?? "Unknown"}
                />

                <InfoCard
                  label="Manager"
                  value={incident.managerOrgName ?? "Not assigned"}
                />

                <InfoCard
                  label="Carrier"
                  value={incident.carrierOrgName ?? "Not assigned"}
                />

                <InfoCard
                  label="Assigned By"
                  value={incident.assignedByOrgName ?? "Unknown"}
                />

                <InfoCard
                  label="Assignment Status"
                  value={formatLabel(incident.assignmentStatus)}
                  badgeClass={getAssignmentStatusClass(
                    incident.assignmentStatus,
                  )}
                />

                <InfoCard
                  label="Assignment Method"
                  value={formatLabel(incident.assignmentMethod)}
                />
              </div>
            </div>

            {/* INCIDENT REPORT */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Reported Incident
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Incident Report
                </h2>

                <p className="mt-2 text-sm text-black/45">
                  Original report details submitted by the reporting
                  organisation.
                </p>
              </div>

              <div className="space-y-6">
                <TextBlock label="Summary" value={incident.summary} />

                <div className="grid grid-cols-2 gap-5">
                  <InfoCard
                    label="Incident Type"
                    value={formatLabel(incident.type)}
                  />

                  <InfoCard
                    label="Incident Date"
                    value={formatDate(incident.incidentDate)}
                  />

                  <InfoCard
                    label="Incident Location"
                    value={incident.incidentLocation ?? "Not provided"}
                  />

                  <InfoCard
                    label="Reported Organisation"
                    value={incident.reporterOrgName ?? "Unknown"}
                  />

                  <InfoCard
                    label="Reported User"
                    value={
                      incident.reportedByUserName
                        ? `${incident.reportedByUserName} · ${
                            incident.reportedByUserEmail ?? "No email"
                          }`
                        : "Unknown"
                    }
                  />

                  <InfoCard
                    label="Created"
                    value={formatDate(incident.createdAt)}
                  />
                </div>

                {incident.immediateAction && (
                  <TextBlock
                    label="Immediate Action"
                    value={incident.immediateAction}
                  />
                )}

                {incident.responsiblePerson && (
                  <InfoCard
                    label="Responsible Person"
                    value={incident.responsiblePerson}
                  />
                )}
              </div>
            </div>

            {/* REVIEW / RESOLUTION */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Review Evidence
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Review & Resolution
                </h2>

                <p className="mt-2 text-sm text-black/45">
                  Structured compliance review, corrective actions and closure
                  evidence.
                </p>
              </div>

              <div className="space-y-6">
                {incident.investigationFindings && (
                  <TextBlock
                    label="Investigation Findings"
                    value={incident.investigationFindings}
                  />
                )}

                {incident.correctiveActions && (
                  <TextBlock
                    label="Corrective Actions"
                    value={incident.correctiveActions}
                  />
                )}

                {incident.preventativeMeasures && (
                  <TextBlock
                    label="Preventative Measures"
                    value={incident.preventativeMeasures}
                  />
                )}

                {incident.complianceReview && (
                  <TextBlock
                    label="Compliance Review"
                    value={incident.complianceReview}
                  />
                )}

                {!incident.investigationFindings &&
                  !incident.correctiveActions &&
                  !incident.preventativeMeasures &&
                  !incident.complianceReview && (
                    <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-6 text-sm text-black/45">
                      No review information has been added yet.
                    </div>
                  )}

                {isResolved && (
                  <div className="rounded-2xl border border-green-200 bg-green-50 p-5 text-sm text-green-800">
                    <p className="font-semibold">Incident Resolved</p>
                    <p className="mt-1">
                      Closed: {formatDate(incident.dateClosed)}
                    </p>
                    <p className="mt-1">
                      Resolved at: {formatDate(incident.resolvedAt)}
                    </p>
                  </div>
                )}

                {incident.status === "rejected" && (
                  <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5 text-sm text-gray-700">
                    <p className="font-semibold">Incident Rejected</p>
                    <p className="mt-1">
                      This incident has been reviewed and rejected. The record
                      remains available for audit history.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* AUDIT TIMELINE */}
            <div className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                  Timeline
                </p>

                <h2 className="mt-2 text-xl font-semibold text-black">
                  Incident & Assignment Timeline
                </h2>
              </div>

              <div className="space-y-5 text-sm">
                <TimelineItem
                  title="Assignment Created"
                  date={formatDate(incident.assignmentAssignedAt)}
                />

                <TimelineItem
                  title="Manager Accepted"
                  date={formatDate(incident.assignmentManagerAcceptedAt)}
                />

                <TimelineItem
                  title="Carrier Assigned"
                  date={formatDate(incident.assignmentCarrierAssignedAt)}
                />

                <TimelineItem
                  title="Carrier Response"
                  date={formatDate(incident.assignmentRespondedAt)}
                />

                <TimelineItem
                  title="Collection Recorded"
                  date={formatDate(incident.assignmentCollectedAt)}
                />

                <TimelineItem
                  title="Incident Created"
                  date={formatDate(incident.createdAt)}
                />

                <TimelineItem
                  title="Incident Resolved"
                  date={formatDate(incident.resolvedAt)}
                />

                <TimelineItem
                  title="Assignment Completed"
                  date={formatDate(incident.assignmentCompletedAt)}
                />
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="col-span-2 space-y-6">
            {/* METADATA */}
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Metadata
              </p>

              <h2 className="mt-2 text-lg font-semibold text-black">
                Incident Metadata
              </h2>

              <div className="mt-5 space-y-5 text-sm">
                <MetaBlock label="Incident ID" value={incident.id} />

                <MetaBlock
                  label="Assignment ID"
                  value={incident.assignmentId}
                />

                <MetaBlock
                  label="Listing ID"
                  value={String(incident.listingId)}
                />

                <MetaBlock
                  label="Incident Organisation ID"
                  value={incident.organisationId}
                />

                <MetaBlock
                  label="Reporter Organisation ID"
                  value={incident.reportedByOrganisationId}
                />

                <MetaBlock
                  label="Generator Organisation ID"
                  value={incident.assignmentGeneratorOrgId ?? "Not available"}
                />

                <MetaBlock
                  label="Manager Organisation ID"
                  value={incident.assignmentManagerOrgId ?? "Not assigned"}
                />

                <MetaBlock
                  label="Carrier Organisation ID"
                  value={incident.assignmentCarrierOrgId ?? "Not assigned"}
                />

                <MetaBlock
                  label="Created"
                  value={formatDate(incident.createdAt)}
                />

                <MetaBlock
                  label="Resolved"
                  value={formatDate(incident.resolvedAt)}
                />
              </div>
            </div>

            {/* RESOLUTION FORM */}
            {canResolve && (
              <IncidentResolutionForm
                incidentId={incident.id}
                assignmentId={incident.assignmentId}
              />
            )}

            {!canResolve && !isResolved && incident.status !== "rejected" && (
              <div className="rounded-3xl border border-black/10 bg-white p-6 text-sm text-black/50 shadow-sm">
                <p className="font-semibold text-black">Awaiting review</p>
                <p className="mt-2 leading-6">
                  This incident is not currently resolvable from your active
                  department context.
                </p>
              </div>
            )}

            {isResolved && (
              <div className="rounded-3xl border border-green-200 bg-green-50 p-6 text-sm text-green-800 shadow-sm">
                <p className="font-semibold">Closed record</p>
                <p className="mt-2 leading-6">
                  This incident has been resolved and is retained for compliance
                  evidence.
                </p>
              </div>
            )}

            {/* QUICK LINKS */}
            <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Related Records
              </p>

              <div className="mt-5 space-y-3">
                <Link
                  href={`/home/operations/assignments/${incident.assignmentId}`}
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                >
                  View Assignment →
                </Link>

                <Link
                  href={`/home/marketplace/browse/${incident.listingId}`}
                  className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-sm font-semibold text-black transition hover:border-orange-300 hover:text-orange-600"
                >
                  View Listing →
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function InfoCard({
  label,
  value,
  badgeClass,
}: {
  label: string;
  value: string;
  badgeClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>

      {badgeClass ? (
        <span
          className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {value}
        </span>
      ) : (
        <p className="mt-2 text-sm font-semibold text-black">{value}</p>
      )}
    </div>
  );
}

function TextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-xs uppercase tracking-[0.2em] text-black/35">
        {label}
      </p>
      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-black/65">
        {value}
      </p>
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p className="mt-1 break-all font-mono text-xs text-black/65">{value}</p>
    </div>
  );
}

function TimelineItem({ title, date }: { title: string; date: string }) {
  return (
    <div className="border-l-2 border-orange-500 pl-4">
      <p className="font-medium text-black">{title}</p>
      <p className="mt-1 text-black/45">{date}</p>
    </div>
  );
}
