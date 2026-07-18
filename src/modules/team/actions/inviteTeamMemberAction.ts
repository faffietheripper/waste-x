"use server";

import { inviteTeamMember } from "../core/inviteTeamMember";

type InviteTeamMemberActionInput = {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";

  /*
    New system:
    each user has one departmentId.
  */
  departmentId?: string | null;

  /*
    Backwards compatibility:
    older forms may still send departments: string[].
    We take the first selected department.
  */
  departments?: string[];
};

export async function inviteTeamMemberAction(data: InviteTeamMemberActionInput) {
  const departmentId =
    data.departmentId?.trim() ||
    data.departments?.find((department) => department.trim().length > 0)?.trim();

  if (!departmentId) {
    return {
      success: false,
      message: "Please select a department for this team member.",
    };
  }

  return inviteTeamMember({
    name: data.name,
    email: data.email,
    role: data.role,
    departmentId,
  });
}