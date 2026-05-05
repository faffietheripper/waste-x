import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type CancelAssignmentInput = {
  assignmentId: string;
  organisationId: string;
};

export async function cancelAssignment({
  assignmentId,
  organisationId,
}: CancelAssignmentInput) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  const isGenerator =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId;

  if (!isGenerator) {
    return {
      success: false,
      message: "Only the assigning organisation can cancel this assignment.",
    };
  }

  if (["completed", "cancelled", "rejected"].includes(assignment.status)) {
    return {
      success: false,
      message: "This assignment can no longer be cancelled.",
    };
  }

  await database
    .update(carrierAssignments)
    .set({
      status: "cancelled",
    })
    .where(eq(carrierAssignments.id, assignmentId));

  await database
    .update(wasteListings)
    .set({
      status: "cancelled",
    })
    .where(eq(wasteListings.id, assignment.listingId));

  return {
    success: true,
    message: "Assignment cancelled successfully.",
  };
}
