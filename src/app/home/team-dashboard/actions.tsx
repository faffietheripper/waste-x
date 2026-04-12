"use server";

import { auth } from "@/auth";

import { inviteUser } from "@/modules/team/actions/inviteUser";
import { revokeInvite } from "@/modules/team/actions/revokeInvite";
import { resendInvite } from "@/modules/team/actions/resendInvite";

import { sendRegEmail } from "@/util/sendRegEmail";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   INVITE USER
============================== */

export const registerTeamUser = withErrorHandling(
  async (data) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    if (session.user.role !== "administrator") {
      throw new Error("FORBIDDEN");
    }

    const result = await inviteUser({
      ...data,
      organisationId: session.user.organisationId,
    });

    await sendRegEmail({
      name: result.user.name,
      email: result.user.email,
      token: result.rawToken,
    });

    return { success: true };
  },
  {
    actionName: "registerTeamUser",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);

/* ===============================
   REVOKE
============================== */

export const revokeInviteAction = withErrorHandling(
  async (userId: string) => {
    return revokeInvite(userId);
  },
  {
    actionName: "revokeInvite",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);

/* ===============================
   RESEND
============================== */

export const resendInviteAction = withErrorHandling(
  async (userId: string) => {
    const result = await resendInvite(userId);

    await sendRegEmail({
      name: result.user.name,
      email: result.user.email,
      token: result.rawToken,
    });

    return { success: true };
  },
  {
    actionName: "resendInvite",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
