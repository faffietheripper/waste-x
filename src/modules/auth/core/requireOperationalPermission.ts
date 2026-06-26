import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

import {
  Capability,
  DepartmentType,
  Permission,
  hasOperationalPermission,
} from "./permissions";

export async function requireOperationalPermission(permission: Permission) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!user?.organisationId || !user.organisation) {
    redirect("/home/settings/organisation");
  }

  if (!user.department) {
    redirect("/home/settings/departments");
  }

  const capabilities =
    (user.organisation.capabilities as Capability[] | null) ?? [];

  const departmentType = user.department.type as DepartmentType;

  const allowed = hasOperationalPermission({
    capabilities,
    departmentType,
    permission,
  });

  if (!allowed) {
    redirect("/home?reason=unauthorised");
  }

  return {
    user,
    organisation: user.organisation,
    department: user.department,
    capabilities,
    departmentType,
  };
}