import { database } from "@/db/database";
import { incidents, carrierAssignments, wasteListings } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

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
    .where(
      and(
        eq(carrierAssignments.id, assignmentId),
        eq(carrierAssignments.carrierOrganisationId, organisationId),
        inArray(carrierAssignments.status, ["accepted", "in_progress"]),
      ),
    );

  if (!assignment) {
    throw new Error("INVALID_ASSIGNMENT");
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