import { database } from "@/db/database";
import { incidents, carrierAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function resolveIncident({
  incidentId,
  assignmentId,
  userId,
  notes,
}: {
  incidentId: string;
  assignmentId: string;
  userId: string;
  notes: string;
}) {
  if (!notes || notes.trim().length < 10) {
    throw new Error("INVALID_NOTES");
  }

  await database.transaction(async (tx) => {
    await tx
      .update(incidents)
      .set({
        status: "resolved",
        correctiveActions: notes,
        resolvedAt: new Date(),
        resolvedByUserId: userId,
        dateClosed: new Date(),
      })
      .where(eq(incidents.id, incidentId));

    await tx
      .update(carrierAssignments)
      .set({
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(carrierAssignments.id, assignmentId));
  });

  return { success: true };
}
