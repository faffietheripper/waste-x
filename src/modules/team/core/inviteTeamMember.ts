import crypto from "crypto";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { users } from "@/db/schema";
import type { SoloAccessPreset } from "@/modules/solo-permissions/core/permissions";
import { getRoleForPreset } from "@/modules/solo-permissions/core/presets";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";
import { writeSoloAccessAudit } from "@/modules/solo-permissions/core/writeSoloAccessAudit";

type InviteTeamMemberInput = {
  name: string;
  email: string;
  accessPreset: Exclude<SoloAccessPreset, "custom">;
};

export async function inviteTeamMember(input: InviteTeamMemberInput) {
  const context = await requireSoloPermission("team:invite");

  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();

  if (!name || !email || !input.accessPreset) {
    return {
      success: false,
      message: "Name, email and access preset are required.",
    };
  }

  const existingUser = await database.query.users.findFirst({
    where: eq(users.email, email),
    columns: {
      id: true,
    },
  });

  if (existingUser) {
    return {
      success: false,
      message: "A user with this email already exists.",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");

  const inviteExpiry = new Date();
  inviteExpiry.setDate(inviteExpiry.getDate() + 7);

  const [created] = await database
    .insert(users)
    .values({
      name,
      email,
      role: getRoleForPreset({
        preset: input.accessPreset,
        currentRole: "operations",
      }),
      soloAccessPreset: input.accessPreset,
      organisationId: context.organisationId,

      // Solo Workspace intentionally does not require a department.
      departmentId: null,

      status: "INVITED",
      isActive: false,
      isSuspended: false,
      inviteToken: token,
      inviteExpiry,
    })
    .returning({
      id: users.id,
    });

  if (!created) {
    return {
      success: false,
      message: "Waste X could not create the invitation.",
    };
  }

  await writeSoloAccessAudit({
    organisationId: context.organisationId,
    actorUserId: context.userId,
    targetUserId: created.id,
    action: "USER_INVITED",
    newState: {
      name,
      email,
      accessPreset: input.accessPreset,
      inviteExpiry,
    },
  });

  return {
    success: true,
    token,
  };
}
