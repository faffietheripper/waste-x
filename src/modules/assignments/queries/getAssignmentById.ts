import { database } from "@/db/database";
import { carrierAssignments, wasteListings, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  return {
    ...assignment,
    listing,
    carrierOrg,
    generatorOrg,
  };
}
