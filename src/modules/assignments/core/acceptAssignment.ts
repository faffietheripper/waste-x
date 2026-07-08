import { randomInt } from "crypto";
import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type AcceptAssignmentInput = {
  assignmentId: string;
  organisationId: string;
};

function generateVerificationCode() {
  return randomInt(100000, 999999).toString();
}

export async function acceptAssignment({
  assignmentId,
  organisationId,
}: AcceptAssignmentInput) {
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
    MANAGER ACCEPTANCE

    Manager accepts the listing assignment.
    Status changes from pending → accepted.
    Next step: manager assigns a carrier.
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isManager &&
    !assignment.managerAcceptedAt &&
    !assignment.carrierOrganisationId
  ) {
    const now = new Date();

    const [updatedAssignment] = await database
      .update(carrierAssignments)
      .set({
        status: "accepted",
        managerAcceptedAt: now,
        respondedAt: now,
      })
      .where(eq(carrierAssignments.id, assignmentId))
      .returning();

    return {
      success: true,
      event: "manager_accepted" as const,
      message:
        "Manager assignment accepted. You can now assign a carrier to this job.",
      assignment: updatedAssignment,
      listing,
      generatorOrganisationId: assignment.organisationId,
      managerOrganisationId: assignment.managerOrganisationId,
      carrierOrganisationId: assignment.carrierOrganisationId,
    };
  }

  /*
    =========================================================
    CARRIER ACCEPTANCE

    Carrier accepts the actual collection job.
    Verification code is generated here.

    This code is used by:
    - carrier to verify collection
    - manager to receive waste
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isCarrier &&
    !!assignment.carrierOrganisationId &&
    !!assignment.managerAcceptedAt
  ) {
    const verificationCode = generateVerificationCode();
    const now = new Date();

    const [updatedAssignment] = await database
      .update(carrierAssignments)
      .set({
        status: "accepted",
        respondedAt: now,
        verificationCode,
        codeGeneratedAt: now,
        codeUsedAt: null,
      })
      .where(eq(carrierAssignments.id, assignmentId))
      .returning();

    return {
      success: true,
      event: "carrier_accepted" as const,
      message:
        "Carrier assignment accepted. A verification code has been generated.",
      assignment: updatedAssignment,
      listing,
      verificationCode,
      generatorOrganisationId: assignment.organisationId,
      managerOrganisationId: assignment.managerOrganisationId,
      carrierOrganisationId: assignment.carrierOrganisationId,
    };
  }

  throw new Error("You are not allowed to accept this assignment at this stage.");
}