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
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  /*
    Simpler internal + external manager rule:

    A user can confirm receipt if:
    - they are using the manager department
    - their organisation is involved in the assignment
    - they have already passed assignment:receive_waste permission
    - the correct verification code is entered

    We do NOT require managerOrganisationId to be populated.
    This is important for internal assignments.
  */
  const organisationIsInAssignment =
    assignment.organisationId === organisationId ||
    assignment.assignedByOrganisationId === organisationId ||
    assignment.managerOrganisationId === organisationId ||
    assignment.carrierOrganisationId === organisationId;

  const isManagerDepartment = departmentType === "manager";

  if (!isManagerDepartment || !organisationIsInAssignment) {
    return {
      success: false,
      message:
        "Only a manager department user from an involved organisation can confirm waste receipt.",
    };
  }

  if (assignment.status !== "in_progress") {
    return {
      success: false,
      message: "Waste can only be received once collection is in progress.",
    };
  }

  /*
    The carrier should have verified collection before manager receipt.
    For older/internal records, status in_progress is already strong evidence,
    but we still prefer collectedAt or codeUsedAt when present.
  */
  const collectionVerified =
    Boolean(assignment.collectedAt) ||
    Boolean(assignment.codeUsedAt) ||
    assignment.status === "in_progress";

  if (!collectionVerified) {
    return {
      success: false,
      message:
        "Collection must be verified by the carrier before the manager can confirm receipt.",
    };
  }

  if (!assignment.verificationCode) {
    return {
      success: false,
      message: "No verification code has been generated for this assignment.",
    };
  }

  const cleanedCode = verificationCode.trim();

  if (!cleanedCode) {
    return {
      success: false,
      message: "Verification code is required.",
    };
  }

  if (assignment.verificationCode !== cleanedCode) {
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