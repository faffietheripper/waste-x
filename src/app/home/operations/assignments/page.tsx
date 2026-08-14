import type { ReactNode } from "react";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { and, desc, eq, or } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  organisations,
  sites,
  wasteListings,
} from "@/db/schema";
import { resolveSiteFilterForOrganisation } from "@/modules/sites/data-access/resolveSiteFilterForOrganisation";

/* =========================================================
   TYPES
========================================================= */

type PageProps = {
  searchParams?:
    | Promise<{
        siteId?: string;
      }>
    | {
        siteId?: string;
      };
};

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

type AssignmentRow = {
  id: string;
  organisationId: string;
  listingId: number;
  siteId: string | null;
  jobSource: string | null;
  managerOrganisationId: string | null;
  carrierOrganisationId: string | null;
  assignedByOrganisationId: string;
  assignmentMethod: "bid" | "direct";
  bidId: number | null;
  status: AssignmentStatus;
  verificationCode: string | null;
  assignedAt: Date | null;
  managerAcceptedAt: Date | null;
  carrierAssignedAt: Date | null;
  respondedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;

  siteName: string | null;
  listingName: string | null;
  listingLocation: string | null;
  listingStatus: string | null;

  generatorOrgName: string | null;
  managerOrgName: string | null;
  carrierOrgName: string | null;

  incidentId: string | null;
  incidentStatus: string | null;
};

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

