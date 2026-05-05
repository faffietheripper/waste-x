"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { rejectAssignment } from "../core/rejectAssignment";

type Input = {
  assignmentId: string;
};

export const rejectAssignmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    if (!input?.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    return rejectAssignment({
      assignmentId: input.assignmentId,
      organisationId,
    });
  },
  {
    actionName: "rejectAssignment",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
