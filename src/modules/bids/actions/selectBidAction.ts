"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { selectBid } from "../core/selectBid";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type Input = {
  listingId: number;
  bidId: number;
};

export const selectBidAction = withErrorHandling(
  async (input: Input) => {
    /*
      Selecting a winning bid is an assignment operation.

      Your existing permission map appears to support:
      - listing:direct_assign

      It does not currently support:
      - listing:assign

      So we use listing:direct_assign here to avoid breaking your permission
      type system.
    */
    const context = await requireOperationalPermission("listing:direct_assign");

    if (!input?.listingId) {
      throw new Error("LISTING_ID_REQUIRED");
    }

    if (!input?.bidId) {
      throw new Error("BID_ID_REQUIRED");
    }

    const result = await selectBid(input, {
      organisationId: context.user.organisationId!,
    });

    /*
      Step 2 notification:
      Generator selected a winning bid.
      Notify manager + compliance users in the selected manager organisation.
    */
    await notifyDepartmentUsers({
      organisationId: result.managerOrganisationId,
      departmentTypes: ["manager", "compliance"],
      actorId: context.user.id,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.MANAGER_ASSIGNED,
      title: "You have been assigned as waste manager",
      message: `Your organisation has been selected to manage this waste listing: ${result.listing.name}. Please review and accept or reject the assignment.`,
    });

    return {
      success: true,
      message:
        "Winning bid assigned as waste manager. Waiting for manager response.",
      assignment: result.assignment,
    };
  },
  {
    actionName: "selectBid",
    code: ERROR_CODES.LISTING_ASSIGN_FAILED,
    severity: "high",
  },
);