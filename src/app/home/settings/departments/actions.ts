"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { departments, organisations, users } from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

type ActionResult = {
  success: boolean;
  message: string;
};

type AdminContext =
  | {
      success: true;
      userId: string;
      organisationId: string;
    }
  | {
      success: false;
      message: string;
    };

/* =========================================================
   ADMIN GUARD
========================================================= */

async function requireOrganisationAdministrator(): Promise<AdminContext> {
  const { userId, organisationId } = await requireOrgUser();

  const currentUser = await database.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.organisationId, organisationId)),
    columns: {
      id: true,
      role: true,
    },
  });

  if (!currentUser || currentUser.role !== "administrator") {
    return {
      success: false,
      message: "Only organisation administrators can make this change.",
    };
  }

  return {
    success: true,
    userId,
    organisationId,
  };
}

/* =========================================================
   HELPERS
========================================================= */

function isValidDepartmentType(value: unknown): value is DepartmentType {
  return (
    value === "generator" ||
    value === "manager" ||
    value === "carrier" ||
    value === "compliance"
  );
}

function cleanName(value: FormDataEntryValue | null) {
  return value?.toString().trim() ?? "";
}

function getRecommendedDepartmentName(type: DepartmentType) {
  switch (type) {
    case "generator":
      return "Generator Operations";

    case "manager":
      return "Manager Operations";

    case "carrier":
      return "Logistics";

    case "compliance":
      return "Compliance & Audit";

    default:
      return "Department";
  }
}

function getRecommendedTypesFromCapabilities(
  capabilities: ("generator" | "carrier" | "manager")[],
): DepartmentType[] {
  const recommended = new Set<DepartmentType>();

  if (capabilities.includes("generator")) {
    recommended.add("generator");
  }

  if (capabilities.includes("manager")) {
    recommended.add("manager");
  }

  if (capabilities.includes("carrier")) {
    recommended.add("carrier");
  }

  recommended.add("compliance");

  return Array.from(recommended);
}

/* =========================================================
   CREATE DEPARTMENT
========================================================= */

export async function createDepartmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { organisationId } = admin;

  const name = cleanName(formData.get("name"));
  const type = formData.get("type")?.toString();

  if (!name) {
    return {
      success: false,
      message: "Department name is required.",
    };
  }

  if (!isValidDepartmentType(type)) {
    return {
      success: false,
      message: "Invalid department type.",
    };
  }

  /*
    Check organisation capabilities first.

    Example:
    - If the organisation does not have carrier capability,
      it should not be able to create a carrier/logistics department.
    - Compliance is always allowed.
  */
  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });

  if (!organisation) {
    return {
      success: false,
      message: "Organisation not found.",
    };
  }

  const capabilities =
    (organisation.capabilities as ("generator" | "carrier" | "manager")[]) ??
    [];

  const recommendedTypes = getRecommendedTypesFromCapabilities(capabilities);

  if (!recommendedTypes.includes(type)) {
    return {
      success: false,
      message:
        "This department type is not available for your organisation capabilities.",
    };
  }

  /*
    Fetch all departments once so we can check:
    - total count
    - duplicate names
    - duplicate department types
  */
  const existingDepartments = await database.query.departments.findMany({
    where: eq(departments.organisationId, organisationId),
  });

  const existingByName = existingDepartments.find(
    (department) =>
      department.name.trim().toLowerCase() === name.trim().toLowerCase(),
  );

  if (existingByName) {
    return {
      success: false,
      message: "A department with this name already exists.",
    };
  }

  const existingByType = existingDepartments.find(
    (department) => department.type === type,
  );

  if (existingByType) {
    return {
      success: false,
      message: `A ${type} department already exists for this organisation.`,
    };
  }

  /*
    Waste X only supports one of each manageable department type:
    generator, manager, carrier, compliance.
  */
  if (existingDepartments.length >= 4) {
    return {
      success: false,
      message:
        "This organisation already has the maximum number of departments.",
    };
  }

  await database.insert(departments).values({
    id: crypto.randomUUID(),
    organisationId,
    name,
    type,
  });

  revalidatePath("/home/settings/departments");

  return {
    success: true,
    message: "Department created successfully.",
  };
}

/* =========================================================
   SET ACTIVE DEPARTMENT

   Kept administrator-only because you asked for this settings page
   to be view-only for non-admin users.
========================================================= */

export async function setActiveDepartmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { userId, organisationId } = admin;

  const departmentId = formData.get("departmentId")?.toString();

  if (!departmentId) {
    return {
      success: false,
      message: "Missing department ID.",
    };
  }

  const department = await database.query.departments.findFirst({
    where: and(
      eq(departments.id, departmentId),
      eq(departments.organisationId, organisationId),
    ),
  });

  if (!department) {
    return {
      success: false,
      message: "Department not found for this organisation.",
    };
  }

  await database
    .update(users)
    .set({
      departmentId,
    })
    .where(and(eq(users.id, userId), eq(users.organisationId, organisationId)));

  revalidatePath("/home/settings/departments");
  revalidatePath("/home");
  revalidatePath("/home/operations/assignments");
  revalidatePath("/home/operations/assignments/active");

  return {
    success: true,
    message: `Active department changed to ${department.name}.`,
  };
}

