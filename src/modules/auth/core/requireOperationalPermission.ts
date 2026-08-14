import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

import {
  type Capability,
  type DepartmentType,
  type Permission,
  getEffectiveDepartmentTypeForPermission,
  hasOperationalPermissionForOrganisation,
} from "./permissions";

type OperationalDepartmentContext = {
  id: string;
  name: string;
  type: DepartmentType;
  isSyntheticSoloDepartment: boolean;
};

type OperationalPermissionContext = {
  user: typeof users.$inferSelect & {
    organisation: any;
    department: any;
  };
  organisation: any;
  department: OperationalDepartmentContext;
  departmentLabel: string;
  capabilities: Capability[];
  departmentType: DepartmentType;
  storedDepartmentType: DepartmentType | null;
  isSoloOrganisation: boolean;
};

function getSoloEffectiveCapabilities(capabilities: Capability[]) {
  const next = new Set<Capability>(capabilities);

  next.add("generator");
  next.add("carrier");
  next.add("manager");

  return Array.from(next);
}

function formatDepartmentName(type: DepartmentType) {
  if (type === "generator") return "Solo Generator Workspace";
  if (type === "carrier") return "Solo Carrier Workspace";
  if (type === "manager") return "Solo Manager Workspace";
  if (type === "compliance") return "Solo Compliance Workspace";

  return "Solo Workspace";
}

export async function requireOperationalPermission(
  permission: Permission,
): Promise<OperationalPermissionContext> {
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
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const isSoloOrganisation = user.organisation.operatingMode === "solo";

  if (!user.department && !isSoloOrganisation) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const storedCapabilities =
    (user.organisation.capabilities as Capability[] | null) ?? [];

  const capabilities = isSoloOrganisation
    ? getSoloEffectiveCapabilities(storedCapabilities)
    : storedCapabilities;

  const storedDepartmentType =
    (user.department?.type as DepartmentType | undefined) ?? null;

  const departmentType = getEffectiveDepartmentTypeForPermission({
    operatingMode: user.organisation.operatingMode,
    departmentType: storedDepartmentType,
    permission,
  });

  if (!departmentType) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const allowed = hasOperationalPermissionForOrganisation({
    capabilities: storedCapabilities,
    departmentType: storedDepartmentType,
    permission,
    operatingMode: user.organisation.operatingMode,
  });

  if (!allowed) {
    redirect("/home?reason=unauthorised");
  }

  const department: OperationalDepartmentContext = user.department
    ? {
        id: user.department.id,
        name: user.department.name,
        type: user.department.type as DepartmentType,
        isSyntheticSoloDepartment: false,
      }
    : {
        id: "solo-workspace",
        name: formatDepartmentName(departmentType),
        type: departmentType,
        isSyntheticSoloDepartment: true,
      };

  return {
    user,
    organisation: user.organisation,
    department,
    departmentLabel: department.name,
    capabilities,
    departmentType,
    storedDepartmentType,
    isSoloOrganisation,
  };
}