import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getActiveAssignmentsForCarrier(organisationId: string) {
  return database
    .select({
      assignmentId: carrierAssignments.id,
      listingId: wasteListings.id,
      listingName: wasteListings.name,
      assignedAt: carrierAssignments.assignedAt,
    })
    .from(carrierAssignments)
    .innerJoin(
      wasteListings,
      eq(carrierAssignments.listingId, wasteListings.id),
    )
    .where(
      and(
        eq(carrierAssignments.carrierOrganisationId, organisationId),
        eq(carrierAssignments.status, "collected"),
      ),
    );
}
