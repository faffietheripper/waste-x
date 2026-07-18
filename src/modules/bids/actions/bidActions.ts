"use server";

import { and, desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";

export async function deleteBidAction(bidId: number) {
  const user = await requireOrgUser();

  if (!bidId || Number.isNaN(bidId)) {
    return {
      success: false,
      message: "Invalid bid ID.",
    };
  }

  const bid = await database.query.bids.findFirst({
    where: and(eq(bids.id, bidId), eq(bids.userId, user.userId)),
    columns: {
      id: true,
      listingId: true,
      userId: true,
      amount: true,
    },
  });

  if (!bid) {
    return {
      success: false,
      message: "Bid not found or you do not have permission to delete it.",
    };
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, bid.listingId),
    columns: {
      id: true,
      status: true,
      archived: true,
      winnerBidId: true,
    },
  });

  if (!listing) {
    return {
      success: false,
      message: "Listing not found.",
    };
  }

  if (
    listing.status === "assigned" ||
    listing.status === "in_progress" ||
    listing.status === "completed"
  ) {
    return {
      success: false,
      message: "You cannot delete a bid after the listing has been assigned.",
    };
  }

  if (listing.winnerBidId === bid.id) {
    return {
      success: false,
      message: "You cannot delete the winning bid.",
    };
  }

  await database.delete(bids).where(eq(bids.id, bid.id));

  const remainingHighestBid = await database.query.bids.findFirst({
    where: eq(bids.listingId, bid.listingId),
    columns: {
      amount: true,
    },
    orderBy: [desc(bids.amount)],
  });

  await database
    .update(wasteListings)
    .set({
      currentBid: remainingHighestBid?.amount ?? 0,
    })
    .where(eq(wasteListings.id, bid.listingId));

  revalidatePath("/home/my-activity/my-bids");
  revalidatePath("/home/marketplace/browse");
  revalidatePath(`/home/marketplace/browse/${bid.listingId}`);

  return {
    success: true,
    message: "Bid deleted successfully.",
  };
}