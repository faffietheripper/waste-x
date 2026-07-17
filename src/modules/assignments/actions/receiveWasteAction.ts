"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { receiveWaste } from "../core/receiveWaste";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type Input = {
  assignmentId: string;
  verificationCode: string;
};

export const receiveWasteAction = withErrorHandling(
  async (input: Input) => {
    const context = await requireOperationalPermission(
      "assignment:receive_waste",
    );

    if (!input.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    if (!input.verificationCode?.trim()) {
      throw new Error("Enter the verification code.");
    }

    if (!context.user.organisationId) {
      throw new Error("Missing organisation ID.");
    }

    const result = await receiveWaste({
      assignmentId: input.assignmentId,
      organisationId: context.user.organisationId,
      departmentType: context.departmentType,
      verificationCode: input.verificationCode,
    });

    /*
      Step 8:
      Manager receives waste with same verification code
      → notify generator.
    */
    await notifyDepartmentUsers({
      organisationId: result.generatorOrganisationId,
      departmentTypes: ["generator", "compliance"],
      actorId: context.user.id,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.WASTE_RECEIVED_COMPLETED,
      title: "Waste received by manager",
      message: `The manager has received the waste for ${result.listing.name}. The movement is now complete.`,
    });

    /*
      Step 8:
      Notify carrier.
    */
    if (result.carrierOrganisationId) {
      await notifyDepartmentUsers({
        organisationId: result.carrierOrganisationId,
        departmentTypes: ["carrier", "compliance"],
        actorId: context.user.id,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.WASTE_RECEIVED_COMPLETED,
        title: "Waste delivery confirmed",
        message: `The manager has received the waste for ${result.listing.name}. The movement is now complete.`,
      });
    }

    /*
      Step 8:
      Notify manager compliance / manager users.
    */
    if (result.managerOrganisationId) {
      await notifyDepartmentUsers({
        organisationId: result.managerOrganisationId,
        departmentTypes: ["manager", "compliance"],
        actorId: context.user.id,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.ASSIGNMENT_COMPLETED,
        title: "Movement completed",
        message: `Waste has been received for ${result.listing.name}. The assignment has been completed.`,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  },
  {
    actionName: "receiveWaste",
    code: ERROR_CODES.ASSIGNMENT_COMPLETE_FAILED,
    severity: "high",
  },
);