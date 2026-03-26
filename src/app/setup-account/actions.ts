"use server";

import { sendRegEmail } from "@/util/sendRegEmail";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import bcryptjs from "bcryptjs";

/* =========================================================
   TYPES
========================================================= */

type ActionResponse = { success: true } | { success: false; message: string };

/* =========================================================
   COMPLETE INVITE
========================================================= */

export async function completeInvite({
  token,
  password,
}: {
  token: string;
  password: string;
}): Promise<ActionResponse> {
  try {
    if (!token) {
      return { success: false, message: "Invalid invite link." };
    }

    /* ---------------- HASH TOKEN ---------------- */
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    console.log("🔐 RAW TOKEN:", token);
    console.log("🔐 HASHED TOKEN:", hashedToken);

    /* ---------------- FIND USER ---------------- */
    const user = await database.query.users.findFirst({
      where: eq(users.inviteToken, hashedToken),
    });

    console.log("👤 USER FOUND:", user?.email ?? "NONE");

    if (!user) {
      return { success: false, message: "Invalid invite link." };
    }

    /* ---------------- EXPIRY CHECK ---------------- */
    if (!user.inviteExpiry) {
      return {
        success: false,
        message: "Invite not configured properly.",
      };
    }

    if (user.inviteExpiry < new Date()) {
      return {
        success: false,
        message: "Invite link has expired.",
      };
    }

    /* ---------------- PASSWORD ---------------- */
    const passwordHash = await bcryptjs.hash(password, 10);

    /* ---------------- ACTIVATE USER ---------------- */
    await database
      .update(users)
      .set({
        passwordHash,
        inviteToken: null,
        inviteExpiry: null,
        status: "ACTIVE",
      })
      .where(eq(users.id, user.id));

    console.log("✅ USER ACTIVATED:", user.email);

    return { success: true };
  } catch (err: any) {
    console.error("❌ completeInvite error:", err);
    return {
      success: false,
      message: err.message || "Failed to complete invite.",
    };
  }
}

/* =========================================================
   RESEND INVITE
========================================================= */

export async function resendInvite(userId: string): Promise<ActionResponse> {
  try {
    /* ---------------- FIND USER ---------------- */
    const user = await database.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return { success: false, message: "User not found." };
    }

    if (user.status === "ACTIVE") {
      return {
        success: false,
        message: "User already active.",
      };
    }

    /* ---------------- GENERATE TOKEN ---------------- */
    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    console.log("📨 RESEND TOKEN:", rawToken);

    /* ---------------- UPDATE USER ---------------- */
    await database
      .update(users)
      .set({
        inviteToken: hashedToken,
        inviteExpiry: expiry,
      })
      .where(eq(users.id, userId));

    /* ---------------- SEND EMAIL ---------------- */
    const emailRes = await sendRegEmail({
      name: user.name,
      email: user.email,
      token: rawToken,
    });

    if (!emailRes.success) {
      return {
        success: false,
        message: "Invite created but email failed to send.",
      };
    }

    console.log("✅ INVITE RESENT:", user.email);

    return { success: true };
  } catch (err: any) {
    console.error("❌ resendInvite error:", err);
    return {
      success: false,
      message: err.message || "Failed to resend invite.",
    };
  }
}
