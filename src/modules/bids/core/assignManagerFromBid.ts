import { database } from "@/db/database";
import { carrierAssignments, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type AssignManagerFromBidInput = {
  listingId: number;
  managerOrganisationId: string;
  assignedByOrganisationId: string;
  bidId: number;
};

const ASSIGNABLE_LISTING_STATUSES = ["draft", "open"];

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

  /*
    MVP RULE:
    draft and open are both currently assignable.
    Later, once preview/publish exists, only open should be assignable.
  */
  if (!ASSIGNABLE_LISTING_STATUSES.includes(listing.status ?? "")) {
    throw new Error("This listing is no longer available for assignment.");
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

  /*
    Create assignment record.

    At this stage:
    - managerOrganisationId is set
    - carrierOrganisationId is null
    - status is pending, meaning waiting for manager response
  */
  await database.insert(carrierAssignments).values({
    organisationId: listing.organisationId,
    listingId: listing.id,

    managerOrganisationId,

    carrierOrganisationId: null,

    assignedByOrganisationId,
    assignmentMethod: "bid",
    bidId,
    status: "pending",
  });

  /*
    Lock listing so nobody else can bid/assign it.

    NOTE:
    assignedCarrierOrganisationId is temporarily being used as an assignment
    lock because the listing schema does not yet have assignedManagerOrganisationId.
  */
  await database
    .update(wasteListings)
    .set({
      status: "assigned",
      assignmentMethod: "bid",
      winnerBidId: bidId,
      assignedByOrganisationId,
      assignedAt: new Date(),
      assignedCarrierOrganisationId: managerOrganisationId,
    })
    .where(eq(wasteListings.id, listing.id));

  return {
    success: true,
  };
}
