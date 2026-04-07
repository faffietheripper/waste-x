"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { z } from "zod";
import { sendRegEmail } from "@/util/sendRegEmail";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

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
   GET USER (UTILITY — NOT WRAPPED)
========================================================= */

export async function getUserFromDb(email: string) {
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
}

/* =========================================================
   INVITE TEAM USER
========================================================= */

export const registerTeamUser = withErrorHandling(
  async (data: InviteFormData): Promise<RegisterTeamUserResponse> => {
    const { name, email, role } = data;

    const session = await auth();
    if (!session?.user) throw new Error("Unauthorized");

    InviteSchema.parse({ name, email, role });

    if (session.user.role !== "administrator") {
      throw new Error("Unauthorized");
    }

    const existingUser = await database.query.users.findFirst({
      where: eq(users.email, email),
    });

    if (existingUser?.passwordHash) {
      return {
        success: false,
        message: "User already exists and is active.",
      };
    }

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

    /* ================= TOKEN ================= */

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);

    let userRecord;

    if (existingUser) {
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

    return {
      success: true,
      token: rawToken,
    };
  },
  {
    actionName: "registerTeamUser",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);

/* =========================================================
   REVOKE INVITE
========================================================= */

export const revokeInvite = withErrorHandling(
  async (userId: string): Promise<ActionResponse> => {
    await database
      .update(users)
      .set({
        inviteToken: null,
        inviteExpiry: null,
        status: "SUSPENDED",
      })
      .where(eq(users.id, userId));

    return { success: true };
  },
  {
    actionName: "revokeInvite",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);

/* =========================================================
   RESEND INVITE
========================================================= */

export const resendInvite = withErrorHandling(
  async (userId: string): Promise<ActionResponse> => {
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

    /* ================= TOKEN ================= */

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const expiry = new Date(Date.now() + 1000 * 60 * 60 * 24);

    await database
      .update(users)
      .set({
        inviteToken: hashedToken,
        inviteExpiry: expiry,
      })
      .where(eq(users.id, userId));

    /* ================= EMAIL ================= */

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

    return { success: true };
  },
  {
    actionName: "resendInvite",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
