import { database } from "@/db/database";
import { incidents, carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createIncident({
  assignmentId,
  type,
  summary,
  userId,
  organisationId,
  incidentDate,
  incidentLocation,
  immediateAction,
  responsiblePerson,
}: {
  assignmentId: string;
  type: string;
  summary: string;
  userId: string;
  organisationId: string;
  incidentDate?: Date | null;
  incidentLocation?: string | null;
  immediateAction?: string | null;
  responsiblePerson?: string | null;
}) {
  if (!assignmentId) throw new Error("ASSIGNMENT_REQUIRED");
  if (!type.trim()) throw new Error("INCIDENT_TYPE_REQUIRED");
  if (!summary.trim()) throw new Error("INCIDENT_SUMMARY_REQUIRED");

  const [assignment] = await database
    .select()
    .from(carrierAssignments)
    .where(eq(carrierAssignments.id, assignmentId))
    .limit(1);

  if (!assignment) {
    throw new Error("INVALID_ASSIGNMENT");
  }

  const organisationIsInvolved =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId;

  if (!organisationIsInvolved) {
    throw new Error("INVALID_ASSIGNMENT");
  }

  const incidentAllowedStatuses = ["accepted", "in_progress"];

  if (!incidentAllowedStatuses.includes(assignment.status)) {
    throw new Error("INVALID_ASSIGNMENT_STATUS");
  }

  const [existingOpenIncident] = await database
    .select({
      id: incidents.id,
      status: incidents.status,
    })
    .from(incidents)
    .where(eq(incidents.assignmentId, assignment.id))
    .limit(1);

  if (
    existingOpenIncident &&
    ["open", "under_review"].includes(existingOpenIncident.status)
  ) {
    throw new Error("OPEN_INCIDENT_ALREADY_EXISTS");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  if (!listing) {
    throw new Error("LISTING_NOT_FOUND");
  }

  const [incident] = await database
    .insert(incidents)
    .values({
      organisationId,
      assignmentId: assignment.id,
      listingId: assignment.listingId,

      reportedByUserId: userId,
      reportedByOrganisationId: organisationId,

      incidentDate: incidentDate ?? new Date(),
      incidentLocation: incidentLocation?.trim() || null,

      type: type.trim(),
      summary: summary.trim(),

      immediateAction: immediateAction?.trim() || null,
      responsiblePerson: responsiblePerson?.trim() || null,

      status: "open",
    })
    .returning();

  return {
    success: true,
    message: "Incident reported successfully",
    incident,
    assignment,
    listing,
    generatorOrganisationId: assignment.organisationId,
    managerOrganisationId: assignment.managerOrganisationId,
    carrierOrganisationId: assignment.carrierOrganisationId,
  };
}