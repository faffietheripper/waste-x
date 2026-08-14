import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, eq, or } from "drizzle-orm";

import { database } from "@/db/database";
import { carrierAssignments, incidents, wasteListings } from "@/db/schema";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { resolveIncident } from "@/modules/incidents/core/resolveIncident";

/* =========================================================
   SERVER ACTION
========================================================= */

async function resolveIncidentDetailAction(formData: FormData) {
  "use server";

  const context = await requireOperationalPermission("incident:view");

  const incidentId = String(formData.get("incidentId") ?? "");
  const assignmentId = String(formData.get("assignmentId") ?? "");

  await resolveIncident({
    incidentId,
    assignmentId,
    organisationId: context.user.organisationId!,
    userId: context.user.id,
    investigationFindings: String(
      formData.get("investigationFindings") ?? "",
    ),
    correctiveActions: String(formData.get("correctiveActions") ?? ""),
    preventativeMeasures: String(
      formData.get("preventativeMeasures") ?? "",
    ),
    complianceReview: String(formData.get("complianceReview") ?? ""),
    responsiblePerson: String(formData.get("responsiblePerson") ?? ""),
    dateClosed: formData.get("dateClosed")
      ? new Date(String(formData.get("dateClosed")))
      : new Date(),
  });

  revalidatePath("/home/operations/incidents");
  revalidatePath(`/home/operations/incidents/${incidentId}`);
  revalidatePath(`/home/operations/assignments/${assignmentId}`);

  redirect("/home/operations/incidents?resolved=1");
}

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

function canResolveIncidentForOrg(row: IncidentDetailRow, organisationId: string) {
  const organisationIsGeneratorSide =
    row.assignmentOrganisationId === organisationId ||
    row.assignedByOrganisationId === organisationId;

  const organisationIsManagerSide = row.managerOrganisationId === organisationId;

  const organisationIsSoloOrInternalCarrierSide =
    row.carrierOrganisationId === organisationId &&
    (row.managerOrganisationId === organisationId ||
      row.assignmentOrganisationId === organisationId ||
      row.assignedByOrganisationId === organisationId);

  return (
    organisationIsGeneratorSide ||
    organisationIsManagerSide ||
    organisationIsSoloOrInternalCarrierSide
  );
}

/* =========================================================
   TYPES
========================================================= */

type IncidentDetailRow = {
  id: string;
  organisationId: string;
  assignmentId: string;
  listingId: number;
  reportedByOrganisationId: string | null;
  reportedByUserId: string | null;
  incidentDate: Date | null;
  incidentLocation: string | null;
  type: string;
  summary: string;
  immediateAction: string | null;
  responsiblePerson: string | null;
  status: string;
  investigationFindings: string | null;
  correctiveActions: string | null;
  preventativeMeasures: string | null;
  complianceReview: string | null;
  dateClosed: Date | null;
  resolvedAt: Date | null;

  assignmentStatus: string;
  assignmentOrganisationId: string;
  assignedByOrganisationId: string | null;
  managerOrganisationId: string | null;
  carrierOrganisationId: string | null;

  listingName: string | null;
  listingLocation: string | null;
};

/* =========================================================
   PAGE
========================================================= */

