"use server";

import { createBid } from "../core/createBid";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

export const createBidAction = withErrorHandling(
  async ({
    listingId,
    amount,
  }: {
    listingId: number;
    amount: number;
  }) => {
    const context = await requireOperationalPermission("listing:bid");

    const result = await createBid({
      listingId,
      amount,
      userId: context.user.id,
      organisationId: context.user.organisationId!,
    });

    /*
      Step 1 notification:
      A manager/carrier organisation places a bid on a listing.
      The generator organisation should know immediately.
    */
    await notifyDepartmentUsers({
      organisationId: result.listing.organisationId,
      departmentTypes: ["generator", "compliance"],
      actorId: context.user.id,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.BID_RECEIVED,
      title: "New bid received",
      message: `A new bid of £${result.bid.amount} has been placed on your listing: ${result.listing.name}.`,
      excludeUserId: context.user.id,
    });

    return {
      success: true,
      message: "Bid placed successfully.",
      bid: result.bid,
    };
  },
  {
    actionName: "createBid",
    code: ERROR_CODES.LISTING_BID_FAILED,
    severity: "medium",
  },
);