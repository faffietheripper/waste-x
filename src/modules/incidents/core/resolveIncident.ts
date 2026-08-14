import { database } from "@/db/database";
import { incidents, carrierAssignments, wasteListings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function resolveIncident({
  incidentId,
  assignmentId,
  organisationId,
  userId,
  investigationFindings,
  correctiveActions,
  preventativeMeasures,
  complianceReview,
  responsiblePerson,
  dateClosed,
}: {
  incidentId: string;
  assignmentId: string;
  organisationId: string;
  userId: string;
  investigationFindings: string;
  correctiveActions: string;
  preventativeMeasures: string;
  complianceReview: string;
  responsiblePerson: string;
  dateClosed: Date;
}) {
  if (!incidentId) throw new Error("INCIDENT_REQUIRED");
  if (!assignmentId) throw new Error("ASSIGNMENT_REQUIRED");

  if (!investigationFindings.trim()) {
    throw new Error("INVESTIGATION_FINDINGS_REQUIRED");
  }

  if (!correctiveActions.trim()) {
    throw new Error("CORRECTIVE_ACTIONS_REQUIRED");
  }

  if (!preventativeMeasures.trim()) {
    throw new Error("PREVENTATIVE_MEASURES_REQUIRED");
  }

  if (!complianceReview.trim()) {
    throw new Error("COMPLIANCE_REVIEW_REQUIRED");
  }

  if (!responsiblePerson.trim()) {
    throw new Error("RESPONSIBLE_PERSON_REQUIRED");
  }

  const [assignment] = await database
    .select()
    .from(carrierAssignments)
    .where(eq(carrierAssignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new Error("ASSIGNMENT_NOT_FOUND");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  if (!listing) {
    throw new Error("LISTING_NOT_FOUND");
  }

  /*
    Incident resolution is intentionally broader than incident reporting.

    Allowed to resolve:
    - generator / original assignment owner
    - organisation that assigned the job
    - manager / receiver organisation
    - carrier organisation only if it is also the same organisation as the manager/generator
      in solo/internal workflows

    This keeps normal carrier-only reporting separate from formal closure,
    but allows solo workflows to close their own incidents.
  */
  const organisationIsGeneratorSide =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId;

  const organisationIsManagerSide =
    assignment.managerOrganisationId === organisationId;

  const organisationIsSoloOrInternalCarrierSide =
    assignment.carrierOrganisationId === organisationId &&
    (assignment.managerOrganisationId === organisationId ||
      assignment.organisationId === organisationId ||
      assignment.assignedByOrganisationId === organisationId);

  const canResolve =
    organisationIsGeneratorSide ||
    organisationIsManagerSide ||
    organisationIsSoloOrInternalCarrierSide;

  if (!canResolve) {
    throw new Error("UNAUTHORISED_TO_RESOLVE_INCIDENT");
  }

  const [incident] = await database
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.id, incidentId),
        eq(incidents.assignmentId, assignmentId),
      ),
    )
    .limit(1);

  if (!incident) {
    throw new Error("INCIDENT_NOT_FOUND");
  }

  if (incident.status === "resolved") {
    throw new Error("INCIDENT_ALREADY_RESOLVED");
  }

  if (incident.status === "rejected") {
    throw new Error("INCIDENT_ALREADY_REJECTED");
  }

  const now = new Date();

  const [updatedIncident] = await database
    .update(incidents)
    .set({
      investigationFindings: investigationFindings.trim(),
      correctiveActions: correctiveActions.trim(),
      preventativeMeasures: preventativeMeasures.trim(),
      complianceReview: complianceReview.trim(),
      responsiblePerson: responsiblePerson.trim(),
      dateClosed,
      status: "resolved",
      resolvedByUserId: userId,
      resolvedAt: now,
    })
    .where(eq(incidents.id, incidentId))
    .returning();

  return {
    success: true,
    message: "Incident resolved successfully",
    incident: updatedIncident,
    assignment,
    listing,
    generatorOrganisationId: assignment.organisationId,
    managerOrganisationId: assignment.managerOrganisationId,
    carrierOrganisationId: assignment.carrierOrganisationId,
  };
}