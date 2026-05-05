"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { cancelAssignment } from "../core/cancelAssignment";

type Input = {
  assignmentId: string;
};

export const cancelAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    if (!input?.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    return cancelAssignment({
      assignmentId: input.assignmentId,
      organisationId,
    });
  },
  {
    actionName: "cancelAssignment",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
