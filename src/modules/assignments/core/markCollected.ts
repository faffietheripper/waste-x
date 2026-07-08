import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { and, eq } from "drizzle-orm";

export async function markCollected({
  assignmentId,
  verificationCode,
  organisationId,
}: {
  assignmentId: string;
  verificationCode: string;
  organisationId: string;
}) {
  if (!assignmentId) {
    throw new Error("ASSIGNMENT_ID_REQUIRED");
  }

  if (!verificationCode.trim()) {
    throw new Error("VERIFICATION_CODE_REQUIRED");
  }

  const [assignment] = await database
    .select()
    .from(carrierAssignments)
    .where(
      and(
        eq(carrierAssignments.id, assignmentId),
        eq(carrierAssignments.verificationCode, verificationCode.trim()),
        eq(carrierAssignments.status, "accepted"),
      ),
    );

  if (!assignment) {
    throw new Error("INVALID_VERIFICATION_CODE");
  }

  if (assignment.carrierOrganisationId !== organisationId) {
    throw new Error("Only the assigned carrier can verify collection.");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(carrierAssignments)
      .set({
        status: "in_progress",
        collectedAt: now,
        codeUsedAt: now,
      })
      .where(eq(carrierAssignments.id, assignmentId));

    await tx
      .update(wasteListings)
      .set({
        status: "in_progress",
      })
      .where(eq(wasteListings.id, assignment.listingId));
  });

  return {
    success: true,
    message: "Collection verified successfully.",
    assignment,
    listing,
    generatorOrganisationId: assignment.organisationId,
    managerOrganisationId: assignment.managerOrganisationId,
    carrierOrganisationId: assignment.carrierOrganisationId,
  };
}