function formatMode(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatJobSource(value: string | null | undefined) {
  if (value === "external_manual") return "External Assignment";
  if (value === "internal_operation") return "Internal Operation";
  if (value === "wastex_marketplace") return "Waste X Marketplace";

  return "Assignment";
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "pending":
      return "Pending";
    case "accepted":
      return "Accepted";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "rejected":
      return "Rejected";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function getStatusClass(status: string | null | undefined) {
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

/* =========================================================
   WORKFLOW HELPERS
========================================================= */

function isGeneratorOnlyHandoff({
  assignment,
  orgId,
  isSoloOrganisation,
}: {
  assignment: AssignmentRow;
  orgId: string;
  isSoloOrganisation: boolean;
}) {
  return (
    isSoloOrganisation &&
    (assignment.organisationId === orgId ||
      assignment.assignedByOrganisationId === orgId) &&
    assignment.managerOrganisationId !== null &&
    assignment.managerOrganisationId !== orgId &&
    assignment.carrierOrganisationId !== orgId
  );
}

function getWorkflowMessage(
  assignment: AssignmentRow,
  orgId: string,
  isSoloOrganisation: boolean,
) {
  const isGenerator =
    assignment.organisationId === orgId ||
    assignment.assignedByOrganisationId === orgId;

  const isManager = assignment.managerOrganisationId === orgId;
  const isCarrier = assignment.carrierOrganisationId === orgId;

  const managerAccepted = Boolean(assignment.managerAcceptedAt);
  const carrierAssigned = Boolean(assignment.carrierOrganisationId);

  if (
    isGeneratorOnlyHandoff({
      assignment,
      orgId,
      isSoloOrganisation,
    })
  ) {
    return "Generator handoff complete. The assigned manager now owns collection, receipt, DWT intake and completion.";
  }

  if (assignment.status === "completed") {
    return "Workflow completed. Waste receipt and assignment completion have been recorded.";
  }

  if (assignment.status === "cancelled") {
    return "This assignment has been cancelled.";
  }

  if (assignment.status === "rejected") {
    return "This assignment has been rejected.";
  }

  if (assignment.status === "in_progress") {
    if (isManager) {
      return "Collection is in progress. Manager receipt confirmation is the next step.";
    }

    if (isCarrier) {
      return "Collection has been verified. Waiting for manager receipt confirmation.";
    }

    return "Collection is in progress. Waiting for manager receipt confirmation.";
  }

  if (assignment.status === "accepted") {
    if (
      isSoloOrganisation &&
      isManager &&
      !assignment.carrierOrganisationId
    ) {
      return "Solo manager job accepted. Open the assignment to report an incident or complete the job.";
    }

    if (isCarrier) {
      return "Carrier accepted. Open the assignment to verify collection.";
    }

    if (isManager) {
      return "Manager accepted. Open the assignment to continue the workflow.";
    }

    return "Carrier accepted. Collection verification is now available.";
  }

  if (assignment.status === "pending") {
    if (!managerAccepted && !carrierAssigned) {
      if (isManager) {
        return "Manager response required. Accept or reject this assigned job.";
      }

      if (isGenerator) {
        return "Waiting for the assigned manager to accept or reject.";
      }

      return "Waiting for manager response.";
    }

    if (managerAccepted && !carrierAssigned) {
      if (isManager) {
        return isSoloOrganisation
          ? "Manager accepted. Open assignment to complete or report incident."
          : "Manager accepted. Assign a carrier organisation next.";
      }

      if (isGenerator) {
        return "Generator handoff complete. Waiting for the manager to continue the workflow.";
      }

      return "Waiting for carrier assignment.";
    }

    if (managerAccepted && carrierAssigned) {
      if (isCarrier) {
        return "Carrier response required. Accept or reject this collection job.";
      }

      if (isManager) {
        return "Carrier assigned. Waiting for carrier response.";
      }

      return "Carrier assigned. Waiting for carrier response.";
    }
  }

  return "Assignment is awaiting the next workflow action.";
}

function getCarrierDisplayName({
  assignment,
  orgId,
  isSoloOrganisation,
}: {
  assignment: AssignmentRow;
  orgId: string;
  isSoloOrganisation: boolean;
}) {
  if (
    isSoloOrganisation &&
    assignment.managerOrganisationId === orgId &&
    !assignment.carrierOrganisationId &&
    assignment.status === "accepted"
  ) {
    return "Solo workspace";
  }

  return assignment.carrierOrgName ?? "Not assigned";
}

/* =========================================================
   PAGE
========================================================= */

export default async function AssignmentsPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[calc(13vh+2rem)]">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
          Unauthorized. You must belong to an organisation to view assignments.
        </div>
      </main>
    );
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};
  const orgId = session.user.organisationId;

  const currentOrganisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
    columns: {
      id: true,
      operatingMode: true,
      capabilities: true,
    },
  });

  const isSoloOrganisation = currentOrganisation?.operatingMode === "solo";

  const siteFilter = await resolveSiteFilterForOrganisation({
    organisationId: orgId,
    requestedSiteId: resolvedSearchParams?.siteId,
    createDefaultIfMissing: true,
  });

  const generatorOrg = alias(organisations, "generatorOrg");
  const managerOrg = alias(organisations, "managerOrg");
  const carrierOrg = alias(organisations, "carrierOrg");

  const standardVisibilityWhere =
    or(
      eq(carrierAssignments.organisationId, orgId),
      eq(carrierAssignments.assignedByOrganisationId, orgId),
      eq(carrierAssignments.managerOrganisationId, orgId),
      eq(carrierAssignments.carrierOrganisationId, orgId),
    ) ?? eq(carrierAssignments.organisationId, orgId);

  /*
    Solo rule:
    The main Assignments page is responsibility-based.

    For solo users, this page should show:
    - jobs they are responsible for as manager
    - jobs they are responsible for as carrier
    - self-managed jobs where they are manager/carrier

    It should not show generator-only records after the solo user has handed
    that waste listing to another manager.
  */
  const soloActiveResponsibilityWhere =
    or(
      eq(carrierAssignments.managerOrganisationId, orgId),
      eq(carrierAssignments.carrierOrganisationId, orgId),
    ) ?? eq(carrierAssignments.managerOrganisationId, orgId);

  const visibilityWhere = isSoloOrganisation
    ? soloActiveResponsibilityWhere
    : standardVisibilityWhere;

  const siteWhere = siteFilter.selectedSiteId
    ? or(
        eq(carrierAssignments.siteId, siteFilter.selectedSiteId),
        eq(wasteListings.siteId, siteFilter.selectedSiteId),
      )
    : undefined;

  const assignmentsWhere = siteWhere
    ? and(visibilityWhere, siteWhere)
    : visibilityWhere;

  const assignments = await database
    .select({
      id: carrierAssignments.id,
      organisationId: carrierAssignments.organisationId,
      listingId: carrierAssignments.listingId,
      siteId: carrierAssignments.siteId,
      jobSource: carrierAssignments.jobSource,

      managerOrganisationId: carrierAssignments.managerOrganisationId,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,

      assignmentMethod: carrierAssignments.assignmentMethod,
      bidId: carrierAssignments.bidId,
      status: carrierAssignments.status,

      verificationCode: carrierAssignments.verificationCode,

      assignedAt: carrierAssignments.assignedAt,
      managerAcceptedAt: carrierAssignments.managerAcceptedAt,
      carrierAssignedAt: carrierAssignments.carrierAssignedAt,
      respondedAt: carrierAssignments.respondedAt,
      collectedAt: carrierAssignments.collectedAt,
      completedAt: carrierAssignments.completedAt,

      siteName: sites.name,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,
      listingStatus: wasteListings.status,

      generatorOrgName: generatorOrg.teamName,
      managerOrgName: managerOrg.teamName,
      carrierOrgName: carrierOrg.teamName,

      incidentId: incidents.id,
      incidentStatus: incidents.status,
    })
    .from(carrierAssignments)
    .leftJoin(wasteListings, eq(wasteListings.id, carrierAssignments.listingId))
    .leftJoin(sites, eq(sites.id, carrierAssignments.siteId))
    .leftJoin(generatorOrg, eq(generatorOrg.id, carrierAssignments.organisationId))
    .leftJoin(managerOrg, eq(managerOrg.id, carrierAssignments.managerOrganisationId))
    .leftJoin(carrierOrg, eq(carrierOrg.id, carrierAssignments.carrierOrganisationId))
    .leftJoin(incidents, eq(incidents.assignmentId, carrierAssignments.id))
    .where(assignmentsWhere)
    .orderBy(desc(carrierAssignments.assignedAt));

  const total = assignments.length;

  const pending = assignments.filter(
    (assignment) => assignment.status === "pending",
  ).length;

  const accepted = assignments.filter(
    (assignment) => assignment.status === "accepted",
  ).length;

  const inProgress = assignments.filter(
    (assignment) => assignment.status === "in_progress",
  ).length;

  const active = assignments.filter((assignment) =>
    ["accepted", "in_progress"].includes(assignment.status),
  ).length;

  const completed = assignments.filter(
    (assignment) => assignment.status === "completed",
  ).length;

  const rejectedOrCancelled = assignments.filter((assignment) =>
    ["rejected", "cancelled"].includes(assignment.status),
  ).length;

  const incidentsCount = assignments.filter(
    (assignment) => assignment.incidentId,
  ).length;

  const unresolvedIncidents = assignments.filter(
    (assignment) =>
      assignment.incidentId &&
      assignment.incidentStatus &&
      assignment.incidentStatus !== "resolved",
  ).length;

  const managerNeedsResponse = assignments.filter(
    (assignment) =>
      assignment.status === "pending" &&
      assignment.managerOrganisationId === orgId &&
      !assignment.managerAcceptedAt &&
      !assignment.carrierOrganisationId,
  );

  const carrierNeedsResponse = assignments.filter(
    (assignment) =>
      !isSoloOrganisation &&
      assignment.status === "pending" &&
      assignment.carrierOrganisationId === orgId &&
      Boolean(assignment.managerAcceptedAt),
  );

  const waitingForCarrierAssignment = assignments.filter(
    (assignment) =>
      !isSoloOrganisation &&
      assignment.status === "pending" &&
      assignment.managerOrganisationId === orgId &&
      Boolean(assignment.managerAcceptedAt) &&
      !assignment.carrierOrganisationId,
  );

  const activeAssignments = assignments.filter((assignment) =>
    ["accepted", "in_progress"].includes(assignment.status),
  );

  const pendingAssignments = assignments.filter(
    (assignment) => assignment.status === "pending",
  );

  const completedAssignments = assignments.filter(
    (assignment) => assignment.status === "completed",
  );

  const incidentAssignments = assignments.filter(
    (assignment) => assignment.incidentId,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[calc(13vh+2rem)] text-black">
      <div className="mx-auto max-w-7xl space-y-8">
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Operations
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                {isSoloOrganisation
                  ? "Active Responsibility"
                  : "Assignments Overview"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                {isSoloOrganisation
                  ? "This view shows assignments where your solo workspace is actively responsible as the manager or carrier. Waste records you generated and handed off to another manager are no longer your operational responsibility here."
                  : "Track internal and external assignment operations across the generator, manager, carrier and compliance workflow. Assignments become the operational source of truth once a waste listing is awarded or directly assigned."}
              </p>

              <p className="mt-4 inline-flex rounded-full border border-orange-400/20 bg-orange-500/10 px-4 py-2 text-xs font-semibold text-orange-300">
                Showing: {siteFilter.label}
              </p>
            </div>

            <Link
              href="/home/operations/assignments/active"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              View Active →
            </Link>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-5 md:grid-cols-4 xl:grid-cols-8">
          <MetricCard label="Total" value={total} />
          <MetricCard label="Pending" value={pending} />
          <MetricCard label="Accepted" value={accepted} />
          <MetricCard label="In Progress" value={inProgress} />
          <MetricCard label="Active" value={active} />
          <MetricCard label="Completed" value={completed} />
          <MetricCard label="Closed" value={rejectedOrCancelled} />
          <MetricCard label="Incidents" value={incidentsCount} />
        </section>

        <section className="grid grid-cols-1 gap-5 lg:grid-cols-4">
          <AttentionCard
            title="Manager Responses"
            value={managerNeedsResponse.length}
            detail="Jobs waiting for manager accept/reject."
          />

          <AttentionCard
            title="Carrier Responses"
            value={carrierNeedsResponse.length}
            detail={
              isSoloOrganisation
                ? "Skipped for solo manager workflow."
                : "Carrier jobs waiting for accept/reject."
            }
          />

          <AttentionCard
            title="Carrier Assignment"
            value={waitingForCarrierAssignment.length}
            detail={
              isSoloOrganisation
                ? "Skipped where solo workspace is responsible."
                : "Manager accepted jobs needing a carrier."
            }
          />

          <AttentionCard
            title="Unresolved Incidents"
            value={unresolvedIncidents}
            detail="Assignments blocked or requiring review."
            danger={unresolvedIncidents > 0}
          />
        </section>

        <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <AssignmentSection
            title="Active Assignments"
            description={
              isSoloOrganisation
                ? "Accepted or in-progress assignments where your solo workspace is responsible as manager or carrier."
                : "Accepted or in-progress assignments currently moving through collection, receipt or completion."
            }
            href="/home/operations/assignments/active"
            hrefLabel="Open active view"
          >
            {activeAssignments.length > 0 ? (
              activeAssignments.slice(0, 5).map((assignment) => (
                <AssignmentItem
                  key={`${assignment.id}-active`}
                  assignment={assignment}
                  orgId={orgId}
                  isSoloOrganisation={isSoloOrganisation}
                />
              ))
            ) : (
              <Empty text="No active assignments for this site view." />
            )}
          </AssignmentSection>

          <AssignmentSection
            title="Pending Workflow Actions"
            description={
              isSoloOrganisation
                ? "Assignments waiting for your manager response."
                : "Assignments waiting for manager response, carrier assignment or carrier response."
            }
            href="/home/operations/assignments/active"
            hrefLabel="Review pending"
          >
            {pendingAssignments.length > 0 ? (
              pendingAssignments.slice(0, 5).map((assignment) => (
                <AssignmentItem
                  key={`${assignment.id}-pending`}
                  assignment={assignment}
                  orgId={orgId}
                  isSoloOrganisation={isSoloOrganisation}
                />
              ))
            ) : (
              <Empty text="No pending workflow actions for this site view." />
            )}
          </AssignmentSection>

          <AssignmentSection
            title="Recently Completed"
            description="Completed assignments where receipt or completion has been recorded."
            href="/home/operations/assignments/completed"
            hrefLabel="View completed"
          >
            {completedAssignments.length > 0 ? (
              completedAssignments.slice(0, 5).map((assignment) => (
                <AssignmentItem
                  key={`${assignment.id}-completed`}
                  assignment={assignment}
                  orgId={orgId}
                  isSoloOrganisation={isSoloOrganisation}
                />
              ))
            ) : (
              <Empty text="No completed assignments for this site view." />
            )}
          </AssignmentSection>

          <AssignmentSection
            title="Issues / Incidents"
            description="Assignments with incident records attached for compliance review."
            href="/home/compliance/incidents"
            hrefLabel="Open incidents"
          >
            {incidentAssignments.length > 0 ? (
              incidentAssignments.slice(0, 5).map((assignment) => (
                <AssignmentItem
                  key={`${assignment.id}-incident`}
                  assignment={assignment}
                  orgId={orgId}
                  isSoloOrganisation={isSoloOrganisation}
                  showIncident
                />
              ))
            ) : (
              <Empty text="No incidents reported for this site view." />
            )}
          </AssignmentSection>
        </section>

        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Recent Records
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                {isSoloOrganisation
                  ? "Active Responsibility Records"
                  : "All Visible Assignments"}
              </h2>

              <p className="mt-2 max-w-2xl text-sm text-black/45">
                {isSoloOrganisation
                  ? "This list excludes generator-side records that your solo workspace has already handed off to another manager."
                  : "This list includes assignments where your organisation is the generator-side owner, assigning organisation, manager or carrier."}
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {assignments.length} records
            </span>
          </div>

          {assignments.length > 0 ? (
            <div className="divide-y divide-black/5">
              {assignments.slice(0, 10).map((assignment) => (
                <AssignmentRow
                  key={`${assignment.id}-row`}
                  assignment={assignment}
                  orgId={orgId}
                  isSoloOrganisation={isSoloOrganisation}
                />
              ))}
            </div>
          ) : (
            <Empty
              text={
                isSoloOrganisation
                  ? "No active responsibility assignments found for this site view."
                  : "No assignments found for this site view."
              }
            />
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   UI COMPONENTS
========================================================= */

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function AttentionCard({
  title,
  value,
  detail,
  danger = false,
}: {
  title: string;
  value: number;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div
      className={`rounded-3xl border p-5 shadow-sm ${
        danger ? "border-red-200 bg-red-50" : "border-black/10 bg-white"
      }`}
    >
      <p
        className={`text-xs uppercase tracking-widest ${
          danger ? "text-red-500" : "text-black/40"
        }`}
      >
        {title}
      </p>

      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-red-700" : "text-black"
        }`}
      >
        {value}
      </p>

      <p className={`mt-2 text-sm ${danger ? "text-red-600" : "text-black/45"}`}>
        {detail}
      </p>
    </div>
  );
}

function AssignmentSection({
  title,
  description,
  href,
  hrefLabel,
  children,
}: {
  title: string;
  description: string;
  href: string;
  hrefLabel: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <h3 className="text-lg font-semibold text-black">{title}</h3>
          <p className="mt-1 text-sm text-black/45">{description}</p>
        </div>

        <Link
          href={href}
          className="shrink-0 rounded-full bg-[#fbfaf7] px-4 py-2 text-xs font-medium text-black/55 transition hover:bg-orange-100 hover:text-orange-700"
        >
          {hrefLabel}
        </Link>
      </div>

      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AssignmentItem({
  assignment,
  orgId,
  isSoloOrganisation,
  showIncident = false,
}: {
  assignment: AssignmentRow;
  orgId: string;
  isSoloOrganisation: boolean;
  showIncident?: boolean;
}) {
  const workflowMessage = getWorkflowMessage(
    assignment,
    orgId,
    isSoloOrganisation,
  );

  return (
    <Link
      href={`/home/operations/assignments/${assignment.id}`}
      className="block rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-5">
        <div>
          <p className="font-semibold text-black">
            {assignment.listingName ?? `Assignment ${assignment.id}`}
          </p>

          <p className="mt-1 text-sm text-black/45">
            {assignment.listingLocation ?? "Unknown location"}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
            assignment.status,
          )}`}
        >
          {getStatusLabel(assignment.status)}
        </span>
      </div>

      <p className="mt-3 text-sm text-black/55">{workflowMessage}</p>

      <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
        <MiniDetail label="Site" value={assignment.siteName ?? "Not assigned"} />
        <MiniDetail
          label="Carrier"
          value={getCarrierDisplayName({
            assignment,
            orgId,
            isSoloOrganisation,
          })}
        />
        <MiniDetail label="Assigned" value={formatDate(assignment.assignedAt)} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/40">
          {formatJobSource(assignment.jobSource)}
        </span>

        {showIncident && assignment.incidentStatus && (
          <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-red-700">
            Incident: {formatMode(assignment.incidentStatus)}
          </span>
        )}
      </div>
    </Link>
  );
}

function AssignmentRow({
  assignment,
  orgId,
  isSoloOrganisation,
}: {
  assignment: AssignmentRow;
  orgId: string;
  isSoloOrganisation: boolean;
}) {
  const workflowMessage = getWorkflowMessage(
    assignment,
    orgId,
    isSoloOrganisation,
  );

  return (
    <Link
      href={`/home/operations/assignments/${assignment.id}`}
      className="grid grid-cols-12 items-center gap-4 py-5 transition hover:bg-[#fbfaf7]"
    >
      <div className="col-span-4">
        <p className="font-medium text-black">
          {assignment.listingName ?? `Assignment ${assignment.id}`}
        </p>
        <p className="mt-1 text-xs text-black/40">ID: {assignment.id}</p>
      </div>

      <div className="col-span-3">
        <p className="text-sm text-black/55">{workflowMessage}</p>
      </div>

      <div className="col-span-2 text-sm text-black/45">
        {assignment.siteName ?? "No site"}
      </div>

      <div className="col-span-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
            assignment.status,
          )}`}
        >
          {getStatusLabel(assignment.status)}
        </span>
      </div>

      <div className="col-span-1 text-right text-sm font-medium text-orange-600">
        View →
      </div>
    </Link>
  );
}

function MiniDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-medium text-black">{value}</p>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-6 text-center text-sm text-black/45">
      {text}
    </div>
  );
}