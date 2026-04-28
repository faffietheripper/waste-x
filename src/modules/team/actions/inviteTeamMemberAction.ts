"use server";

import { inviteTeamMember } from "../core/inviteTeamMember";

export async function inviteTeamMemberAction(data: {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
  departments: string[];
}) {
  return inviteTeamMember(data);
}
