import Link from "next/link";
import { desc, eq, or } from "drizzle-orm";

import { database } from "@/db/database";
import { carrierAssignments, incidents, wasteListings } from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   TYPES
========================================================= */

type IncidentRow = {
  id: string;
  assignmentId: string;
  listingId: number;
  incidentDate: Date | null;
  incidentLocation: string | null;
  type: string;
  summary: string;
  immediateAction: string | null;
  responsiblePerson: string | null;
  status: string;
  resolvedAt: Date | null;
  dateClosed: Date | null;

  assignmentStatus: string;
  assignmentOrganisationId: string;
  assignedByOrganisationId: string | null;
  managerOrganisationId: string | null;
  carrierOrganisationId: string | null;

  listingName: string | null;
  listingLocation: string | null;
};

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusClass(status: string | null | undefined) {
  if (status === "open") return "border-red-200 bg-red-50 text-red-700";
  if (status === "under_review") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (status === "resolved") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-black/10 bg-[#f7f3ed] text-black/50";
}

function isOpenStatus(status: string) {
  return status === "open" || status === "under_review";
}

/* =========================================================
   PAGE
========================================================= */

export default async function OperationsIncidentsPage({
  searchParams,
}: {
  searchParams?: { resolved?: string };
}) {
  const context = await requireOperationalPermission("incident:view");
  const organisationId = context.user.organisationId!;

  const rows = await database
    .select({
      id: incidents.id,
      assignmentId: incidents.assignmentId,
      listingId: incidents.listingId,
      incidentDate: incidents.incidentDate,
      incidentLocation: incidents.incidentLocation,
      type: incidents.type,
      summary: incidents.summary,
      immediateAction: incidents.immediateAction,
      responsiblePerson: incidents.responsiblePerson,
      status: incidents.status,
      resolvedAt: incidents.resolvedAt,
      dateClosed: incidents.dateClosed,

      assignmentStatus: carrierAssignments.status,
      assignmentOrganisationId: carrierAssignments.organisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,
      managerOrganisationId: carrierAssignments.managerOrganisationId,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,
    })
    .from(incidents)
    .innerJoin(
      carrierAssignments,
      eq(incidents.assignmentId, carrierAssignments.id),
    )
    .leftJoin(wasteListings, eq(incidents.listingId, wasteListings.id))
    .where(
      or(
        eq(incidents.organisationId, organisationId),
        eq(incidents.reportedByOrganisationId, organisationId),
        eq(carrierAssignments.organisationId, organisationId),
        eq(carrierAssignments.assignedByOrganisationId, organisationId),
        eq(carrierAssignments.managerOrganisationId, organisationId),
        eq(carrierAssignments.carrierOrganisationId, organisationId),
      ),
    )
    .orderBy(desc(incidents.incidentDate));

  const openRows = rows.filter((row) => isOpenStatus(row.status));
  const closedRows = rows.filter((row) => !isOpenStatus(row.status));

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32 pl-[24vw] text-black">
      <div className="space-y-8">
        <section className="rounded-3xl bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Operations
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                Incident Management
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Review operational incidents, open the incident detail page,
                resolve issues and unblock affected assignments.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>Workspace: {context.departmentLabel}</HeaderPill>
                <HeaderPill>Total: {rows.length}</HeaderPill>
                <HeaderPill>Open: {openRows.length}</HeaderPill>
                <HeaderPill>Closed: {closedRows.length}</HeaderPill>
              </div>
            </div>

            <Link
              href="/home/operations/assignments"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Back to assignments
            </Link>
          </div>
        </section>

        {searchParams?.resolved === "1" && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-medium text-emerald-800">
            Incident resolved. The linked assignment can continue if no other
            unresolved incidents exist.
          </section>
        )}

        <section className="grid gap-5 md:grid-cols-3">
          <MetricCard label="Total incidents" value={String(rows.length)} />
          <MetricCard label="Open / review" value={String(openRows.length)} />
          <MetricCard label="Closed" value={String(closedRows.length)} />
        </section>

        {rows.length === 0 && (
          <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              No incidents
            </p>

            <h2 className="mt-3 text-2xl font-semibold text-black">
              No incident records found
            </h2>

            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
              When an incident is reported from an assignment, it will appear
              here for review and resolution.
            </p>
          </section>
        )}

        {openRows.length > 0 && (
          <section className="space-y-5">
            <SectionHeading
              label="Action required"
              title="Open incidents"
              description="These incidents block operational completion until resolved."
            />

            <div className="space-y-5">
              {openRows.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          </section>
        )}

        {closedRows.length > 0 && (
          <section className="space-y-5">
            <SectionHeading
              label="Closed records"
              title="Resolved incidents"
              description="These incidents have already been reviewed and closed."
            />

            <div className="space-y-5">
              {closedRows.map((incident) => (
                <IncidentCard key={incident.id} incident={incident} />
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function IncidentCard({ incident }: { incident: IncidentRow }) {
  const isOpen = isOpenStatus(incident.status);

  return (
    <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              {formatLabel(incident.type)}
            </p>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
                incident.status,
              )}`}
            >
              {formatLabel(incident.status)}
            </span>
          </div>

          <h2 className="mt-3 text-xl font-semibold text-black">
            {incident.listingName ?? "Assignment incident"}
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
            {incident.summary}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/home/operations/incidents/${incident.id}`}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
              isOpen
                ? "bg-black text-orange-400 hover:bg-orange-500 hover:text-black"
                : "border border-black/10 bg-[#f7f3ed] text-black/60 hover:border-orange-300 hover:text-orange-600"
            }`}
          >
            {isOpen ? "Review / resolve →" : "View details →"}
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Info label="Incident date" value={formatDate(incident.incidentDate)} />
        <Info
          label="Location"
          value={
            incident.incidentLocation ??
            incident.listingLocation ??
            "Not recorded"
          }
        />
        <Info
          label="Assignment status"
          value={formatLabel(incident.assignmentStatus)}
        />
      </div>
    </article>
  );
}

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>

      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function SectionHeading({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>

      <h2 className="mt-2 text-2xl font-semibold text-black">{title}</h2>

      <p className="mt-2 text-sm leading-6 text-black/50">{description}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}