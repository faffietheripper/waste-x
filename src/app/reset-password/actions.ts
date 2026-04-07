"use server";

import { database } from "@/db/database";
import { passwordResetTokens, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   RESET PASSWORD
========================================================= */

export const validateTokenAndResetPassword = withErrorHandling(
  async (url: string, newPassword: string, confirmPassword: string) => {
    /* ===============================
       VALIDATION (UX SAFE)
    ============================== */

    if (!url || !newPassword || !confirmPassword) {
      return {
        success: false,
        message: "URL, new password, and confirm password are required.",
      };
    }

    if (newPassword !== confirmPassword) {
      return {
        success: false,
        message: "Password and confirm password do not match.",
      };
    }

    if (newPassword.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters long.",
      };
    }

    /* ===============================
       EXTRACT TOKEN
    ============================== */

    let token: string | null = null;

    try {
      const urlObject = new URL(url);
      token = urlObject.searchParams.get("token");
    } catch {
      return {
        success: false,
        message: "Invalid reset link.",
      };
    }

    if (!token) {
      return {
        success: false,
        message: "Invalid reset link.",
      };
    }

    /* ===============================
       FETCH TOKEN
    ============================== */

    const tokenRecord = await database
      .select()
      .from(passwordResetTokens)
      .where(eq(passwordResetTokens.token, token))
      .limit(1);

    if (
      !tokenRecord.length ||
      tokenRecord[0].expires < new Date() ||
      tokenRecord[0].used
    ) {
      return {
        success: false,
        message: "Invalid or expired token.",
      };
    }

    const email = tokenRecord[0].email;

    /* ===============================
       HASH PASSWORD
    ============================== */

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    /* ===============================
       UPDATE USER
    ============================== */

    const result = await database
      .update(users)
      .set({
        passwordHash: hashedPassword,
      })
      .where(eq(users.email, email));

    if (!result) {
      return {
        success: false,
        message: "Failed to update password.",
      };
    }

    /* ===============================
       MARK TOKEN USED
    ============================== */

    await database
      .update(passwordResetTokens)
      .set({ used: true })
      .where(eq(passwordResetTokens.token, token));

    return {
      success: true,
      message: "Password reset successfully.",
    };
  },
  {
    actionName: "resetPassword",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // auth + security critical
  },
);