export default async function IncidentDetailPage({
  params,
}: {
  params: { incidentId: string };
}) {
  const context = await requireOperationalPermission("incident:view");
  const organisationId = context.user.organisationId!;

  const [incident] = await database
    .select({
      id: incidents.id,
      organisationId: incidents.organisationId,
      assignmentId: incidents.assignmentId,
      listingId: incidents.listingId,
      reportedByOrganisationId: incidents.reportedByOrganisationId,
      reportedByUserId: incidents.reportedByUserId,
      incidentDate: incidents.incidentDate,
      incidentLocation: incidents.incidentLocation,
      type: incidents.type,
      summary: incidents.summary,
      immediateAction: incidents.immediateAction,
      responsiblePerson: incidents.responsiblePerson,
      status: incidents.status,
      investigationFindings: incidents.investigationFindings,
      correctiveActions: incidents.correctiveActions,
      preventativeMeasures: incidents.preventativeMeasures,
      complianceReview: incidents.complianceReview,
      dateClosed: incidents.dateClosed,
      resolvedAt: incidents.resolvedAt,

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
      and(
        eq(incidents.id, params.incidentId),
        or(
          eq(incidents.organisationId, organisationId),
          eq(incidents.reportedByOrganisationId, organisationId),
          eq(carrierAssignments.organisationId, organisationId),
          eq(carrierAssignments.assignedByOrganisationId, organisationId),
          eq(carrierAssignments.managerOrganisationId, organisationId),
          eq(carrierAssignments.carrierOrganisationId, organisationId),
        ),
      ),
    )
    .limit(1);

  if (!incident) {
    notFound();
  }

  const isOpen = isOpenStatus(incident.status);
  const canResolve =
    isOpen && canResolveIncidentForOrg(incident, organisationId);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32 pl-[24vw] text-black">
      <div className="space-y-8">
        <section className="rounded-3xl bg-black p-8 text-white shadow-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Incident Detail
              </p>

              <h1 className="mt-3 text-3xl font-semibold">
                {incident.listingName ?? "Assignment incident"}
              </h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Review the incident, record investigation findings and resolve
                it so the linked assignment can continue.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <HeaderPill>{formatLabel(incident.type)}</HeaderPill>
                <HeaderPill>{formatLabel(incident.status)}</HeaderPill>
                <HeaderPill>
                  Assignment: {formatLabel(incident.assignmentStatus)}
                </HeaderPill>
              </div>
            </div>

            <Link
              href="/home/operations/incidents"
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Back to incidents
            </Link>
          </div>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
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
            label="Status"
            value={formatLabel(incident.status)}
            className={getStatusClass(incident.status)}
          />
        </section>

        <section className="rounded-3xl border border-black/10 bg-white p-8 shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Incident report
          </p>

          <h2 className="mt-3 text-2xl font-semibold text-black">
            {formatLabel(incident.type)}
          </h2>

          <div className="mt-6 space-y-5 text-sm leading-6 text-black/60">
            <Block label="Summary" value={incident.summary} />
            <Block
              label="Immediate action"
              value={incident.immediateAction ?? "Not recorded"}
            />
            <Block
              label="Responsible person"
              value={incident.responsiblePerson ?? "Not recorded"}
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={`/home/operations/assignments/${incident.assignmentId}`}
              className="rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
            >
              View assignment →
            </Link>

            <Link
              href={`/home/marketplace/browse/${incident.listingId}`}
              className="rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
            >
              View listing →
            </Link>
          </div>
        </section>

        {canResolve && <ResolveIncidentForm incident={incident} />}

        {isOpen && !canResolve && (
          <section className="rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800 shadow-sm">
            <p className="font-semibold">Resolution unavailable</p>

            <p className="mt-2 max-w-3xl text-sm leading-6">
              Your organisation can view this incident, but this workflow
              requires the generator, assigned organisation or manager side to
              formally close it.
            </p>
          </section>
        )}

        {!isOpen && (
          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 text-emerald-800 shadow-sm">
            <p className="text-xs uppercase tracking-[0.25em]">
              Resolution complete
            </p>

            <h2 className="mt-3 text-2xl font-semibold">
              Incident has been resolved
            </h2>

            <div className="mt-6 space-y-4 text-sm leading-6">
              <Block
                label="Investigation findings"
                value={incident.investigationFindings ?? "Not recorded"}
              />
              <Block
                label="Corrective actions"
                value={incident.correctiveActions ?? "Not recorded"}
              />
              <Block
                label="Preventative measures"
                value={incident.preventativeMeasures ?? "Not recorded"}
              />
              <Block
                label="Compliance review"
                value={incident.complianceReview ?? "Not recorded"}
              />
              <Block
                label="Closed"
                value={formatDate(incident.dateClosed ?? incident.resolvedAt)}
              />
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

function ResolveIncidentForm({ incident }: { incident: IncidentDetailRow }) {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <form
      action={resolveIncidentDetailAction}
      className="rounded-3xl border border-orange-200 bg-orange-50 p-8 shadow-sm"
    >
      <input type="hidden" name="incidentId" value={incident.id} />
      <input type="hidden" name="assignmentId" value={incident.assignmentId} />

      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-700">
        Resolve incident
      </p>

      <h2 className="mt-3 text-2xl font-semibold text-black">
        Close this incident review
      </h2>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-orange-900/70">
        Add the investigation outcome and corrective actions. Once resolved, the
        linked assignment can be completed if no other unresolved incidents
        remain.
      </p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Investigation findings" name="investigationFindings" />
        <Field label="Corrective actions" name="correctiveActions" />
        <Field label="Preventative measures" name="preventativeMeasures" />
        <Field label="Compliance review" name="complianceReview" />
        <Field label="Responsible person" name="responsiblePerson" input />
        <Field
          label="Date closed"
          name="dateClosed"
          input
          type="date"
          defaultValue={today}
        />
      </div>

      <button
        type="submit"
        className="mt-6 rounded-full bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
      >
        Resolve incident
      </button>
    </form>
  );
}

function Field({
  label,
  name,
  input = false,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  input?: boolean;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-semibold text-black">
        {label}
        <span className="ml-1 text-red-500">*</span>
      </span>

      {input ? (
        <input
          name={name}
          type={type}
          required
          defaultValue={defaultValue}
          className={inputClass}
        />
      ) : (
        <textarea
          name={name}
          required
          className={`${inputClass} min-h-28`}
        />
      )}
    </label>
  );
}

function HeaderPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
      {children}
    </span>
  );
}

function Info({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div
      className={`rounded-3xl border bg-white p-6 shadow-sm ${
        className ?? "border-black/10 text-black"
      }`}
    >
      <p className="text-xs uppercase tracking-[0.25em] opacity-60">
        {label}
      </p>

      <p className="mt-3 text-lg font-semibold">{value}</p>
    </div>
  );
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
      <p className="text-xs uppercase tracking-[0.22em] text-black/35">
        {label}
      </p>

      <p className="mt-2 text-sm leading-6 text-black/65">{value}</p>
    </div>
  );
}

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";