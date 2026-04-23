"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { createDepartment } from "../core/createDepartment";

type Input = {
  name: string;
  type: "generator" | "carrier" | "compliance";
};

export const createDepartmentAction = withErrorHandling(
  async (input: Input) => {
    const { organisationId } = await requireOrgUser();

    const result = await createDepartment(input, {
      organisationId,
    });

    return result;
  },
  {
    actionName: "createDepartment",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
