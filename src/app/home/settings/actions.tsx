"use server";

import { auth, signOut } from "@/auth";
import { redirect } from "next/navigation";

import { getProfile } from "@/modules/users/profile/actions/getProfile";
import { saveProfile } from "@/modules/users/profile/actions/saveProfile";
import { assignRole } from "@/modules/users/roles/actions/assignRole";
import { createUploadUrls } from "@/modules/shared/storage/createUploadUrls";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ===============================
   UPLOAD URL
============================== */

export const createUploadUrlAction = withErrorHandling(
  async (keys: string[], types: string[]) => {
    return createUploadUrls(keys, types);
  },
  {
    actionName: "createUploadUrlAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ===============================
   FETCH PROFILE
============================== */

export const fetchProfileAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    return getProfile(session.user.id);
  },
  {
    actionName: "fetchProfileAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ===============================
   SAVE PROFILE
============================== */

export const saveProfileAction = withErrorHandling(
  async (data) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await saveProfile({
      userId: session.user.id,
      data,
    });

    redirect("/home");
  },
  {
    actionName: "saveProfileAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* ===============================
   ASSIGN ROLE
============================== */

export const assignRoleAction = withErrorHandling(
  async (role) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await assignRole({
      userId: session.user.id,
      role,
    });

    await signOut({ redirectTo: "/" });
  },
  {
    actionName: "assignRoleAction",
    code: ERROR_CODES.AUTH_INVALID_TOKEN,
    severity: "high",
  },
);
