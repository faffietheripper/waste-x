import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { and, eq, ne } from "drizzle-orm";
import { assignManagerFromBid } from "./assignManagerFromBid";

type Input = {
  listingId: number;
  bidId: number;
};

type Context = {
  organisationId: string;
};

export async function selectBid(input: Input, ctx: Context) {
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, input.listingId),
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (listing.organisationId !== ctx.organisationId) {
    throw new Error("Not authorised.");
  }

  if (listing.status !== "open") {
    throw new Error("Only open listings can be assigned.");
  }

  if (listing.assignedCarrierOrganisationId) {
    throw new Error("This listing has already been assigned.");
  }

  const bid = await database.query.bids.findFirst({
    where: and(eq(bids.id, input.bidId), eq(bids.listingId, input.listingId)),
  });

  if (!bid) {
    throw new Error("Bid not found.");
  }

  if (bid.status !== "active") {
    throw new Error("This bid is no longer active.");
  }

  if (bid.organisationId === ctx.organisationId) {
    throw new Error("You cannot assign your own organisation.");
  }

  await assignManagerFromBid({
    listingId: input.listingId,
    managerOrganisationId: bid.organisationId,
    assignedByOrganisationId: ctx.organisationId,
    bidId: bid.id,
  });

  await database
    .update(bids)
    .set({
      status: "accepted",
    })
    .where(eq(bids.id, input.bidId));

  await database
    .update(bids)
    .set({
      status: "rejected",
    })
    .where(
      and(
        eq(bids.listingId, input.listingId),
        ne(bids.id, input.bidId),
        eq(bids.status, "active"),
      ),
    );

  return {
    success: true,
    message:
      "Winning bid assigned as waste manager. Waiting for manager response.",
  };
}
