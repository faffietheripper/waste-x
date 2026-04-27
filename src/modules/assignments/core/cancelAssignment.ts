import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function completeAssignment({
  assignmentId,
}: {
  assignmentId: string;
}) {
  const [assignment] = await database
    .select()
    .from(carrierAssignments)
    .where(eq(carrierAssignments.id, assignmentId));

  if (!assignment) {
    throw new Error("ASSIGNMENT_NOT_FOUND");
  }

  if (assignment.status !== "in_progress") {
    throw new Error("INVALID_STATE");
  }

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(carrierAssignments)
      .set({
        status: "completed",
        completedAt: now,
      })
      .where(eq(carrierAssignments.id, assignmentId));

    await tx
      .update(wasteListings)
      .set({
        status: "completed",
      })
      .where(eq(wasteListings.id, assignment.listingId));
  });

  return {
    success: true,
    message: "Assignment completed successfully",
  };
}
