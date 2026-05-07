import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  incidents,
  carrierAssignments,
  wasteListings,
  organisations,
  users,
} from "@/db/schema";
import { desc, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type IncidentStatus = "open" | "under_review" | "resolved" | "rejected";

type IncidentRow = {
  id: string;
  organisationId: string;
  assignmentId: string;
  listingId: number;
  reportedByUserId: string;
  reportedByOrganisationId: string;

  incidentDate: Date | null;
  incidentLocation: string | null;
  type: string;
  summary: string;
  immediateAction: string | null;

  investigationFindings: string | null;
  correctiveActions: string | null;
  preventativeMeasures: string | null;
  complianceReview: string | null;

  responsiblePerson: string | null;
  dateClosed: Date | null;
  status: IncidentStatus;
  resolvedByUserId: string | null;
  createdAt: Date | null;
  resolvedAt: Date | null;

  listingName: string | null;
  listingLocation: string | null;

  assignmentStatus: string | null;
  assignmentManagerOrganisationId: string | null;
  assignmentCarrierOrganisationId: string | null;
  assignmentOrganisationId: string | null;
  assignmentAssignedByOrganisationId: string | null;

  generatorOrgName: string | null;
  managerOrgName: string | null;
  carrierOrgName: string | null;
  reportedByOrgName: string | null;
  reportedByUserName: string | null;
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

function getIncidentStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "open":
      return "Open";
    case "under_review":
      return "Under Review";
    case "resolved":
      return "Resolved";
    case "rejected":
      return "Rejected";
    default:
      return "Unknown";
  }
}

