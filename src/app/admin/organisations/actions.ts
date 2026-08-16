"use server";

import crypto from "crypto";
import { and, eq, or } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { database } from "@/db/database";
import { departments, organisations, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { createDefaultSiteForOrganisation } from "@/modules/sites/data-access/createDefaultSiteForOrganisation";

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";
type Capability = "generator" | "carrier" | "manager";

const SOLO_CAPABILITIES: Capability[] = ["generator", "carrier", "manager"];

function isSoloOperatingMode(value: unknown) {
  return String(value ?? "").toLowerCase() === "solo";
}

async function ensureDefaultDepartmentsForOrganisation(orgId: string) {
  const existingDepartments = await database
    .select()
    .from(departments)
    .where(eq(departments.organisationId, orgId));

  const existingTypes = new Set(existingDepartments.map((department) => department.type));

  const defaults: Array<{
    id: string;
    organisationId: string;
    name: string;
    type: DepartmentType;
  }> = [
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Generator Operations",
      type: "generator",
    },
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Waste Manager Operations",
      type: "manager",
    },
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Carrier Operations",
      type: "carrier",
    },
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Compliance",
      type: "compliance",
    },
  ];

  const missing = defaults.filter((department) => !existingTypes.has(department.type));

  if (missing.length > 0) {
    await database.insert(departments).values(missing);
  }

  const allDepartments = await database
    .select()
    .from(departments)
    .where(eq(departments.organisationId, orgId));

  const generator = allDepartments.find((department) => department.type === "generator");
  const compliance = allDepartments.find((department) => department.type === "compliance");

  if (!generator) throw new Error("Failed to create generator department.");
  if (!compliance) throw new Error("Failed to create compliance department.");

  return {
    generatorDepartmentId: generator.id,
    complianceDepartmentId: compliance.id,
  };
}

async function assignSoloUsersToGeneratorDepartment(
  orgId: string,
  generatorDepartmentId: string,
) {
  await database
    .update(users)
    .set({ departmentId: generatorDepartmentId })
    .where(eq(users.organisationId, orgId));
}

async function assignFirstTeamAdminToComplianceDepartment(
  orgId: string,
  complianceDepartmentId: string,
) {
  const firstAdmin = await database.query.users.findFirst({
    where: and(
      eq(users.organisationId, orgId),
      or(eq(users.role, "administrator"), eq(users.role, "seniorManagement")),
    ),
  });

  if (!firstAdmin || firstAdmin.departmentId) return;

  await database
    .update(users)
    .set({ departmentId: complianceDepartmentId })
    .where(eq(users.id, firstAdmin.id));
}

export async function approveOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const orgId = String(formData.get("orgId") ?? "").trim();
  if (!orgId) throw new Error("Missing organisation ID");

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, orgId),
  });

  if (!organisation) throw new Error("Organisation not found");

  const isSoloOrganisation = isSoloOperatingMode(organisation.operatingMode);
  const currentCapabilities =
    (organisation.capabilities as Capability[] | null) ?? [];

  const approvedCapabilities = isSoloOrganisation
    ? Array.from(new Set<Capability>([...currentCapabilities, ...SOLO_CAPABILITIES]))
    : currentCapabilities;

  await database
    .update(organisations)
    .set({
      status: "ACTIVE",
      approvedAt: new Date(),
      capabilities: approvedCapabilities,
    })
    .where(eq(organisations.id, orgId));

  const { generatorDepartmentId, complianceDepartmentId } =
    await ensureDefaultDepartmentsForOrganisation(orgId);

  if (isSoloOrganisation) {
    await assignSoloUsersToGeneratorDepartment(orgId, generatorDepartmentId);
  } else {
    await assignFirstTeamAdminToComplianceDepartment(
      orgId,
      complianceDepartmentId,
    );
  }

  await createDefaultSiteForOrganisation({ organisationId: orgId });

  revalidatePath("/admin");
  revalidatePath("/admin/organisations");
  revalidatePath(`/admin/organisations/${orgId}`);
}

export async function rejectOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const orgId = String(formData.get("orgId") ?? "").trim();
  if (!orgId) throw new Error("Missing organisation ID");

  await database
    .update(organisations)
    .set({ status: "REJECTED" })
    .where(eq(organisations.id, orgId));

  revalidatePath("/admin");
  revalidatePath("/admin/organisations");
  revalidatePath(`/admin/organisations/${orgId}`);
}
