// src/modules/auth/core/requireOperationalPermission.ts

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";

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

type OperationalUser = typeof users.$inferSelect & {
  organisation: any;
  department:
    | {
        id: string;
        name: string;
        type: string;
      }
    | null;
};

type OperationalPermissionContext = {
  user: OperationalUser;
  organisation: any;
  department: OperationalDepartmentContext;
  departmentLabel: string;
  capabilities: Capability[];
  departmentType: DepartmentType;
  storedDepartmentType: DepartmentType | null;
  isSoloOrganisation: boolean;
};

/* =========================================================
   SOLO HELPERS
========================================================= */

function isSoloOperatingMode(value: unknown) {
  return String(value ?? "").toLowerCase() === "solo";
}

function getSoloEffectiveCapabilities(capabilities: Capability[]) {
  const next = new Set<Capability>(capabilities);

  next.add("generator");
  next.add("carrier");
  next.add("manager");

  return Array.from(next);
}

function getSoloDepartmentTypeForPermission(permission: Permission) {
  /*
    HARD SOLO BYPASS

    Solo mode must not trust user.departmentId or user.department.type.

    Even if the database says the user is in Compliance, solo workflow should
    behave as a full single-operator workspace.

    Access is driven by:
    - organisation.operatingMode = "solo"
    - effective capabilities = generator + carrier + manager
    - the permission being requested
  */

  return (
    getEffectiveDepartmentTypeForPermission({
      operatingMode: "solo",
      departmentType: "generator",
      permission,
    }) ?? "generator"
  );
}

/* =========================================================
   REQUIRE OPERATIONAL PERMISSION
========================================================= */

export async function requireOperationalPermission(
  permission: Permission,
): Promise<OperationalPermissionContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const user = (await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  })) as OperationalUser | undefined;

  if (!user?.organisationId || !user.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const isSoloOrganisation = isSoloOperatingMode(user.organisation.operatingMode);

  /*
    Team organisations still require a real department.
    Solo organisations do not. They get a synthetic solo workspace below.
  */
  if (!user.department && !isSoloOrganisation) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const storedDepartment = user.department;

  const storedDepartmentType =
    (storedDepartment?.type as DepartmentType | undefined) ?? null;

  const storedCapabilities =
    (user.organisation.capabilities as Capability[] | null) ?? [];

  const capabilities = isSoloOrganisation
    ? getSoloEffectiveCapabilities(storedCapabilities)
    : storedCapabilities;

  const departmentType = isSoloOrganisation
    ? getSoloDepartmentTypeForPermission(permission)
    : getEffectiveDepartmentTypeForPermission({
        operatingMode: user.organisation.operatingMode,
        departmentType: storedDepartmentType,
        permission,
      });

  if (!departmentType) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  /*
    Important:
    For solo mode, pass EFFECTIVE capabilities and EFFECTIVE department type.
    Do not pass storedDepartmentType, because it may still be "compliance".
  */
  const allowed = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission,
    operatingMode: user.organisation.operatingMode,
  });

  if (!allowed) {
    redirect("/home?reason=unauthorised");
  }

  const department: OperationalDepartmentContext = isSoloOrganisation
    ? {
        id: "solo-workspace",
        name: "Solo Workspace",
        type: departmentType,
        isSyntheticSoloDepartment: true,
      }
    : storedDepartment
      ? {
          id: storedDepartment.id,
          name: storedDepartment.name,
          type: storedDepartment.type as DepartmentType,
          isSyntheticSoloDepartment: false,
        }
      : {
          id: "missing-department",
          name: "Missing Department",
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