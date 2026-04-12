"use server";

import { auth } from "@/auth";
import { redirect } from "next/navigation";

import { updatePassword } from "@/modules/auth/actions/updatePassword";
import { deleteAccount } from "@/modules/auth/actions/deleteAccount";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   UPDATE PASSWORD
============================== */

export const updatePasswordAction = withErrorHandling(
  async ({
    currentPassword,
    newPassword,
  }: {
    currentPassword?: string;
    newPassword: string;
  }) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await updatePassword({
      userId: session.user.id,
      currentPassword,
      newPassword,
    });

    return {
      success: true,
      message: "Password updated successfully.",
    };
  },
  {
    actionName: "updatePasswordAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);

/* ===============================
   DELETE ACCOUNT
============================== */

export const deleteAccountAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await deleteAccount(session.user.id);

    redirect("/");
  },
  {
    actionName: "deleteAccountAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "critical",
  },
);
