// src/modules/auth/core/requireOperationalPermission.ts

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  departments,
  organisations,
  users,
} from "@/db/schema";

import {
  type Capability,
  type DepartmentType,
  type Permission,
  getEffectiveDepartmentTypeForPermission,
  hasOperationalPermissionForOrganisation,
} from "./permissions";

import {
  getEffectiveOrganisationCapabilities,
  getOrganisationOperatingMode,
} from "@/modules/organisations/core/operatingModes";

/* =========================================================
   TYPES
========================================================= */

type StoredDepartment = Pick<
  typeof departments.$inferSelect,
  "id" | "name" | "type"
>;

type OperationalUser = typeof users.$inferSelect & {
  organisation: typeof organisations.$inferSelect | null;
  department: StoredDepartment | null;
};

type OperationalDepartmentContext = {
  id: string;
  name: string;
  type: DepartmentType;
  isSyntheticSoloDepartment: boolean;
};

type OperationalPermissionContext = {
  user: OperationalUser;
  organisation: typeof organisations.$inferSelect;

  department: OperationalDepartmentContext;
  departmentLabel: string;

  capabilities: Capability[];

  departmentType: DepartmentType;
  storedDepartmentType: DepartmentType | null;

  isSoloOrganisation: boolean;
};

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

  /* =========================================================
     LOAD USER CONTEXT
  ========================================================= */

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

  const organisation = user.organisation;

  /* =========================================================
     EFFECTIVE OPERATING MODE

     IMPORTANT:

     Do not directly trust:

       organisation.operatingMode

     here.

     The MVP product switch inside operatingModes.ts can force
     the current product experience into Solo Workspace even
     when an older database row still contains "team".

     This keeps the active product behaviour in one place.
  ========================================================= */

  const effectiveOperatingMode =
    getOrganisationOperatingMode(organisation);

  const isSoloOrganisation =
    effectiveOperatingMode === "solo";

  /* =========================================================
     DEPARTMENT REQUIREMENT
  ========================================================= */

  /*
    Legacy/team/network workspaces still need a real department.

    Solo Workspace does not.

    Solo gets a synthetic operational department later based on
    the permission being requested.
  */

  if (!user.department && !isSoloOrganisation) {
    redirect(
      "/home/settings/departments?reason=no-active-department",
    );
  }

  const storedDepartment = user.department;

  const storedDepartmentType =
    (storedDepartment?.type as DepartmentType | undefined) ??
    null;

  /* =========================================================
     CAPABILITIES
  ========================================================= */

  const storedCapabilities =
    (organisation.capabilities as Capability[] | null) ?? [];

  /*
    Solo Workspace still uses the old generator/carrier/manager
    capability system internally as a compatibility bridge.

    This does NOT mean those workspaces are visible in the MVP.

    It simply allows old permission-protected DWT / receiving /
    marketplace code to continue functioning while we rebuild the
    new Solo-native modules.
  */

  const capabilities = isSoloOrganisation
    ? (getEffectiveOrganisationCapabilities(
        organisation,
      ) as Capability[])
    : storedCapabilities;

  /* =========================================================
     EFFECTIVE DEPARTMENT
  ========================================================= */

  const departmentType =
    getEffectiveDepartmentTypeForPermission({
      operatingMode: effectiveOperatingMode,
      departmentType: storedDepartmentType,
      permission,
    });

  if (!departmentType) {
    redirect(
      "/home/settings/departments?reason=no-active-department",
    );
  }

  /* =========================================================
     FINAL PERMISSION CHECK
  ========================================================= */

  /*
    Critical:

    Pass effectiveOperatingMode rather than the raw DB value.

    Example:

      DB:
        operatingMode = "team"

      Waste X MVP:
        SOLO_WORKSPACE_MVP = true

      effectiveOperatingMode:
        "solo"

    Without this, the Solo compatibility bridge would still be
    evaluated as a Team organisation inside permissions.ts.
  */

  const allowed =
    hasOperationalPermissionForOrganisation({
      capabilities,
      departmentType,
      permission,
      operatingMode: effectiveOperatingMode,
    });

  if (!allowed) {
    redirect("/home?reason=unauthorised");
  }

  /* =========================================================
     OPERATIONAL DEPARTMENT CONTEXT
  ========================================================= */

  const department: OperationalDepartmentContext =
    isSoloOrganisation
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
            /*
              Defensive fallback.

              We should never normally reach this branch because
              non-Solo workspaces without a department are redirected
              above.
            */
            id: "missing-department",
            name: "Missing Department",
            type: departmentType,
            isSyntheticSoloDepartment: true,
          };

  /* =========================================================
     RETURN CONTEXT
  ========================================================= */

  return {
    user,

    organisation,

    department,
    departmentLabel: department.name,

    capabilities,

    departmentType,
    storedDepartmentType,

    isSoloOrganisation,
  };
}