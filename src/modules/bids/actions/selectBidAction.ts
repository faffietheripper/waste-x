"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { selectBid } from "../core/selectBid";

type Input = {
  listingId: number;
  bidId: number;
};

export const selectBidAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    return await selectBid(input, { organisationId });
  },
  {
    actionName: "selectBid",
    code: ERROR_CODES.LISTING_ASSIGN_FAILED,
    severity: "high",
  },
);
