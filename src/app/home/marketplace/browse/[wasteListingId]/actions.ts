"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { createBid } from "@/modules/bids/core/createBid";
import { selectBid } from "@/modules/bids/core/selectBid";

import { createNotification } from "@/modules/notifications/services/createNotification";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   CREATE BID
============================== */

export const createBidAction = withErrorHandling(
  async ({ amount, listingId }) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    await createBid({
      amount,
      listingId,
      userId: session.user.id,
      organisationId: session.user.organisationId,
    });

    // 🔔 notify listing owner (optional)
    await createNotification({
      recipientId: session.user.id,
      title: "Bid placed",
      message: "Your bid was submitted successfully.",
      type: "bid_created",
      listingId,
    });

    revalidatePath(`/home/waste-listings/${listingId}`);

    return { success: true };
  },
  {
    actionName: "createBidAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* ===============================
   SELECT BID
============================== */

export const selectBidAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    const listingId = Number(formData.get("listingId"));
    const bidId = Number(formData.get("bidId"));

    if (!listingId || !bidId) {
      throw new Error("INVALID_INPUT");
    }

    await selectBid({
      listingId,
      bidId,
      organisationId: session.user.organisationId,
    });

    revalidatePath(`/home/waste-listings/${listingId}`);

    return { success: true };
  },
  {
    actionName: "selectBidAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
