"use server";

import type { SoloAccessPreset } from "@/modules/solo-permissions/core/permissions";

import { inviteTeamMember } from "../core/inviteTeamMember";

type InviteTeamMemberActionInput = {
  name: string;
  email: string;
  accessPreset: Exclude<SoloAccessPreset, "custom">;
};

export async function inviteTeamMemberAction(
  data: InviteTeamMemberActionInput,
) {
  return inviteTeamMember({
    name: data.name,
    email: data.email,
    accessPreset: data.accessPreset,
  });
}
