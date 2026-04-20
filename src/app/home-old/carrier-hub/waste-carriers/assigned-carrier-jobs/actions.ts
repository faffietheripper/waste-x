"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { createAssignment } from "@/modules/assignments/actions/createAssignment";
import { acceptAssignment } from "@/modules/assignments/actions/acceptAssignment";
import { rejectAssignment } from "@/modules/assignments/actions/rejectAssignment";
import { markCollected } from "@/modules/assignments/actions/markCollected";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ================= CREATE ================= */

export const assignCarrierAction = withErrorHandling(
  async (listingId: number, carrierOrgId: string) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    await createAssignment({
      listingId,
      carrierOrganisationId: carrierOrgId,
      assignedByOrganisationId: session.user.organisationId,
    });

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "assignCarrierAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* ================= ACCEPT ================= */

export const acceptCarrierJobAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();

    const listingId = Number(formData.get("listingId"));

    await acceptAssignment({
      listingId,
      organisationId: session.user.organisationId,
    });

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "acceptCarrierJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* ================= REJECT ================= */

export const rejectCarrierJobAction = withErrorHandling(
  async (formData: FormData) => {
    const session = await auth();

    const listingId = Number(formData.get("listingId"));

    await rejectAssignment({
      listingId,
      organisationId: session.user.organisationId,
    });

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "rejectCarrierJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* ================= COLLECT ================= */

export const markCollectedAction = withErrorHandling(
  async (_prevState: any, formData: FormData) => {
    const listingId = Number(formData.get("listingId"));
    const verificationCode = formData.get("verificationCode")?.toString();

    if (!listingId || !verificationCode) {
      throw new Error("INVALID_INPUT");
    }

    await markCollected({
      listingId,
      verificationCode,
    });

    revalidatePath("/home/carrier-hub/assigned-jobs");

    return { success: true };
  },
  {
    actionName: "markCollectedAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
