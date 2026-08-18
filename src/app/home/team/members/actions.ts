"use server";

import crypto from "crypto";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import { userPermissions, users } from "@/db/schema";

import {
  SOLO_PERMISSIONS,
  isSoloAccessPreset,
  isSoloPermission,
  type SoloAccessPreset,
  type SoloPermission,
} from "@/modules/solo-permissions/core/permissions";

import {
  getPresetPermissions,
} from "@/modules/solo-permissions/core/presets";

import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import { organisationHasOtherPermissionManager } from "@/modules/solo-permissions/core/teamAccess";

import { writeSoloAccessAudit } from "@/modules/solo-permissions/core/writeSoloAccessAudit";

import { getSoloUserAccess } from "@/modules/solo-permissions/data-access/getSoloUserAccess";

/* =========================================================
   TYPES
========================================================= */

type UserRole = NonNullable<
  (typeof users.$inferInsert)["role"]
>;

/* =========================================================
   HELPERS
========================================================= */

function cleanString(
  value: FormDataEntryValue | null,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

async function getTargetUser(params: {
  organisationId: string;
  userId: string;
}) {
  return database.query.users.findFirst({
    where: and(
      eq(users.id, params.userId),
      eq(
        users.organisationId,
        params.organisationId,
      ),
    ),
  });
}

function permissionSetForSubmission(params: {
  preset: SoloAccessPreset;
  selected: SoloPermission[];
}) {
  if (params.preset === "custom") {
    return new Set<SoloPermission>(
      params.selected,
    );
  }

  return getPresetPermissions(
    params.preset,
  );
}

/*
  Solo permissions are the authority for access.

  users.role still exists because older areas of Waste X
  use the underlying application role.

  This helper returns the EXACT Drizzle users.role type,
  avoiding a generic string being passed into .set().
*/
function resolveUserRoleForPreset(params: {
  preset: SoloAccessPreset;
  currentRole: UserRole;
}): UserRole {
  if (params.preset === "custom") {
    return params.currentRole;
  }

  if (
    params.preset === "administrator"
  ) {
    return "administrator";
  }

  if (
    params.preset === "management"
  ) {
    return "seniorManagement";
  }

  if (
    params.preset === "accounts"
  ) {
    return "accounts";
  }

  if (
    params.preset === "read_only"
  ) {
    return "read_only";
  }

  /*
    Compliance is a Solo permission preset,
    not a separate users.role value.

    Both Operations and Compliance therefore
    use the operational underlying role.
  */
  if (
    params.preset === "operations" ||
    params.preset === "compliance"
  ) {
    return "operations";
  }

  return params.currentRole;
}

/* =========================================================
   UPDATE MEMBER ACCESS
========================================================= */

export async function updateMemberAccessAction(
  formData: FormData,
) {
  const context =
    await requireSoloPermission(
      "permissions:manage",
    );

  const userId = cleanString(
    formData.get("userId"),
  );

  const rawPreset = cleanString(
    formData.get("preset"),
  );

  if (
    !userId ||
    !isSoloAccessPreset(rawPreset)
  ) {
    redirect(
      "/home/team/members?error=invalid_access_update",
    );
  }

  const target = await getTargetUser({
    organisationId:
      context.organisationId,
    userId,
  });

  /*
    platform_admin is a Waste X platform role,
    not a customer organisation administrator.

    It must never be managed through the
    customer Team & Permissions workspace.
  */
  if (
    !target ||
    target.role === "platform_admin"
  ) {
    redirect(
      "/home/team/members?error=user_not_found",
    );
  }

  const selectedPermissions =
    formData
      .getAll("permission")
      .filter(
        (
          value,
        ): value is string =>
          typeof value ===
            "string" &&
          isSoloPermission(
            value,
          ),
      ) as SoloPermission[];

  const nextPermissions =
    permissionSetForSubmission({
      preset: rawPreset,
      selected:
        selectedPermissions,
    });

  /*
    Do not allow the current permission manager
    to accidentally remove their own ability to
    manage permissions.
  */
  if (
    context.userId ===
      target.id &&
    !nextPermissions.has(
      "permissions:manage",
    )
  ) {
    redirect(
      `/home/team/members/${target.id}?error=cannot_remove_own_permission_management`,
    );
  }

  const previousAccess =
    await getSoloUserAccess({
      organisationId:
        context.organisationId,
      userId: target.id,
    });

  const currentlyManagesPermissions =
    previousAccess?.permissions.includes(
      "permissions:manage",
    ) ?? false;

  const willManagePermissions =
    nextPermissions.has(
      "permissions:manage",
    );

  /*
    Never leave an organisation without anyone
    capable of managing permissions.
  */
  if (
    currentlyManagesPermissions &&
    !willManagePermissions
  ) {
    const hasOtherManager =
      await organisationHasOtherPermissionManager(
        {
          organisationId:
            context.organisationId,

          targetUserId:
            target.id,
        },
      );

    if (!hasOtherManager) {
      redirect(
        `/home/team/members/${target.id}?error=last_permission_manager`,
      );
    }
  }

  /*
    Resolve the underlying application role BEFORE
    entering the database update.

    nextRole is now typed directly from users.role,
    so Drizzle knows this value is valid.
  */
  const nextRole: UserRole =
    resolveUserRoleForPreset({
      preset: rawPreset,
      currentRole:
        target.role,
    });

  await database.transaction(
    async (tx) => {
      await tx
        .update(users)
        .set({
          soloAccessPreset:
            rawPreset,

          role:
            nextRole,
        })
        .where(
          and(
            eq(
              users.id,
              target.id,
            ),

            eq(
              users.organisationId,
              context.organisationId,
            ),
          ),
        );

      /*
        Reset previous custom permission rows.

        Presets do not need individual permission
        rows because their effective permissions
        come directly from the preset definition.
      */
      await tx
        .delete(userPermissions)
        .where(
          and(
            eq(
              userPermissions.organisationId,
              context.organisationId,
            ),

            eq(
              userPermissions.userId,
              target.id,
            ),
          ),
        );

      /*
        Custom access stores an explicit allow/deny
        decision for every recognised Solo permission.
      */
   if (rawPreset === "custom") {
  const now = new Date();

  const permissionRows: Array<
    typeof userPermissions.$inferInsert
  > = SOLO_PERMISSIONS.map((permission) => {
    const effect: "allow" | "deny" =
      nextPermissions.has(permission)
        ? "allow"
        : "deny";

    return {
      organisationId:
        context.organisationId,

      userId:
        target.id,

      permission,

      effect,

      createdByUserId:
        context.userId,

      createdAt:
        now,

      updatedAt:
        now,
    };
  });

  await tx
    .insert(userPermissions)
    .values(permissionRows);
}
    },
  );

  await writeSoloAccessAudit({
    organisationId:
      context.organisationId,

    actorUserId:
      context.userId,

    targetUserId:
      target.id,

    action:
      "USER_ACCESS_CHANGED",

    previousState: {
      preset:
        previousAccess?.preset ??
        null,

      permissions:
        previousAccess?.permissions ??
        [],
    },

    newState: {
      preset:
        rawPreset,

      permissions:
        Array.from(
          nextPermissions,
        ),
    },
  });

  revalidatePath(
    "/home/team/members",
  );

  revalidatePath(
    `/home/team/members/${target.id}`,
  );

  revalidatePath(
    "/home",
  );

  redirect(
    `/home/team/members/${target.id}?success=access_updated`,
  );
}

/* =========================================================
   SUSPEND MEMBER
========================================================= */

export async function suspendMemberAction(
  formData: FormData,
) {
  const context =
    await requireSoloPermission(
      "team:manage",
    );

  const userId = cleanString(
    formData.get("userId"),
  );

  if (!userId) {
    redirect(
      "/home/team/members?error=user_not_found",
    );
  }

  if (
    userId === context.userId
  ) {
    redirect(
      "/home/team/members?error=cannot_suspend_yourself",
    );
  }

  const target = await getTargetUser({
    organisationId:
      context.organisationId,

    userId,
  });

  if (
    !target ||
    target.role === "platform_admin"
  ) {
    redirect(
      "/home/team/members?error=user_not_found",
    );
  }

  const targetAccess =
    await getSoloUserAccess({
      organisationId:
        context.organisationId,

      userId:
        target.id,
    });

  /*
    Do not suspend the organisation's last
    permission manager.
  */
  if (
    targetAccess?.permissions.includes(
      "permissions:manage",
    )
  ) {
    const hasOtherManager =
      await organisationHasOtherPermissionManager(
        {
          organisationId:
            context.organisationId,

          targetUserId:
            target.id,
        },
      );

    if (!hasOtherManager) {
      redirect(
        "/home/team/members?error=last_permission_manager",
      );
    }
  }

  await database
    .update(users)
    .set({
      status:
        "SUSPENDED",

      isActive:
        false,

      isSuspended:
        true,
    })
    .where(
      and(
        eq(
          users.id,
          target.id,
        ),

        eq(
          users.organisationId,
          context.organisationId,
        ),
      ),
    );

  await writeSoloAccessAudit({
    organisationId:
      context.organisationId,

    actorUserId:
      context.userId,

    targetUserId:
      target.id,

    action:
      "USER_SUSPENDED",

    previousState: {
      status:
        target.status,

      isActive:
        target.isActive,

      isSuspended:
        target.isSuspended,
    },

    newState: {
      status:
        "SUSPENDED",

      isActive:
        false,

      isSuspended:
        true,
    },
  });

  revalidatePath(
    "/home/team/members",
  );

  revalidatePath(
    `/home/team/members/${target.id}`,
  );
}

/* =========================================================
   REACTIVATE MEMBER
========================================================= */

export async function reactivateMemberAction(
  formData: FormData,
) {
  const context =
    await requireSoloPermission(
      "team:manage",
    );

  const userId = cleanString(
    formData.get("userId"),
  );

  const target = userId
    ? await getTargetUser({
        organisationId:
          context.organisationId,

        userId,
      })
    : null;

  if (
    !target ||
    target.role === "platform_admin"
  ) {
    redirect(
      "/home/team/members?error=user_not_found",
    );
  }

  await database
    .update(users)
    .set({
      status:
        "ACTIVE",

      isActive:
        true,

      isSuspended:
        false,
    })
    .where(
      and(
        eq(
          users.id,
          target.id,
        ),

        eq(
          users.organisationId,
          context.organisationId,
        ),
      ),
    );

  await writeSoloAccessAudit({
    organisationId:
      context.organisationId,

    actorUserId:
      context.userId,

    targetUserId:
      target.id,

    action:
      "USER_REACTIVATED",

    previousState: {
      status:
        target.status,

      isActive:
        target.isActive,

      isSuspended:
        target.isSuspended,
    },

    newState: {
      status:
        "ACTIVE",

      isActive:
        true,

      isSuspended:
        false,
    },
  });

  revalidatePath(
    "/home/team/members",
  );

  revalidatePath(
    `/home/team/members/${target.id}`,
  );
}

/* =========================================================
   CANCEL INVITE
========================================================= */

export async function cancelInviteAction(
  formData: FormData,
) {
  const context =
    await requireSoloPermission(
      "team:manage",
    );

  const userId = cleanString(
    formData.get("userId"),
  );

  const target = userId
    ? await getTargetUser({
        organisationId:
          context.organisationId,

        userId,
      })
    : null;

  if (
    !target ||
    target.status !== "INVITED"
  ) {
    redirect(
      "/home/team/members?error=invite_not_found",
    );
  }

  await writeSoloAccessAudit({
    organisationId:
      context.organisationId,

    actorUserId:
      context.userId,

    targetUserId:
      target.id,

    action:
      "USER_INVITE_CANCELLED",

    previousState: {
      name:
        target.name,

      email:
        target.email,

      status:
        target.status,

      soloAccessPreset:
        target.soloAccessPreset,
    },
  });

  await database
    .delete(users)
    .where(
      and(
        eq(
          users.id,
          target.id,
        ),

        eq(
          users.organisationId,
          context.organisationId,
        ),
      ),
    );

  revalidatePath(
    "/home/team/members",
  );
}

/* =========================================================
   RESEND TEAM INVITE
========================================================= */

export async function resendTeamInviteAction(
  userId: string,
) {
  const context =
    await requireSoloPermission(
      "team:manage",
    );

  const target =
    await getTargetUser({
      organisationId:
        context.organisationId,

      userId,
    });

  if (
    !target ||
    target.status !== "INVITED"
  ) {
    return {
      success: false,
      message:
        "Invitation not found.",
    } as const;
  }

  /*
    Generate a fresh invite token rather than
    reusing an old or expired one.
  */
  const token =
    crypto
      .randomBytes(32)
      .toString("hex");

  const inviteExpiry =
    new Date();

  inviteExpiry.setDate(
    inviteExpiry.getDate() + 7,
  );

  await database
    .update(users)
    .set({
      inviteToken:
        token,

      inviteExpiry,
    })
    .where(
      and(
        eq(
          users.id,
          target.id,
        ),

        eq(
          users.organisationId,
          context.organisationId,
        ),
      ),
    );

  await writeSoloAccessAudit({
    organisationId:
      context.organisationId,

    actorUserId:
      context.userId,

    targetUserId:
      target.id,

    action:
      "USER_INVITE_RESENT",

    newState: {
      inviteExpiry,
    },
  });

  revalidatePath(
    "/home/team/members",
  );

  return {
    success: true,

    token,

    name:
      target.name,

    email:
      target.email,
  } as const;
}