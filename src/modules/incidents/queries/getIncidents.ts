import { database } from "@/db/database";
import { incidents, carrierAssignments, wasteListings } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function getIncidentsByOrganisation(organisationId: string) {
  return database
    .select({
      id: incidents.id,
      type: incidents.type,
      summary: incidents.summary,
      status: incidents.status,
      createdAt: incidents.createdAt,

      listingName: wasteListings.name,
      listingId: wasteListings.id,
      location: wasteListings.location,
      assignmentId: carrierAssignments.id,
    })
    .from(incidents)
    .innerJoin(
      carrierAssignments,
      eq(incidents.assignmentId, carrierAssignments.id),
    )
    .innerJoin(
      wasteListings,
      eq(carrierAssignments.listingId, wasteListings.id),
    )
    .where(eq(incidents.reportedByOrganisationId, organisationId))
    .orderBy(desc(incidents.createdAt));
}
