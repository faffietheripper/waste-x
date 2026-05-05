"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { assignCarrierToAssignment } from "../core/assignCarrierToAssignment";

type Input = {
  assignmentId: string;
  carrierOrganisationId: string;
};

export const assignCarrierToAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    if (!input.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    if (!input.carrierOrganisationId) {
      throw new Error("Missing carrier organisation.");
    }

    return assignCarrierToAssignment({
      assignmentId: input.assignmentId,
      carrierOrganisationId: input.carrierOrganisationId,
      managerOrganisationId: organisationId,
    });
  },
  {
    actionName: "assignCarrierToAssignment",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