/* =========================================================
   ASSIGN MEMBER TO DEPARTMENT
========================================================= */

export async function assignMemberToDepartmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { organisationId } = admin;

  const memberId = formData.get("memberId")?.toString();
  const departmentId = formData.get("departmentId")?.toString();

  if (!memberId || !departmentId) {
    return {
      success: false,
      message: "Missing member or department ID.",
    };
  }

  const member = await database.query.users.findFirst({
    where: and(
      eq(users.id, memberId),
      eq(users.organisationId, organisationId),
    ),
  });

  if (!member) {
    return {
      success: false,
      message: "Member not found in your organisation.",
    };
  }

  const department = await database.query.departments.findFirst({
    where: and(
      eq(departments.id, departmentId),
      eq(departments.organisationId, organisationId),
    ),
  });

  if (!department) {
    return {
      success: false,
      message: "Department not found in your organisation.",
    };
  }

  await database
    .update(users)
    .set({
      departmentId,
    })
    .where(
      and(eq(users.id, memberId), eq(users.organisationId, organisationId)),
    );

  revalidatePath("/home/settings/departments");
  revalidatePath("/home/team/members");

  return {
    success: true,
    message: `${member.name} assigned to ${department.name}.`,
  };
}

/* =========================================================
   DELETE DEPARTMENT
========================================================= */

export async function deleteDepartmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { organisationId } = admin;

  const departmentId = formData.get("departmentId")?.toString();

  if (!departmentId) {
    return {
      success: false,
      message: "Missing department ID.",
    };
  }

  const department = await database.query.departments.findFirst({
    where: and(
      eq(departments.id, departmentId),
      eq(departments.organisationId, organisationId),
    ),
  });

  if (!department) {
    return {
      success: false,
      message: "Department not found.",
    };
  }

  const membersUsingDepartment = await database.query.users.findMany({
    where: and(
      eq(users.organisationId, organisationId),
      eq(users.departmentId, departmentId),
    ),
  });

  if (membersUsingDepartment.length > 0) {
    return {
      success: false,
      message:
        "This department has assigned members. Move them before deleting it.",
    };
  }

  await database
    .delete(departments)
    .where(
      and(
        eq(departments.id, departmentId),
        eq(departments.organisationId, organisationId),
      ),
    );

  revalidatePath("/home/settings/departments");

  return {
    success: true,
    message: "Department deleted successfully.",
  };
}

/* =========================================================
   ENSURE RECOMMENDED DEPARTMENTS
========================================================= */

export async function ensureRecommendedDepartmentsAction(): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { organisationId } = admin;

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
  });

  if (!organisation) {
    return {
      success: false,
      message: "Organisation not found.",
    };
  }

  const capabilities =
    (organisation.capabilities as ("generator" | "carrier" | "manager")[]) ??
    [];

  const recommendedTypes = getRecommendedTypesFromCapabilities(capabilities);

  const existingDepartments = await database.query.departments.findMany({
    where: eq(departments.organisationId, organisationId),
  });

  const existingTypes = new Set(existingDepartments.map((d) => d.type));

  const missingTypes = recommendedTypes.filter(
    (type) => !existingTypes.has(type),
  );

  if (missingTypes.length === 0) {
    return {
      success: true,
      message: "Recommended departments already exist.",
    };
  }

  await database.insert(departments).values(
    missingTypes.map((type) => ({
      id: crypto.randomUUID(),
      organisationId,
      name: getRecommendedDepartmentName(type),
      type,
    })),
  );

  revalidatePath("/home/settings/departments");

  return {
    success: true,
    message: "Recommended departments created successfully.",
  };
}

/* =========================================================
   CLEAR MEMBER DEPARTMENT
========================================================= */

export async function clearMemberDepartmentAction(
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireOrganisationAdministrator();

  if (!admin.success) {
    return admin;
  }

  const { organisationId } = admin;

  const memberId = formData.get("memberId")?.toString();

  if (!memberId) {
    return {
      success: false,
      message: "Missing member ID.",
    };
  }

  const member = await database.query.users.findFirst({
    where: and(
      eq(users.id, memberId),
      eq(users.organisationId, organisationId),
    ),
  });

  if (!member) {
    return {
      success: false,
      message: "Member not found in your organisation.",
    };
  }

  await database
    .update(users)
    .set({
      departmentId: null,
    })
    .where(
      and(eq(users.id, memberId), eq(users.organisationId, organisationId)),
    );

  revalidatePath("/home/settings/departments");

  return {
    success: true,
    message: `${member.name} has been removed from their department.`,
  };
}