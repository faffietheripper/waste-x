"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { withdrawBid } from "@/modules/bids/core/withdrawBid";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const deleteBidAction = withErrorHandling(
  async (bidId: number) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await withdrawBid({
      bidId,
      userId: session.user.id,
    });

    revalidatePath("/home/my-activity/my-bids");
  },
  {
    actionName: "deleteBidAction", // you can rename later
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
