import { database } from "@/db/database";
import { incidents, carrierAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function createIncident({
  assignmentId,
  type,
  summary,
  userId,
  organisationId,
}: {
  assignmentId: string;
  type: string;
  summary: string;
  userId: string;
  organisationId: string;
}) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: and(
      eq(carrierAssignments.id, assignmentId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
      eq(carrierAssignments.status, "collected"),
    ),
  });

  if (!assignment) {
    throw new Error("INVALID_ASSIGNMENT");
  }

  await database.insert(incidents).values({
    organisationId,
    assignmentId: assignment.id,
    listingId: assignment.listingId,
    type,
    summary,
    reportedByUserId: userId,
    reportedByOrganisationId: organisationId,
  });

  return { success: true };
}
