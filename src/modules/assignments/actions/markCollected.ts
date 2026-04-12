import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function markCollected({
  listingId,
  verificationCode,
}: {
  listingId: number;
  verificationCode: string;
}) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: and(
      eq(carrierAssignments.listingId, listingId),
      eq(carrierAssignments.verificationCode, verificationCode),
      eq(carrierAssignments.status, "accepted"),
    ),
  });

  if (!assignment) {
    throw new Error("INVALID_VERIFICATION_CODE");
  }

  await database
    .update(carrierAssignments)
    .set({
      status: "collected",
      collectedAt: new Date(),
      codeUsedAt: new Date(),
    })
    .where(eq(carrierAssignments.id, assignment.id));

  return { success: true };
}
