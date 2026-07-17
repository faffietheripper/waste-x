"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { markCollected } from "../core/markCollected";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

export const markCollectedAction = withErrorHandling(
  async ({
    assignmentId,
    verificationCode,
  }: {
    assignmentId: string;
    verificationCode: string;
  }) => {
    const { organisationId, userId } = await requireOrgUser();

    const result = await markCollected({
      assignmentId,
      verificationCode,
      organisationId,
    });

    /*
      Step 7:
      Carrier verifies collection
      → notify generator.
    */
    await notifyDepartmentUsers({
      organisationId: result.generatorOrganisationId,
      departmentTypes: ["generator", "compliance"],
      actorId: userId,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.COLLECTION_VERIFIED,
      title: "Waste collection verified",
      message: `The carrier has verified collection for ${result.listing.name}.`,
    });

    /*
      Step 7:
      Carrier verifies collection
      → notify manager.
    */
    if (result.managerOrganisationId) {
      await notifyDepartmentUsers({
        organisationId: result.managerOrganisationId,
        departmentTypes: ["manager", "compliance"],
        actorId: userId,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.COLLECTION_VERIFIED,
        title: "Waste collection verified",
        message: `The carrier has verified collection for ${result.listing.name}. The same verification code is required to receive the waste.`,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  },
  {
    actionName: "markCollected",
    code: ERROR_CODES.ASSIGNMENT_COLLECTION_FAILED,
    severity: "high",
  },
);