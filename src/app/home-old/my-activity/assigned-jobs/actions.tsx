"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { rejectBid } from "@/modules/bids/core/rejectBid";
import { cancelAssignment } from "@/modules/assignments/core/cancelAssignment";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   DECLINE BID
============================== */

export const declineOfferAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("UNAUTHORIZED");

    const bidId = Number(formData.get("bidId"));
    if (!bidId) throw new Error("INVALID_BID_ID");

    await rejectBid(bidId);

    revalidatePath("/home/my-activity/my-bids");
  },
  {
    actionName: "declineOfferAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* ===============================
   CANCEL JOB
============================== */

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

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await cancelAssignment({
      listingId,
      bidId,
      userId: session.user.id,
      cancellationReason,
    });

    revalidatePath("/home/waste-listings");
    revalidatePath("/home/my-activity");

    return {
      success: true,
      message: "Job cancelled and relisted.",
    };
  },
  {
    actionName: "cancelJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
