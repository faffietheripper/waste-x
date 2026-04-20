"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { completeAssignmentByManager } from "@/modules/assignments/actions/completeAssignmentByManager";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const markCompletedByManagerAction = withErrorHandling(
  async (_prevState: any, formData: FormData) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    const listingId = Number(formData.get("listingId"));
    const verificationCode = formData.get("verificationCode")?.toString();

    if (!listingId || !verificationCode) {
      throw new Error("INVALID_INPUT");
    }

    await completeAssignmentByManager({
      listingId,
      verificationCode,
    });

    revalidatePath("/home/carrier-hub/carrier-manager/job-assignments");

    return {
      success: true,
      message: "Waste transfer successfully completed.",
    };
  },
  {
    actionName: "markCompletedByManagerAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
