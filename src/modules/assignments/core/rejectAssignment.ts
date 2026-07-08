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
    throw new Error("Assignment not found.");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  const isManager = assignment.managerOrganisationId === organisationId;
  const isCarrier = assignment.carrierOrganisationId === organisationId;

  /*
    =========================================================
    MANAGER REJECTS BEFORE ACCEPTING

    Listing gets reopened because the manager refused the job.
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isManager &&
    !assignment.managerAcceptedAt &&
    !assignment.carrierOrganisationId
  ) {
    const [updatedAssignment] = await database
      .update(carrierAssignments)
      .set({
        status: "rejected",
        respondedAt: new Date(),
      })
      .where(eq(carrierAssignments.id, assignmentId))
      .returning();

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
      event: "manager_rejected" as const,
      message: "Manager assignment rejected. Listing has been reopened.",
      assignment: updatedAssignment,
      listing,
      generatorOrganisationId: assignment.organisationId,
      managerOrganisationId: assignment.managerOrganisationId,
      carrierOrganisationId: assignment.carrierOrganisationId,
    };
  }

  /*
    =========================================================
    CARRIER REJECTS

    Manager keeps the job.
    Carrier is cleared.
    Assignment goes back to manager accepted state.
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isCarrier &&
    !!assignment.carrierOrganisationId &&
    !!assignment.managerAcceptedAt
  ) {
    const [updatedAssignment] = await database
      .update(carrierAssignments)
      .set({
        status: "accepted",
        carrierOrganisationId: null,
        carrierAssignedAt: null,
        respondedAt: null,
      })
      .where(eq(carrierAssignments.id, assignmentId))
      .returning();

    await database
      .update(wasteListings)
      .set({
        /*
          Keep listing locked to the manager organisation after carrier rejects.
          This matches your temporary manager-lock approach.
        */
        assignedCarrierOrganisationId: assignment.managerOrganisationId,
      })
      .where(eq(wasteListings.id, assignment.listingId));

    return {
      success: true,
      event: "carrier_rejected" as const,
      message:
        "Carrier rejected the job. The manager can assign another carrier.",
      assignment: updatedAssignment,
      listing,
      generatorOrganisationId: assignment.organisationId,
      managerOrganisationId: assignment.managerOrganisationId,
      carrierOrganisationId: assignment.carrierOrganisationId,
    };
  }

  throw new Error("You are not allowed to reject this assignment at this stage.");
}