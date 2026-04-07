"use server";

import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcryptjs from "bcryptjs";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   TYPES
========================================================= */

type ActionResponse = { success: true } | { success: false; message: string };

/* =========================================================
   COMPLETE INVITE
========================================================= */

export const completeInvite = withErrorHandling(
  async ({
    token,
    password,
  }: {
    token: string;
    password: string;
  }): Promise<ActionResponse> => {
    /* ===============================
       VALIDATION (UX SAFE)
    ============================== */

    if (!token) {
      return { success: false, message: "Invalid invite link." };
    }

    if (!password || password.length < 8) {
      return {
        success: false,
        message: "Password must be at least 8 characters.",
      };
    }

    /* ===============================
       HASH TOKEN (SECURE MATCH)
    ============================== */

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    /* ===============================
       FIND USER
    ============================== */

    const user = await database.query.users.findFirst({
      where: eq(users.inviteToken, hashedToken),
    });

    if (!user) {
      return { success: false, message: "Invalid invite link." };
    }

    /* ===============================
       EXPIRY CHECK
    ============================== */

    if (!user.inviteExpiry || user.inviteExpiry < new Date()) {
      return {
        success: false,
        message: "Invite link has expired.",
      };
    }

    /* ===============================
       HASH PASSWORD
    ============================== */

    const passwordHash = await bcryptjs.hash(password, 10);

    /* ===============================
       ACTIVATE USER
    ============================== */

    await database
      .update(users)
      .set({
        passwordHash,
        inviteToken: null,
        inviteExpiry: null,
        status: "ACTIVE",
      })
      .where(eq(users.id, user.id));

    return { success: true };
  },
  {
    actionName: "completeInvite",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high", // onboarding + auth critical
  },
);
