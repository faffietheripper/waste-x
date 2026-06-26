"use server";

import { createBid } from "../core/createBid";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

export const createBidAction = withErrorHandling(
  async ({
    listingId,
    amount,
  }: {
    listingId: number;
    amount: number;
  }) => {
    const context = await requireOperationalPermission("listing:bid");

    return await createBid({
      listingId,
      amount,
      userId: context.user.id,
      organisationId: context.user.organisationId!,
    });
  },
  {
    actionName: "createBid",
    code: ERROR_CODES.LISTING_BID_FAILED,
    severity: "medium",
  },
);