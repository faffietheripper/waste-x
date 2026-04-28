import { auth } from "@/auth";
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { alias } from "drizzle-orm/pg-core";
import { eq, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  incidents,
  carrierAssignments,
  wasteListings,
  organisations,
  users,
} from "@/db/schema";

import IncidentResolutionForm from "@/components/app/CarrierHub/IncidentResolutionForm";

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";
  return new Date(date).toLocaleString();
}

function formatLabel(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value.replaceAll("_", " ");
}

function getStatusClass(status: string) {
  if (status === "resolved") {
    return "bg-green-100 text-green-700 border-green-200";
  }

  if (status === "under_review") {
    return "bg-yellow-100 text-yellow-700 border-yellow-200";
  }

  if (status === "rejected") {
    return "bg-gray-100 text-gray-700 border-gray-200";
  }

  return "bg-red-100 text-red-700 border-red-200";
}

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
  const departmentType = session.user.activeDepartment?.type ?? null;

  const carrierOrg = alias(organisations, "carrierOrg");
  const generatorOrg = alias(organisations, "generatorOrg");
  const reporterOrg = alias(organisations, "reporterOrg");

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

      assignmentStatus: carrierAssignments.status,
      assignmentMethod: carrierAssignments.assignmentMethod,
      assignmentAssignedAt: carrierAssignments.assignedAt,
      assignmentCarrierOrgId: carrierAssignments.carrierOrganisationId,
      assignmentGeneratorOrgId: carrierAssignments.organisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,

      carrierOrgName: carrierOrg.teamName,
      generatorOrgName: generatorOrg.teamName,
      reporterOrgName: reporterOrg.teamName,

      reportedByUserName: users.name,
      reportedByUserEmail: users.email,
    })
    .from(incidents)
    .innerJoin(
      carrierAssignments,
      eq(incidents.assignmentId, carrierAssignments.id),
    )
    .innerJoin(wasteListings, eq(incidents.listingId, wasteListings.id))
    .innerJoin(
      carrierOrg,
      eq(carrierAssignments.carrierOrganisationId, carrierOrg.id),
    )
    .innerJoin(
      generatorOrg,
      eq(carrierAssignments.organisationId, generatorOrg.id),
    )
    .innerJoin(
      reporterOrg,
      eq(incidents.reportedByOrganisationId, reporterOrg.id),
    )
    .innerJoin(users, eq(incidents.reportedByUserId, users.id))
    .where(eq(incidents.id, params.id));

  if (!incident) {
    notFound();
  }

  const canAccess =
    incident.organisationId === organisationId ||
    incident.reportedByOrganisationId === organisationId ||
    incident.assignmentCarrierOrgId === organisationId ||
    incident.assignmentGeneratorOrgId === organisationId ||
    incident.assignedByOrganisationId === organisationId;

  if (!canAccess) {
    notFound();
  }

  const isResolved = incident.status === "resolved";

  const canResolve =
    !isResolved &&
    (departmentType === "generator" || departmentType === "compliance");

  return (
    <main className="pl-[24vw] py-32 px-12 space-y-8">
      <Link
        href={`/home/operations/assignments/${incident.assignmentId}`}
        className="text-sm text-gray-500 hover:text-black"
      >
        ← Back to assignment
      </Link>

      {/* HEADER */}
      <div className="bg-white border rounded-2xl p-8 space-y-5">
        <div className="flex items-start justify-between gap-6">
          <div>
            <h1 className="text-3xl font-semibold">Incident Details</h1>

            <p className="text-sm text-gray-500 mt-2">
              {incident.listingName} · {incident.listingLocation}
            </p>
          </div>

          <span
            className={`rounded-full border px-4 py-2 text-sm font-medium capitalize ${getStatusClass(
              incident.status,
            )}`}
          >
            {formatLabel(incident.status)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-6 text-sm pt-4">
          <div>
            <p className="text-gray-400">Incident Type</p>
            <p className="font-medium capitalize">
              {formatLabel(incident.type)}
            </p>
          </div>

          <div>
            <p className="text-gray-400">Incident Date</p>
            <p className="font-medium">{formatDate(incident.incidentDate)}</p>
          </div>

          <div>
            <p className="text-gray-400">Reported By</p>
            <p className="font-medium">{incident.reporterOrgName}</p>
          </div>

          <div>
            <p className="text-gray-400">Reported User</p>
            <p className="font-medium">
              {incident.reportedByUserName} · {incident.reportedByUserEmail}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-8">
        {/* LEFT */}
        <section className="col-span-4 space-y-8">
          {/* JOB CONTEXT */}
          <div className="bg-white border rounded-2xl p-8 space-y-4">
            <h2 className="text-xl font-semibold">Job Context</h2>

            <div className="grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-gray-400">Listing</p>
                <p className="font-medium">{incident.listingName}</p>
              </div>

              <div>
                <p className="text-gray-400">Location</p>
                <p className="font-medium">{incident.listingLocation}</p>
              </div>

              <div>
                <p className="text-gray-400">Generator</p>
                <p className="font-medium">{incident.generatorOrgName}</p>
              </div>

              <div>
                <p className="text-gray-400">Carrier</p>
                <p className="font-medium">{incident.carrierOrgName}</p>
              </div>

              <div>
                <p className="text-gray-400">Assignment Status</p>
                <p className="font-medium capitalize">
                  {formatLabel(incident.assignmentStatus)}
                </p>
              </div>

              <div>
                <p className="text-gray-400">Assignment Method</p>
                <p className="font-medium capitalize">
                  {incident.assignmentMethod}
                </p>
              </div>
            </div>
          </div>

          {/* INCIDENT DETAILS */}
          <div className="bg-white border rounded-2xl p-8 space-y-6">
            <h2 className="text-xl font-semibold">Incident Report</h2>

            <div>
              <p className="text-sm text-gray-400">Summary</p>
              <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                {incident.summary}
              </p>
            </div>

            {incident.incidentLocation && (
              <div>
                <p className="text-sm text-gray-400">Incident Location</p>
                <p className="mt-1 text-gray-800">
                  {incident.incidentLocation}
                </p>
              </div>
            )}

            {incident.immediateAction && (
              <div>
                <p className="text-sm text-gray-400">Immediate Action</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {incident.immediateAction}
                </p>
              </div>
            )}

            {incident.responsiblePerson && (
              <div>
                <p className="text-sm text-gray-400">Responsible Person</p>
                <p className="mt-1 text-gray-800">
                  {incident.responsiblePerson}
                </p>
              </div>
            )}
          </div>

          {/* REVIEW / RESOLUTION */}
          <div className="bg-white border rounded-2xl p-8 space-y-6">
            <h2 className="text-xl font-semibold">Review & Resolution</h2>

            {incident.investigationFindings && (
              <div>
                <p className="text-sm text-gray-400">Investigation Findings</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {incident.investigationFindings}
                </p>
              </div>
            )}

            {incident.correctiveActions && (
              <div>
                <p className="text-sm text-gray-400">Corrective Actions</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {incident.correctiveActions}
                </p>
              </div>
            )}

            {incident.preventativeMeasures && (
              <div>
                <p className="text-sm text-gray-400">Preventative Measures</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {incident.preventativeMeasures}
                </p>
              </div>
            )}

            {incident.complianceReview && (
              <div>
                <p className="text-sm text-gray-400">Compliance Review</p>
                <p className="mt-1 text-gray-800 whitespace-pre-wrap">
                  {incident.complianceReview}
                </p>
              </div>
            )}

            {!incident.investigationFindings &&
              !incident.correctiveActions &&
              !incident.preventativeMeasures &&
              !incident.complianceReview && (
                <p className="text-sm text-gray-500">
                  No review information has been added yet.
                </p>
              )}

            {isResolved && (
              <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                <p className="font-semibold">Incident Resolved</p>
                <p className="mt-1">
                  Closed: {formatDate(incident.dateClosed)}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* RIGHT */}
        <aside className="col-span-2 space-y-6">
          <div className="bg-white border rounded-2xl p-6 space-y-3 text-sm">
            <h2 className="font-semibold text-base">Incident Metadata</h2>

            <div>
              <p className="text-gray-400">Incident ID</p>
              <p className="break-all">{incident.id}</p>
            </div>

            <div>
              <p className="text-gray-400">Assignment ID</p>
              <p className="break-all">{incident.assignmentId}</p>
            </div>

            <div>
              <p className="text-gray-400">Created</p>
              <p>{formatDate(incident.createdAt)}</p>
            </div>

            <div>
              <p className="text-gray-400">Resolved</p>
              <p>{formatDate(incident.resolvedAt)}</p>
            </div>
          </div>

          {canResolve && (
            <IncidentResolutionForm
              incidentId={incident.id}
              assignmentId={incident.assignmentId}
            />
          )}

          {!canResolve && !isResolved && (
            <div className="bg-white border rounded-2xl p-6 text-sm text-gray-500">
              This incident is awaiting review.
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
