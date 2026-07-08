"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { acceptAssignment } from "../core/acceptAssignment";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type Input = {
  assignmentId: string;
};

export const acceptAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId, userId } = await requireOrgUser();

    if (!input?.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    const result = await acceptAssignment({
      assignmentId: input.assignmentId,
      organisationId,
    });

    /*
      Step 3:
      Manager accepts assignment
      → notify generator.
    */
    if (result.event === "manager_accepted") {
      await notifyDepartmentUsers({
        organisationId: result.generatorOrganisationId,
        departmentTypes: ["generator", "compliance"],
        actorId: userId,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.MANAGER_ACCEPTED,
        title: "Manager accepted assignment",
        message: `The assigned manager has accepted your waste listing: ${result.listing.name}.`,
      });
    }

    /*
      Step 5:
      Carrier accepts assignment
      → verification code generated
      → notify generator and manager with the SAME code.
    */
    if (result.event === "carrier_accepted") {
      await notifyDepartmentUsers({
        organisationId: result.generatorOrganisationId,
        departmentTypes: ["generator", "compliance"],
        actorId: userId,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.VERIFICATION_CODE_GENERATED,
        title: "Collection verification code generated",
        message: `The carrier has accepted the collection job for ${result.listing.name}. Verification code: ${result.verificationCode}`,
      });

      if (result.managerOrganisationId) {
        await notifyDepartmentUsers({
          organisationId: result.managerOrganisationId,
          departmentTypes: ["manager", "compliance"],
          actorId: userId,
          listingId: result.listing.id,
          type: NOTIFICATION_TYPES.VERIFICATION_CODE_ACTIVE,
          title: "Movement verification code active",
          message: `The carrier has accepted the collection job for ${result.listing.name}. The same verification code will be required when receiving the waste: ${result.verificationCode}`,
        });
      }
    }

    return {
      success: true,
      message: result.message,
    };
  },
  {
    actionName: "acceptAssignment",
    code: ERROR_CODES.ASSIGNMENT_ACCEPT_FAILED,
    severity: "high",
  },
);