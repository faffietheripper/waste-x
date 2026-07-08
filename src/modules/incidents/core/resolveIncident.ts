import { database } from "@/db/database";
import {
  incidents,
  carrierAssignments,
  wasteListings,
} from "@/db/schema";
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
    .where(eq(carrierAssignments.id, assignmentId));

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
    Generator/compliance or assigned manager can resolve an incident.

    Carrier reports the incident, but the receiving/generator side should
    formally close it after review.
  */
  const canResolve =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId;

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
    );

  if (!incident) {
    throw new Error("INCIDENT_NOT_FOUND");
  }

  if (incident.status === "resolved") {
    throw new Error("INCIDENT_ALREADY_RESOLVED");
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