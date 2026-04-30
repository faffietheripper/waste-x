import crypto from "crypto";
import { and, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, departments } from "@/db/schema";

type InviteTeamMemberInput = {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
  departmentId: string;
};

export async function inviteTeamMember(input: InviteTeamMemberInput) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return {
      success: false,
      message: "You must belong to an organisation to invite members.",
    };
  }

  if (!input.name || !input.email || !input.role || !input.departmentId) {
    return {
      success: false,
      message: "Name, email, role and department are required.",
    };
  }

  const existingUser = await database.query.users.findFirst({
    where: eq(users.email, input.email),
  });

  if (existingUser) {
    return {
      success: false,
      message: "A user with this email already exists.",
    };
  }

  const department = await database.query.departments.findFirst({
    where: and(
      eq(departments.id, input.departmentId),
      eq(departments.organisationId, session.user.organisationId),
    ),
  });

  if (!department) {
    return {
      success: false,
      message: "Selected department does not belong to this organisation.",
    };
  }

  const token = crypto.randomBytes(32).toString("hex");

  const inviteExpiry = new Date();
  inviteExpiry.setDate(inviteExpiry.getDate() + 7);

  await database.insert(users).values({
    name: input.name,
    email: input.email,
    role: input.role,
    organisationId: session.user.organisationId,
    departmentId: input.departmentId,

    status: "INVITED",
    isActive: false,
    inviteToken: token,
    inviteExpiry,
  });

  return {
    success: true,
    token,
  };
}
