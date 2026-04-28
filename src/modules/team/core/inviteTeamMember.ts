import crypto from "crypto";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

type InviteInput = {
  name: string;
  email: string;
  role: "employee" | "seniorManagement" | "administrator";
  departments: string[];
};

const validDepartments = ["generator", "carrier", "compliance"];

export async function inviteTeamMember(input: InviteInput) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return {
      success: false,
      message: "You must belong to an organisation to invite members.",
    };
  }

  if (!input.name || !input.email || !input.role) {
    return {
      success: false,
      message: "Name, email and role are required.",
    };
  }

  if (!input.departments?.length) {
    return {
      success: false,
      message: "Please assign at least one department.",
    };
  }

  const invalidDepartment = input.departments.find(
    (department) => !validDepartments.includes(department),
  );

  if (invalidDepartment) {
    return {
      success: false,
      message: "Invalid department selected.",
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

  const token = crypto.randomBytes(32).toString("hex");

  await database.insert(users).values({
    name: input.name,
    email: input.email,
    role: input.role,
    status: "INVITED",
    organisationId: session.user.organisationId,
    inviteToken: token,

    // Add this field to users schema for now.
    departmentTypes: input.departments,
  });

  return {
    success: true,
    token,
  };
}
