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
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) throw new Error("LISTING_NOT_FOUND");

  if (await isBidOver(listing)) {
    throw new Error("BIDDING_CLOSED");
  }

  await database.transaction(async (tx) => {
    const latestListing = await tx.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!latestListing) throw new Error("LISTING_NOT_FOUND");

    const currentBid = latestListing.currentBid ?? 0;

    if (amount <= currentBid) {
      throw new Error("BID_TOO_LOW");
    }

    await tx.insert(bids).values({
      amount,
      listingId,
      userId,
      organisationId,
      status: "active",
    });

    await tx
      .update(wasteListings)
      .set({
        currentBid: amount,
      })
      .where(eq(wasteListings.id, listingId));
  });

  return { success: true };
}
