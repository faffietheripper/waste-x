"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { rejectAssignment } from "../core/rejectAssignment";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type Input = {
  assignmentId: string;
};

export const rejectAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId, userId } = await requireOrgUser();

    if (!input?.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    const result = await rejectAssignment({
      assignmentId: input.assignmentId,
      organisationId,
    });

    /*
      Step 3:
      Manager rejects
      → notify generator.
    */
    if (result.event === "manager_rejected") {
      await notifyDepartmentUsers({
        organisationId: result.generatorOrganisationId,
        departmentTypes: ["generator", "compliance"],
        actorId: userId,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.MANAGER_REJECTED,
        title: "Manager rejected assignment",
        message: `The selected manager rejected the assignment for ${result.listing.name}. The listing has been reopened.`,
      });
    }

    /*
      Step 6:
      Carrier rejects
      → notify manager and generator.
    */
    if (result.event === "carrier_rejected") {
      if (result.managerOrganisationId) {
        await notifyDepartmentUsers({
          organisationId: result.managerOrganisationId,
          departmentTypes: ["manager", "compliance"],
          actorId: userId,
          listingId: result.listing.id,
          type: NOTIFICATION_TYPES.CARRIER_REJECTED,
          title: "Carrier rejected assignment",
          message: `The selected carrier rejected the collection job for ${result.listing.name}. Please assign another carrier.`,
        });
      }

      await notifyDepartmentUsers({
        organisationId: result.generatorOrganisationId,
        departmentTypes: ["generator", "compliance"],
        actorId: userId,
        listingId: result.listing.id,
        type: NOTIFICATION_TYPES.CARRIER_REJECTED,
        title: "Carrier rejected assignment",
        message: `The carrier rejected the collection job for ${result.listing.name}. The manager will need to assign another carrier.`,
      });
    }

    return {
      success: true,
      message: result.message,
    };
  },
  {
    actionName: "rejectAssignment",
    code: ERROR_CODES.ASSIGNMENT_REJECT_FAILED,
    severity: "high",
  },
);