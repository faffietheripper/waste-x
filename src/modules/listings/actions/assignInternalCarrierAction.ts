"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { assignInternalCarrier } from "../core/assignInternalCarrier";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

type Input = {
  listingId: number;
  departmentId: string;
};

export const assignInternalCarrierAction = withErrorHandling(
  async (input: Input) => {
    const context = await requireOperationalPermission("listing:direct_assign");

    const result = await assignInternalCarrier(input, {
      userId: context.user.id,
      organisationId: context.user.organisationId!,
    });

    return result;
  },
  {
    actionName: "assignInternalCarrier",
    code: ERROR_CODES.LISTING_ASSIGN_FAILED,
    severity: "high",
  },
);