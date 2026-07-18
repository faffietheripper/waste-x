import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { and, desc, eq, isNotNull } from "drizzle-orm";

export async function getActiveAssignmentsForCarrier(organisationId: string) {
  if (!organisationId) return [];

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

        /*
          Current Waste X lifecycle:
          - pending / assigned / accepted = not collected yet
          - in_progress = collected and movement is active
          - completed = received/completed
        */
        eq(carrierAssignments.status, "in_progress"),

        /*
          Incident reporting should only be available after collection
          has actually been verified.
        */
        isNotNull(carrierAssignments.collectedAt),
      ),
    )
    .orderBy(desc(carrierAssignments.assignedAt));
}