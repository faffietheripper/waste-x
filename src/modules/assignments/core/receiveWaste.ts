import { database } from "@/db/database";
import { carrierAssignments, incidents, wasteListings } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

type ReceiveWasteInput = {
  assignmentId: string;
  organisationId: string;
  departmentType: DepartmentType;
  verificationCode: string;
};

export async function receiveWaste({
  assignmentId,
  organisationId,
  departmentType,
  verificationCode,
}: ReceiveWasteInput) {
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

  const organisationIsInAssignment =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId;

  const isManagerDepartment = departmentType === "manager";

  if (!isManagerDepartment || !organisationIsInAssignment) {
    throw new Error(
      "Only a manager department user from an involved organisation can confirm waste receipt.",
    );
  }

  if (assignment.status !== "in_progress") {
    throw new Error("Waste can only be received once collection is in progress.");
  }

  const collectionVerified =
    Boolean(assignment.collectedAt) ||
    Boolean(assignment.codeUsedAt) ||
    assignment.status === "in_progress";

  if (!collectionVerified) {
    throw new Error(
      "Collection must be verified by the carrier before the manager can confirm receipt.",
    );
  }

  if (!assignment.verificationCode) {
    throw new Error("No verification code has been generated for this assignment.");
  }

  const cleanedCode = verificationCode.trim();

  if (!cleanedCode) {
    throw new Error("Verification code is required.");
  }

  /*
    Manager receives waste using the SAME code generated when carrier accepted.
  */
  if (assignment.verificationCode !== cleanedCode) {
    throw new Error("Incorrect verification code.");
  }

  const unresolvedIncident = await database.query.incidents.findFirst({
    where: and(
      eq(incidents.assignmentId, assignmentId),
      ne(incidents.status, "resolved"),
    ),
  });

  if (unresolvedIncident) {
    throw new Error(
      "This assignment cannot be completed while there is an unresolved incident.",
    );
  }

  const now = new Date();

  const [updatedAssignment] = await database
    .update(carrierAssignments)
    .set({
      status: "completed",
      completedAt: now,
    })
    .where(eq(carrierAssignments.id, assignmentId))
    .returning();

  await database
    .update(wasteListings)
    .set({
      status: "completed",
    })
    .where(eq(wasteListings.id, assignment.listingId));

  return {
    success: true,
    message: "Waste receipt confirmed. Assignment completed.",
    assignment: updatedAssignment,
    listing,
    generatorOrganisationId: assignment.organisationId,
    managerOrganisationId: assignment.managerOrganisationId,
    carrierOrganisationId: assignment.carrierOrganisationId,
  };
}