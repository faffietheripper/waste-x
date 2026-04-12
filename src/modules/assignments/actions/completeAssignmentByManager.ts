import { database } from "@/db/database";
import { carrierAssignments, wasteListings, incidents } from "@/db/schema";
import { eq, and, or, isNotNull } from "drizzle-orm";

export async function completeAssignmentByManager({
  listingId,
  verificationCode,
}: {
  listingId: number;
  verificationCode: string;
}) {
  if (!listingId) throw new Error("INVALID_LISTING_ID");
  if (!verificationCode) throw new Error("VERIFICATION_CODE_REQUIRED");

  /* ===============================
     FIND ASSIGNMENT
  ============================== */

  const assignment = await database.query.carrierAssignments.findFirst({
    where: and(
      eq(carrierAssignments.listingId, listingId),
      eq(carrierAssignments.verificationCode, verificationCode),
      isNotNull(carrierAssignments.collectedAt),
    ),
  });

  if (!assignment) {
    throw new Error("INVALID_CODE_OR_NOT_COLLECTED");
  }

  /* ===============================
     INCIDENT BLOCK
  ============================== */

  const openIncident = await database.query.incidents.findFirst({
    where: and(
      eq(incidents.assignmentId, assignment.id),
      or(eq(incidents.status, "open"), eq(incidents.status, "under_review")),
    ),
  });

  if (openIncident) {
    throw new Error("INCIDENT_BLOCKING_COMPLETION");
  }

  /* ===============================
     COMPLETE FLOW
  ============================== */

  await database.transaction(async (tx) => {
    // ✅ assignment is source of truth
    await tx
      .update(carrierAssignments)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(carrierAssignments.id, assignment.id));

    // 🔁 listing is just state reflection
    await tx
      .update(wasteListings)
      .set({
        status: "completed",
      })
      .where(eq(wasteListings.id, listingId));
  });

  return { success: true };
}
