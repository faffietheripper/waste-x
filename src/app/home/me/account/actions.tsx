"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import bcryptjs from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   UPDATE PASSWORD
========================================================= */

export const updatePassword = withErrorHandling(
  async ({
    userId,
    currentPassword,
    newPassword,
  }: {
    userId: string;
    currentPassword?: string;
    newPassword: string;
  }) => {
    /* ===============================
       FIND USER
    ============================== */

    const user = await database.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return {
        success: false,
        message: "User not found.",
      };
    }

    /* ===============================
       VERIFY CURRENT PASSWORD
    ============================== */

    if (currentPassword) {
      const isMatch = await bcryptjs.compare(
        currentPassword,
        user.passwordHash ?? "",
      );

      if (!isMatch) {
        return {
          success: false,
          message: "Current password is incorrect.",
        };
      }
    }

    /* ===============================
       HASH NEW PASSWORD
    ============================== */

    const hashedPassword = await bcryptjs.hash(newPassword, 10);

    /* ===============================
       UPDATE PASSWORD
    ============================== */

    await database
      .update(users)
      .set({
        passwordHash: hashedPassword,
      })
      .where(eq(users.id, userId));

    return {
      success: true,
      message: "Password updated successfully.",
    };
  },
  {
    actionName: "updatePassword",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // security-sensitive
  },
);

/* =========================================================
   DELETE ACCOUNT
========================================================= */

export const deleteAccountAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    await database.delete(users).where(eq(users.id, session.user.id));

    redirect("/");
  },
  {
    actionName: "deleteAccountAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "critical", // destructive action
  },
);