function getIncidentStatusClass(status: string | null | undefined) {
  switch (status) {
    case "open":
      return "border-red-300 bg-red-100 text-red-700";
    case "under_review":
      return "border-orange-300 bg-orange-100 text-orange-700";
    case "resolved":
      return "border-green-300 bg-green-100 text-green-700";
    case "rejected":
      return "border-gray-300 bg-gray-100 text-gray-700";
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

function getIncidentWorkflowMessage(incident: IncidentRow) {
  if (incident.status === "open") {
    return "This incident has been reported and is waiting for review.";
  }

  if (incident.status === "under_review") {
    return "This incident is under compliance review. Investigation and corrective actions should be recorded.";
  }

  if (incident.status === "resolved") {
    return "This incident has been resolved and is retained for audit evidence.";
  }

  if (incident.status === "rejected") {
    return "This incident was reviewed and rejected. The decision remains available for audit history.";
  }

  return "Incident record available for compliance review.";
}

/* =========================================================
   PAGE
========================================================= */

export default async function IncidentsPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
          Unauthorized. You must belong to an organisation to view incidents.
        </div>
      </main>
    );
  }

  const orgId = session.user.organisationId;

  const generatorOrg = alias(organisations, "generatorOrg");
  const managerOrg = alias(organisations, "managerOrg");
  const carrierOrg = alias(organisations, "carrierOrg");
  const reportedByOrg = alias(organisations, "reportedByOrg");
  const reportedByUser = alias(users, "reportedByUser");

  /* =========================================================
     FETCH

     Visibility supports the current Waste X workflow:

     incidents.organisationId
       original incident organisation context

     incidents.reportedByOrganisationId
       organisation that reported the incident

     assignment.organisationId
       generator-side / owning organisation context

     assignment.assignedByOrganisationId
       organisation that created or assigned the job

     assignment.managerOrganisationId
       assigned waste manager organisation

     assignment.carrierOrganisationId
       assigned carrier/logistics organisation
  ========================================================= */

  const allIncidents = await database
    .select({
      id: incidents.id,
      organisationId: incidents.organisationId,
      assignmentId: incidents.assignmentId,
      listingId: incidents.listingId,
      reportedByUserId: incidents.reportedByUserId,
      reportedByOrganisationId: incidents.reportedByOrganisationId,

      incidentDate: incidents.incidentDate,
      incidentLocation: incidents.incidentLocation,
      type: incidents.type,
      summary: incidents.summary,
      immediateAction: incidents.immediateAction,

      investigationFindings: incidents.investigationFindings,
      correctiveActions: incidents.correctiveActions,
      preventativeMeasures: incidents.preventativeMeasures,
      complianceReview: incidents.complianceReview,

      responsiblePerson: incidents.responsiblePerson,
      dateClosed: incidents.dateClosed,
      status: incidents.status,
      resolvedByUserId: incidents.resolvedByUserId,
      createdAt: incidents.createdAt,
      resolvedAt: incidents.resolvedAt,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,

      assignmentStatus: carrierAssignments.status,
      assignmentManagerOrganisationId: carrierAssignments.managerOrganisationId,
      assignmentCarrierOrganisationId: carrierAssignments.carrierOrganisationId,
      assignmentOrganisationId: carrierAssignments.organisationId,
      assignmentAssignedByOrganisationId:
        carrierAssignments.assignedByOrganisationId,

      generatorOrgName: generatorOrg.teamName,
      managerOrgName: managerOrg.teamName,
      carrierOrgName: carrierOrg.teamName,
      reportedByOrgName: reportedByOrg.teamName,
      reportedByUserName: reportedByUser.name,
    })
    .from(incidents)
    .leftJoin(
      carrierAssignments,
      eq(carrierAssignments.id, incidents.assignmentId),
    )
    .leftJoin(wasteListings, eq(wasteListings.id, incidents.listingId))
    .leftJoin(
      generatorOrg,
      eq(generatorOrg.id, carrierAssignments.organisationId),
    )
    .leftJoin(
      managerOrg,
      eq(managerOrg.id, carrierAssignments.managerOrganisationId),
    )
    .leftJoin(
      carrierOrg,
      eq(carrierOrg.id, carrierAssignments.carrierOrganisationId),
    )
    .leftJoin(
      reportedByOrg,
      eq(reportedByOrg.id, incidents.reportedByOrganisationId),
    )
    .leftJoin(reportedByUser, eq(reportedByUser.id, incidents.reportedByUserId))
    .where(
      or(
        eq(incidents.organisationId, orgId),
        eq(incidents.reportedByOrganisationId, orgId),
        eq(carrierAssignments.organisationId, orgId),
        eq(carrierAssignments.assignedByOrganisationId, orgId),
        eq(carrierAssignments.managerOrganisationId, orgId),
        eq(carrierAssignments.carrierOrganisationId, orgId),
      ),
    )
    .orderBy(desc(incidents.createdAt));

  /* =========================================================
     SPLIT
  ========================================================= */

  const open = allIncidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "under_review",
  );

  const resolved = allIncidents.filter(
    (incident) => incident.status === "resolved",
  );

  const rejected = allIncidents.filter(
    (incident) => incident.status === "rejected",
  );

  const underReview = allIncidents.filter(
    (incident) => incident.status === "under_review",
  );

  const unresolved = allIncidents.filter(
    (incident) =>
      incident.status === "open" || incident.status === "under_review",
  );

  const linkedToActiveAssignments = allIncidents.filter((incident) =>
    ["pending", "accepted", "in_progress"].includes(
      incident.assignmentStatus ?? "",
    ),
  );

  const metrics = {
    total: allIncidents.length,
    open: open.filter((incident) => incident.status === "open").length,
    underReview: underReview.length,
    resolved: resolved.length,
    rejected: rejected.length,
    unresolved: unresolved.length,
    linkedToActiveAssignments: linkedToActiveAssignments.length,
  };

  /* =========================================================
     UI
  ========================================================= */

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
                Incident Management
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Monitor, investigate and resolve operational incidents linked to
                assignments, listings and waste movement workflows. Incidents
                remain part of the compliance record and can block completion
                until resolved.
              </p>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-right lg:block">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Unresolved
              </p>
              <p className="mt-2 text-3xl font-semibold text-orange-400">
                {metrics.unresolved}
              </p>
              <p className="mt-1 text-xs text-white/45">Open or under review</p>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-7">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard
            label="Open"
            value={metrics.open}
            danger={metrics.open > 0}
          />
          <MetricCard label="Under Review" value={metrics.underReview} />
          <MetricCard label="Resolved" value={metrics.resolved} />
          <MetricCard label="Rejected" value={metrics.rejected} />
          <MetricCard
            label="Unresolved"
            value={metrics.unresolved}
            danger={metrics.unresolved > 0}
          />
          <MetricCard
            label="Active Jobs"
            value={metrics.linkedToActiveAssignments}
          />
        </section>

        {/* COMPLIANCE GUIDANCE */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <GuidanceCard
            label="Operational Control"
            title="Incidents block completion"
            text="Assignments with unresolved incidents should not be completed until the issue is investigated and resolved."
          />

          <GuidanceCard
            label="Audit Evidence"
            title="Structured resolution"
            text="Use investigation findings, corrective actions, preventative measures and compliance review fields for legal-grade records."
          />

          <GuidanceCard
            label="Chain of Custody"
            title="Linked to assignments"
            text="Each incident remains connected to the assignment, listing, reporter organisation and operational parties involved."
          />
        </section>

        {/* OPEN INCIDENTS */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-red-600">
                Action Required
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Open Incidents
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Incidents that are open or currently under review.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {open.length} open / review
            </span>
          </div>

          {open.length === 0 ? (
            <EmptyState
              title="No open incidents"
              text="There are currently no unresolved incidents visible to this organisation."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {open.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident as IncidentRow}
                  priority
                />
              ))}
            </div>
          )}
        </section>

        {/* RESOLVED INCIDENTS */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-green-600">
                Closed Records
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Resolved Incidents
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Completed incident reviews retained for audit and compliance
                history.
              </p>
            </div>

            <span className="rounded-full bg-white px-4 py-2 text-xs font-medium text-black/45 ring-1 ring-black/10">
              {resolved.length} resolved
            </span>
          </div>

          {resolved.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/20 bg-white p-8 text-sm text-black/45 shadow-sm">
              No resolved incidents.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {resolved.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident as IncidentRow}
                />
              ))}
            </div>
          )}
        </section>

        {/* REJECTED INCIDENTS */}
        {rejected.length > 0 && (
          <section className="space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-black/35">
                Rejected Records
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Rejected Incidents
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Incidents reviewed and rejected, retained for historical
                transparency.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-6 opacity-80 xl:grid-cols-3">
              {rejected.map((incident) => (
                <IncidentCard
                  key={incident.id}
                  incident={incident as IncidentRow}
                  compact
                />
              ))}
            </div>
          </section>
        )}

        {/* RECENT TABLE */}
        <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Recent Incident Records
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                All Visible Incidents
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-black/45">
                Full recent list of incident records visible to this
                organisation through reporting or assignment involvement.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {allIncidents.length} records
            </span>
          </div>

          {allIncidents.length === 0 ? (
            <EmptyState
              title="No incident records"
              text="No incident records are currently visible for this organisation."
            />
          ) : (
            <div className="divide-y divide-black/5">
              {allIncidents.slice(0, 10).map((incident) => (
                <IncidentRowItem
                  key={incident.id}
                  incident={incident as IncidentRow}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   INCIDENT CARD
========================================================= */

function IncidentCard({
  incident,
  priority = false,
  compact = false,
}: {
  incident: IncidentRow;
  priority?: boolean;
  compact?: boolean;
}) {
  const workflowMessage = getIncidentWorkflowMessage(incident);

  return (
    <Link
      href={`/home/compliance/incidents/${incident.id}`}
      className={`block rounded-3xl border p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
        priority
          ? "border-red-200 bg-red-50 hover:border-red-300"
          : "border-black/10 bg-white hover:border-orange-300"
      }`}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p
            className={`text-xs uppercase tracking-[0.2em] ${
              priority ? "text-red-600" : "text-orange-600"
            }`}
          >
            Incident Record
          </p>

          <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-black">
            {formatMode(incident.type)}
          </h3>

          <p className="mt-2 text-sm text-black/50">
            {incident.incidentLocation ||
              incident.listingLocation ||
              "Unknown location"}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getIncidentStatusClass(
            incident.status,
          )}`}
        >
          {getIncidentStatusLabel(incident.status)}
        </span>
      </div>

      <p className="mt-4 line-clamp-3 text-sm leading-6 text-black/60">
        {incident.summary}
      </p>

      {!compact && (
        <>
          <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
            {workflowMessage}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <MiniStat
              label="Listing"
              value={incident.listingName ?? "Unknown"}
            />

            <MiniStat
              label="Assignment Status"
              value={formatMode(incident.assignmentStatus)}
              badgeClass={getAssignmentStatusClass(incident.assignmentStatus)}
            />

            <MiniStat
              label="Reported By"
              value={incident.reportedByOrgName ?? "Unknown"}
            />

            <MiniStat label="Created" value={formatDate(incident.createdAt)} />
          </div>

          {incident.immediateAction && (
            <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
              <p className="text-[10px] uppercase tracking-widest text-black/35">
                Immediate Action
              </p>
              <p className="mt-2 line-clamp-3 text-sm leading-6 text-black/55">
                {incident.immediateAction}
              </p>
            </div>
          )}
        </>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/5 pt-5">
        <span className="text-xs text-black/35">
          ID: <span className="font-mono">{incident.id.slice(0, 10)}...</span>
        </span>

        <span className="text-sm font-semibold text-orange-600">
          View Incident →
        </span>
      </div>
    </Link>
  );
}

/* =========================================================
   ROW ITEM
========================================================= */

function IncidentRowItem({ incident }: { incident: IncidentRow }) {
  return (
    <Link
      href={`/home/compliance/incidents/${incident.id}`}
      className="grid grid-cols-12 items-center gap-4 py-5 transition hover:bg-[#fbfaf7]"
    >
      <div className="col-span-3">
        <p className="font-medium text-black">{formatMode(incident.type)}</p>
        <p className="mt-1 text-xs text-black/40">
          {incident.listingName ?? "Unknown listing"}
        </p>
      </div>

      <div className="col-span-3">
        <p className="line-clamp-2 text-sm text-black/55">{incident.summary}</p>
      </div>

      <div className="col-span-2 text-sm text-black/45">
        {formatDate(incident.createdAt)}
      </div>

      <div className="col-span-2">
        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${getIncidentStatusClass(
            incident.status,
          )}`}
        >
          {getIncidentStatusLabel(incident.status)}
        </span>
      </div>

      <div className="col-span-1 text-sm text-black/45">
        {formatMode(incident.assignmentStatus)}
      </div>

      <div className="col-span-1 text-right text-sm font-medium text-orange-600">
        View →
      </div>
    </Link>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({
  label,
  value,
  danger = false,
}: {
  label: string;
  value: number;
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
        {label}
      </p>
      <p
        className={`mt-3 text-3xl font-semibold ${
          danger ? "text-red-700" : "text-black"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function GuidanceCard({
  label,
  title,
  text,
}: {
  label: string;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>
      <h3 className="mt-3 text-base font-semibold text-black">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/50">{text}</p>
    </div>
  );
}

function MiniStat({
  label,
  value,
  badgeClass,
}: {
  label: string;
  value: string;
  badgeClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
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
        <p className="mt-2 truncate text-sm font-semibold text-black">
          {value}
        </p>
      )}
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>
    </div>
  );
}
