"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { assignCarrierToAssignment } from "../core/assignCarrierToAssignment";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type Input = {
  assignmentId: string;
  carrierOrganisationId: string;
};

export const assignCarrierToAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId, userId } = await requireOrgUser();

    if (!input.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    if (!input.carrierOrganisationId) {
      throw new Error("Missing carrier organisation.");
    }

    const result = await assignCarrierToAssignment({
      assignmentId: input.assignmentId,
      carrierOrganisationId: input.carrierOrganisationId,
      managerOrganisationId: organisationId,
    });

    /*
      Step 4:
      Manager assigns carrier
      → notify carrier.
    */
    await notifyDepartmentUsers({
      organisationId: result.carrierOrganisationId,
      departmentTypes: ["carrier", "compliance"],
      actorId: userId,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.CARRIER_ASSIGNED,
      title: "New carrier assignment",
      message: `Your organisation has been assigned to collect waste for ${result.listing.name}. Please accept or reject the job.`,
    });

    /*
      Step 4:
      Manager assigns carrier
      → notify generator.
    */
    await notifyDepartmentUsers({
      organisationId: result.generatorOrganisationId,
      departmentTypes: ["generator", "compliance"],
      actorId: userId,
      listingId: result.listing.id,
      type: NOTIFICATION_TYPES.CARRIER_ASSIGNED_TO_LISTING,
      title: "Carrier assigned",
      message: `A carrier has been assigned to your waste movement: ${result.listing.name}.`,
    });

    return {
      success: true,
      message: result.message,
    };
  },
  {
    actionName: "assignCarrierToAssignment",
    code: ERROR_CODES.ASSIGNMENT_CREATE_FAILED,
    severity: "high",
  },
);