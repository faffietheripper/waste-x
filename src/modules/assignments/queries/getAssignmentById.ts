import { database } from "@/db/database";
import { carrierAssignments, wasteListings, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";
import { incidents } from "@/db/schema";

export async function getAssignmentById(assignmentId: string) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) return null;

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  const carrierOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, assignment.carrierOrganisationId),
  });

  const generatorOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, assignment.organisationId),
  });

  const [incident] = await database
    .select({
      id: incidents.id,
    })
    .from(incidents)
    .where(eq(incidents.assignmentId, assignmentId));

  return {
    ...assignment,
    listing,
    carrierOrg,
    generatorOrg,
    hasIncident: !!incident,
  };
}
