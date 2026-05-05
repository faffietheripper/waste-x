import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type AssignManagerFromBidInput = {
  listingId: number;
  managerOrganisationId: string;
  assignedByOrganisationId: string;
  bidId: number;
};

export async function assignManagerFromBid({
  listingId,
  managerOrganisationId,
  assignedByOrganisationId,
  bidId,
}: AssignManagerFromBidInput) {
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (listing.organisationId !== assignedByOrganisationId) {
    throw new Error("Only the listing owner can assign this listing.");
  }

  if (listing.status !== "open") {
    throw new Error("Only open listings can be assigned.");
  }

  if (listing.assignedCarrierOrganisationId) {
    throw new Error("This listing has already been assigned.");
  }

  const existingAssignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.listingId, listingId),
  });

  if (existingAssignment) {
    throw new Error("This listing already has an assignment.");
  }

  await database.insert(carrierAssignments).values({
    organisationId: listing.organisationId,
    listingId: listing.id,

    managerOrganisationId,
    carrierOrganisationId: null,

    assignedByOrganisationId,
    assignmentMethod: "bid",
    bidId,

    // Pending = waiting for the next required party response.
    // At this stage, that party is the manager.
    status: "pending",
  });

  await database
    .update(wasteListings)
    .set({
      status: "assigned",
      assignmentMethod: "bid",
      winnerBidId: bidId,
      assignedByOrganisationId,
      assignedAt: new Date(),

      /**
       * Temporary lock.
       *
       * This currently stores the manager organisation ID because the listing
       * schema does not yet have assignedManagerOrganisationId.
       *
       * Long term, add assignedManagerOrganisationId and stop using this field
       * for manager assignment.
       */
      assignedCarrierOrganisationId: managerOrganisationId,
    })
    .where(eq(wasteListings.id, listing.id));

  return {
    success: true,
  };
}
