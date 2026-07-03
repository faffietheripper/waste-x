"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

import { receiveWaste } from "../core/receiveWaste";

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

    return receiveWaste({
      assignmentId: input.assignmentId,
      organisationId: context.user.organisationId,
      departmentType: context.departmentType,
      verificationCode: input.verificationCode,
    });
  },
  {
    actionName: "receiveWaste",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);