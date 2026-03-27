"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { sendRegEmail } from "@/util/sendRegEmail";

/* =========================================================
   TYPES
========================================================= */

export type UserRole = "administrator" | "employee" | "seniorManagement";
type ActionResponse = { success: true } | { success: false; message: string };

export type InviteFormData = {
  name: string;
  email: string;
  role: UserRole;
};

type RegisterTeamUserResponse =
  | { success: true; token: string }
  | { success: false; message: string };

/* =========================================================
   VALIDATION
========================================================= */

const InviteSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(["employee", "seniorManagement", "administrator"]),
});

/* =========================================================
   GET USER
========================================================= */

export async function getUserFromDb(email: string) {
  try {
    const existedUser = await database.query.users.findFirst({
      where: eq(users.email, email),
      columns: {
        id: true,
        email: true,
        name: true,
      },
    });

    if (!existedUser) {
      return { success: false, message: "User not found." };
    }

    return { success: true, data: existedUser };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

/* =========================================================
   INVITE TEAM USER
========================================================= */

export async function registerTeamUser(
  data: InviteFormData,
): Promise<RegisterTeamUserResponse> {
  try {
    const { name, email, role } = data;

    /* ---------------- AUTH ---------------- */
    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    /* ---------------- VALIDATION ---------------- */
    InviteSchema.parse({ name, email, role });

    /* ---------------- EXISTING USER ---------------- */
    const existingUser = await database.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (session.user.role !== "administrator") {
      throw new Error("Unauthorized");
    }
    // If user exists AND is already active → block
    if (existingUser?.passwordHash) {
      return {
        success: false,
        message: "User already exists and is active.",
      };
    }

    /* ---------------- ADMIN ORG ---------------- */
    const adminUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { organisationId: true },
    });

    if (!adminUser?.organisationId) {
      return {
        success: false,
        message: "Admin user does not belong to any organisation.",
      };
    }

    /* ---------------- TOKEN ---------------- */
    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h

    /* ---------------- UPSERT ---------------- */
    let userRecord;

    if (existingUser) {
      // Re-invite existing pending user
      const [updated] = await database
        .update(users)
        .set({
          name,
          role,
          organisationId: adminUser.organisationId,
          inviteToken: hashedToken,
          inviteExpiry: expiry,
          status: "INVITED",
        })
        .where(eq(users.id, existingUser.id))
        .returning();

      userRecord = updated;
    } else {
      // Create new invited user
      const [created] = await database
        .insert(users)
        .values({
          name,
          email,
          role,
          organisationId: adminUser.organisationId,

          passwordHash: null,

          inviteToken: hashedToken,
          inviteExpiry: expiry,
          status: "INVITED",
        })
        .returning();

      userRecord = created;
    }

    /* ---------------- RETURN ---------------- */
    return {
      success: true,
      token: rawToken, // raw token ONLY returned here
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to invite user",
    };
  }
}

export async function revokeInvite(userId: string) {
  try {
    await database
      .update(users)
      .set({
        inviteToken: null,
        inviteExpiry: null,
        status: "SUSPENDED", // or keep INVITED but revoked
      })
      .where(eq(users.id, userId));

    return { success: true };
  } catch (err: any) {
    return { success: false, message: err.message };
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
