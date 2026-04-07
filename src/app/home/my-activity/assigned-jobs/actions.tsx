"use server";

import { database } from "@/db/database";
import { wasteListings, bids } from "@/db/schema";
import { auth } from "@/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createNotification } from "../../notifications/actions";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   ACCEPT OFFER
========================================================= */

export const acceptOfferAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const listingId = Number(formData.get("listingId"));
    if (!listingId) throw new Error("Listing ID required");

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!listing) throw new Error("Listing not found");

    await database
      .update(wasteListings)
      .set({ offerAccepted: true })
      .where(eq(wasteListings.id, listingId));

    if (listing.userId) {
      await createNotification(
        listing.userId,
        "Job Accepted 🎉",
        `Your listing "${listing.name}" has been accepted and will be assigned to a carrier shortly.`,
        `/home/waste-listings/${listingId}`,
      );
    }

    revalidatePath("/home/my-activity/my-bids");
    revalidatePath("/home/my-activity/jobs-in-progress");
  },
  {
    actionName: "acceptOfferAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* =========================================================
   DECLINE OFFER
========================================================= */

export const declineOfferAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const listingId = Number(formData.get("listingId"));
    const bidId = Number(formData.get("bidId"));

    if (!listingId || !bidId) throw new Error("Missing IDs");

    await database
      .update(wasteListings)
      .set({
        assigned: false,
        winningBidId: null,
        winningOrganisationId: null,
        offerAccepted: false,
      })
      .where(eq(wasteListings.id, listingId));

    await database
      .update(bids)
      .set({ declinedOffer: true })
      .where(eq(bids.id, bidId));

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (listing?.userId) {
      await createNotification(
        listing.userId,
        "Offer Declined ❌",
        `The offer for "${listing.name}" was declined.`,
        `/home/waste-listings/${listingId}`,
      );
    }

    revalidatePath("/home/my-activity/my-bids");
  },
  {
    actionName: "declineOfferAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   CANCEL JOB (Relist Listing)
========================================================= */

export const cancelJobAction = withErrorHandling(
  async ({
    listingId,
    bidId,
    cancellationReason,
  }: {
    listingId: number;
    bidId: number;
    cancellationReason: string;
  }) => {
    const session = await auth();

    /* ===============================
       USER-FACING VALIDATION
    ============================== */

    if (!session?.user?.id) {
      return { success: false, message: "Unauthorized." };
    }

    if (!cancellationReason.trim()) {
      return { success: false, message: "Cancellation reason required." };
    }

    /* ===============================
       VALIDATE BID OWNERSHIP
    ============================== */

    const bid = await database.query.bids.findFirst({
      where: and(eq(bids.id, bidId), eq(bids.userId, session.user.id)),
    });

    if (!bid) {
      return { success: false, message: "Bid not found." };
    }

    /* ===============================
       CANCEL BID
    ============================== */

    await database
      .update(bids)
      .set({
        cancelledJob: true,
        cancellationReason,
      })
      .where(eq(bids.id, bidId));

    /* ===============================
       RESET LISTING
    ============================== */

    await database
      .update(wasteListings)
      .set({
        winningBidId: null,
        winningOrganisationId: null,
        offerAccepted: false,
        assigned: false,
        assignedCarrierOrganisationId: null,
        assignedByOrganisationId: null,
      })
      .where(eq(wasteListings.id, listingId));

    /* ===============================
       NOTIFY OWNER
    ============================== */

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (listing?.userId) {
      await createNotification(
        listing.userId,
        "Job Cancelled",
        `The winning bid for "${listing.name}" has been cancelled. The listing is now relisted.`,
        `/home/waste-listings/${listingId}`,
      );
    }

    revalidatePath("/home/waste-listings");
    revalidatePath("/home/my-activity");

    return {
      success: true,
      message: "Job successfully cancelled and relisted.",
    };
  },
  {
    actionName: "cancelJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
