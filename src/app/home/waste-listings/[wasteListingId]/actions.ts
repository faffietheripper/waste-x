"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { bids, wasteListings, userProfiles, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { isBidOver } from "@/util/bids";
import { createNotification } from "../../notifications/actions";

/* =========================================================
   CREATE BID
========================================================= */

export async function createBidAction({
  amount,
  listingId,
}: {
  amount: number;
  listingId: number;
}) {
  const session = await auth();
  const userId = session?.user?.id;

  if (!userId) {
    return {
      success: false,
      message: "You must be logged in.",
    };
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    return {
      success: false,
      message: "Listing not found.",
    };
  }

  if (await isBidOver(listing)) {
    return {
      success: false,
      message: "Auction is over.",
    };
  }

  const profile = await database.query.userProfiles.findFirst({
    where: eq(userProfiles.userId, userId),
  });

  if (!profile) {
    return {
      success: false,
      message: "Complete your profile before bidding.",
    };
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      organisationId: true,
    },
  });

  if (!user?.organisationId) {
    return {
      success: false,
      message: "User must belong to an organisation.",
    };
  }

  const organisationId = user.organisationId;

  try {
    await database.transaction(async (tx) => {
      /* -----------------------------------------------------
         RACE CONDITION PROTECTION
         Re-check listing inside the transaction
      ----------------------------------------------------- */

      const latestListing = await tx.query.wasteListings.findFirst({
        where: eq(wasteListings.id, listingId),
      });

      if (!latestListing) {
        throw new Error("Listing no longer exists.");
      }

      const currentBid = latestListing.currentBid ?? 0;

      if (amount <= currentBid) {
        throw new Error(`Bid must be higher than £${currentBid}`);
      }

      /* -----------------------------------------------------
         INSERT BID
      ----------------------------------------------------- */

      await tx.insert(bids).values({
        amount,
        listingId: latestListing.id,
        userId,
        organisationId,
      });

      /* -----------------------------------------------------
         UPDATE LISTING CURRENT BID
      ----------------------------------------------------- */

      await tx
        .update(wasteListings)
        .set({
          currentBid: amount,
        })
        .where(eq(wasteListings.id, latestListing.id));

      /* -----------------------------------------------------
         CREATE NOTIFICATION
      ----------------------------------------------------- */

      if (latestListing.userId) {
        await createNotification(
          latestListing.userId,
          "New bid placed",
          `A new bid was placed on "${latestListing.name}"`,
          "NEW_BID",
          latestListing.id,
        );
      }
    });

    revalidatePath(`/home/waste-listings/${listingId}`);

    return {
      success: true,
      message: "Bid placed successfully.",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to place bid.",
    };
  }
}

/* =========================================================
   ASSIGN WINNING BID
========================================================= */

export async function handleAssignWinningBid(formData: FormData) {
  const listingId = Number(formData.get("listingId"));
  const bidId = Number(formData.get("bidId"));

  if (!listingId || !bidId) {
    return {
      success: false,
      message: "Invalid request.",
    };
  }

  const session = await auth();

  if (!session?.user?.id) {
    return {
      success: false,
      message: "Unauthorized.",
    };
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    return {
      success: false,
      message: "Listing not found.",
    };
  }

  if (listing.organisationId !== session.user.organisationId) {
    return {
      success: false,
      message: "Not allowed.",
    };
  }

  const bid = await database.query.bids.findFirst({
    where: eq(bids.id, bidId),
  });

  if (!bid) {
    return {
      success: false,
      message: "Bid not found.",
    };
  }

  await database.transaction(async (tx) => {
    await tx
      .update(wasteListings)
      .set({
        winningBidId: bid.id,
        winningOrganisationId: bid.organisationId,
        assigned: true,
      })
      .where(eq(wasteListings.id, listingId));
  });

  revalidatePath(`/home/waste-listings/${listingId}`);

  return {
    success: true,
    message: "Winning bid assigned.",
  };
}
