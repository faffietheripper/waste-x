import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function acceptAssignment({
  listingId,
  organisationId,
}: {
  listingId: number;
  organisationId: string;
}) {
  await database
    .update(carrierAssignments)
    .set({
      status: "accepted",
      respondedAt: new Date(),
    })
    .where(
      and(
        eq(carrierAssignments.listingId, listingId),
        eq(carrierAssignments.carrierOrganisationId, organisationId),
        eq(carrierAssignments.status, "pending"),
      ),
    );

  return { success: true };
}
