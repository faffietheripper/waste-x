"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

import { receiveWaste } from "../core/receiveWaste";

type Input = {
  assignmentId: string;
  verificationCode: string;
};

export const receiveWasteAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    if (!input.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    if (!input.verificationCode) {
      throw new Error("Enter the verification code.");
    }

    return receiveWaste({
      assignmentId: input.assignmentId,
      organisationId,
      verificationCode: input.verificationCode,
    });
  },
  {
    actionName: "receiveWaste",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
