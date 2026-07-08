import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { isBidOver } from "@/util/bids";

export async function createBid({
  amount,
  listingId,
  userId,
  organisationId,
}: {
  amount: number;
  listingId: number;
  userId: string;
  organisationId: string;
}) {
  if (!listingId) {
    throw new Error("LISTING_ID_REQUIRED");
  }

  if (!amount || amount <= 0) {
    throw new Error("INVALID_BID_AMOUNT");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    throw new Error("LISTING_NOT_FOUND");
  }

  if (listing.organisationId === organisationId) {
    throw new Error("You cannot bid on your own listing.");
  }

  if (listing.status !== "open") {
    throw new Error("Only open listings can receive bids.");
  }

  if (listing.assignedCarrierOrganisationId) {
    throw new Error("This listing has already been assigned.");
  }

  if (await isBidOver(listing)) {
    throw new Error("BIDDING_CLOSED");
  }

  const result = await database.transaction(async (tx) => {
    const latestListing = await tx.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!latestListing) {
      throw new Error("LISTING_NOT_FOUND");
    }

    if (latestListing.organisationId === organisationId) {
      throw new Error("You cannot bid on your own listing.");
    }

    if (latestListing.status !== "open") {
      throw new Error("Only open listings can receive bids.");
    }

    if (latestListing.assignedCarrierOrganisationId) {
      throw new Error("This listing has already been assigned.");
    }

    const currentBid = latestListing.currentBid ?? 0;

    if (amount <= currentBid) {
      throw new Error("BID_TOO_LOW");
    }

    const [createdBid] = await tx
      .insert(bids)
      .values({
        amount,
        listingId,
        userId,
        organisationId,
        status: "active",
      })
      .returning();

    await tx
      .update(wasteListings)
      .set({
        currentBid: amount,
      })
      .where(eq(wasteListings.id, listingId));

    return {
      bid: createdBid,
      listing: latestListing,
    };
  });

  return {
    success: true,
    bid: result.bid,
    listing: result.listing,
  };
}