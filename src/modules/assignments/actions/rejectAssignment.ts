import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function rejectAssignment({
  listingId,
  organisationId,
}: {
  listingId: number;
  organisationId: string;
}) {
  await database
    .delete(carrierAssignments)
    .where(
      and(
        eq(carrierAssignments.listingId, listingId),
        eq(carrierAssignments.carrierOrganisationId, organisationId),
      ),
    );

  return { success: true };
}
