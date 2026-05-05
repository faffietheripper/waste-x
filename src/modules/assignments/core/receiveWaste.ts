import { database } from "@/db/database";
import { carrierAssignments, incidents, wasteListings } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

type ReceiveWasteInput = {
  assignmentId: string;
  organisationId: string;
  verificationCode: string;
};

export async function receiveWaste({
  assignmentId,
  organisationId,
  verificationCode,
}: ReceiveWasteInput) {
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

  if (!isManager) {
    return {
      success: false,
      message: "Only the assigned manager can confirm waste receipt.",
    };
  }

  if (assignment.status !== "in_progress") {
    return {
      success: false,
      message: "Waste can only be received once collection is in progress.",
    };
  }

  if (!assignment.verificationCode) {
    return {
      success: false,
      message: "No verification code has been generated for this assignment.",
    };
  }

  if (assignment.verificationCode !== verificationCode.trim()) {
    return {
      success: false,
      message: "Incorrect verification code.",
    };
  }

  const unresolvedIncident = await database.query.incidents.findFirst({
    where: and(
      eq(incidents.assignmentId, assignmentId),
      ne(incidents.status, "resolved"),
    ),
  });

  if (unresolvedIncident) {
    return {
      success: false,
      message:
        "This assignment cannot be completed while there is an unresolved incident.",
    };
  }

  const now = new Date();

  await database
    .update(carrierAssignments)
    .set({
      status: "completed",
      completedAt: now,
    })
    .where(eq(carrierAssignments.id, assignmentId));

  await database
    .update(wasteListings)
    .set({
      status: "completed",
    })
    .where(eq(wasteListings.id, assignment.listingId));

  return {
    success: true,
    message: "Waste receipt confirmed. Assignment completed.",
  };
}
