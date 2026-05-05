import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type RejectAssignmentInput = {
  assignmentId: string;
  organisationId: string;
};

export async function rejectAssignment({
  assignmentId,
  organisationId,
}: RejectAssignmentInput) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  const isManager = assignment.managerOrganisationId === organisationId;
  const isCarrier = assignment.carrierOrganisationId === organisationId;

  /**
   * MANAGER REJECTS BEFORE ACCEPTING
   *
   * Listing gets reopened because manager refused the job.
   */
  if (
    assignment.status === "pending" &&
    isManager &&
    !assignment.managerAcceptedAt &&
    !assignment.carrierOrganisationId
  ) {
    await database
      .update(carrierAssignments)
      .set({
        status: "rejected",
      })
      .where(eq(carrierAssignments.id, assignmentId));

    await database
      .update(wasteListings)
      .set({
        status: "open",
        assignedCarrierOrganisationId: null,
        assignedByOrganisationId: null,
        assignedAt: null,
        winnerBidId: null,
        assignmentMethod: null,
      })
      .where(eq(wasteListings.id, assignment.listingId));

    return {
      success: true,
      message: "Manager assignment rejected. Listing has been reopened.",
    };
  }

  /**
   * CARRIER REJECTS
   *
   * Manager keeps the job.
   * Carrier is cleared.
   * Assignment returns to pending manager-controlled state.
   */
  if (
    assignment.status === "pending" &&
    isCarrier &&
    !!assignment.carrierOrganisationId
  ) {
    await database
      .update(carrierAssignments)
      .set({
        carrierOrganisationId: null,
        carrierAssignedAt: null,
        respondedAt: null,
      })
      .where(eq(carrierAssignments.id, assignmentId));

    return {
      success: true,
      message:
        "Carrier rejected the job. The manager can assign another carrier.",
    };
  }

  return {
    success: false,
    message: "You are not allowed to reject this assignment at this stage.",
  };
}
