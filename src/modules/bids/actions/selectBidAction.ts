"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { selectBid } from "../core/selectBid";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

type Input = {
  listingId: number;
  bidId: number;
};

export const selectBidAction = withErrorHandling(
  async (input: Input) => {
    const context = await requireOperationalPermission("listing:assign");

    return await selectBid(input, {
      organisationId: context.user.organisationId!,
    });
  },
  {
    actionName: "selectBid",
    code: ERROR_CODES.LISTING_ASSIGN_FAILED,
    severity: "high",
  },
);