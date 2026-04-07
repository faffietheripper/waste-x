"use server";

import { randomUUID } from "crypto";
import { add } from "date-fns";
import { database } from "@/db/database";
import { passwordResetTokens } from "@/db/schema";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   SUBMIT FORGOT PASSWORD
========================================================= */

export const submitForgotPassword = withErrorHandling(
  async (formData: FormData) => {
    const email = formData.get("email")?.toString();

    /* ===============================
       VALIDATION (UX SAFE)
    ============================== */

    if (!email) {
      return { success: false, message: "Email is required." };
    }

    /* ===============================
       GENERATE TOKEN
    ============================== */

    const resetToken = randomUUID();

    const baseUrl =
      process.env.APP_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const resetLink = `${baseUrl}/reset-password?token=${resetToken}`;

    const tokenExpiration = add(new Date(), { hours: 1 });

    /* ===============================
       STORE TOKEN
    ============================== */

    await database.insert(passwordResetTokens).values({
      email,
      token: resetToken,
      expires: tokenExpiration,
      used: false,
    });

    /* ===============================
       RESPONSE (GENERIC)
    ============================== */

    return {
      success: true,
      resetLink, // ⚠️ in production you’ll email this instead
      message: "If the email exists, a reset link has been generated.",
    };
  },
  {
    actionName: "submitForgotPassword",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // auth flow
  },
);
