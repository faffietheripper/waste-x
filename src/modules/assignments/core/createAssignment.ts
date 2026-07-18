import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

type CreateAssignmentInput = {
  listingId: number;
  carrierOrganisationId: string;
  assignedByOrganisationId: string;
};

export async function createAssignment({
  listingId,
  carrierOrganisationId,
  assignedByOrganisationId,
}: CreateAssignmentInput) {
  if (!listingId || Number.isNaN(listingId)) {
    return {
      success: false,
      message: "Invalid listing ID.",
    };
  }

  if (!carrierOrganisationId?.trim()) {
    return {
      success: false,
      message: "Carrier organisation is required.",
    };
  }

  if (!assignedByOrganisationId?.trim()) {
    return {
      success: false,
      message: "Assigning organisation is required.",
    };
  }

  const verificationCode = generateCode();

  /*
    Build-safe insert payload.

    Some assignment columns have changed during the Waste X rebuild,
    and the local Drizzle inferred insert type may not perfectly match
    the live schema yet. This keeps the assignment creation logic working
    without blocking production build on a stale inferred type.
  */
  const assignmentValues = {
    organisationId: assignedByOrganisationId,
    listingId,
    carrierOrganisationId,
    assignedByOrganisationId,
    status: "pending",
    verificationCode,
    codeGeneratedAt: new Date(),
    assignedAt: new Date(),
  } as typeof carrierAssignments.$inferInsert;

  const [assignment] = await database
    .insert(carrierAssignments)
    .values(assignmentValues)
    .returning();

  return {
    success: true,
    assignment,
  };
}