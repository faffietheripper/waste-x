import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function getWinningBid(listingId: number) {
  if (!listingId || Number.isNaN(listingId)) {
    return { winningBid: null };
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
    columns: {
      id: true,
      winnerBidId: true,
    },
  });

  if (!listing?.winnerBidId) {
    return { winningBid: null };
  }

  const winning = await database.query.bids.findFirst({
    where: eq(bids.id, listing.winnerBidId),
    with: {
      organisation: true,
    },
  });

  if (!winning) {
    return { winningBid: null };
  }

  return {
    winningBid: {
      amount: winning.amount,
      companyName: winning.organisation?.teamName ?? "Unknown",
      emailAddress: winning.organisation?.emailAddress ?? "N/A",
    },
  };
}