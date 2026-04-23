"use server";

import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { assignInternalCarrier } from "../core/assignInternalCarrier";

type Input = {
  listingId: number;
  departmentId: string;
};

export const assignInternalCarrierAction = withErrorHandling(
  async (input: Input) => {
    const { userId, organisationId } = await requireOrgUser();

    const result = await assignInternalCarrier(input, {
      userId,
      organisationId,
    });

    return result;
  },
  {
    actionName: "assignInternalCarrier",
    code: ERROR_CODES.LISTING_ASSIGN_FAILED,
    severity: "high",
  },
);
