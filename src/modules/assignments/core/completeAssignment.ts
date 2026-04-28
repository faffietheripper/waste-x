import { database } from "@/db/database";
import { carrierAssignments, wasteListings, incidents } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";

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
    throw new Error("Assignment not found.");
  }

  if (assignment.status !== "in_progress") {
    throw new Error("Only in-progress assignments can be completed.");
  }

  const [unresolvedIncident] = await database
    .select()
    .from(incidents)
    .where(
      and(
        eq(incidents.assignmentId, assignmentId),
        ne(incidents.status, "resolved"),
      ),
    );

  if (unresolvedIncident) {
    throw new Error(
      "This assignment cannot be completed while an incident is still unresolved.",
    );
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
    message: "Assignment completed successfully.",
  };
}
