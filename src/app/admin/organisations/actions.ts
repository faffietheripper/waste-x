"use server";

import crypto from "crypto";

import { and, desc, eq, ilike, or, sql } from "drizzle-orm";

import { database } from "@/db/database";
import {
  carrierAssignments,
  departments,
  organisations,
  reviews,
  users,
  wasteListings,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { createDefaultSiteForOrganisation } from "@/modules/sites/data-access/createDefaultSiteForOrganisation";

/* =========================================
   TYPES
========================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";
type Capability = "generator" | "carrier" | "manager";

const SOLO_CAPABILITIES: Capability[] = ["generator", "carrier", "manager"];

/* =========================================
   GET ALL ORGANISATIONS (WITH SEARCH)
========================================= */

export async function getAllOrganisations(search?: string) {
  const searchTerm = search?.trim();

  const searchFilter = searchTerm
    ? or(
        ilike(organisations.teamName, `%${searchTerm}%`),
        ilike(organisations.emailAddress, `%${searchTerm}%`),
      )
    : undefined;

  return database
    .select({
      id: organisations.id,
      teamName: organisations.teamName,
      industry: organisations.industry,
      email: organisations.emailAddress,
      telephone: organisations.telephone,
      country: organisations.country,
      createdAt: organisations.createdAt,
      status: organisations.status,

      memberCount: sql<number>`count(distinct ${users.id})`,
      listingsCount: sql<number>`count(distinct ${wasteListings.id})`,
      carrierJobsCount: sql<number>`count(distinct ${carrierAssignments.id})`,
      avgRating: sql<number>`avg(${reviews.rating})`,
    })
    .from(organisations)
    .leftJoin(users, eq(users.organisationId, organisations.id))
    .leftJoin(wasteListings, eq(wasteListings.organisationId, organisations.id))
    .leftJoin(
      carrierAssignments,
      eq(carrierAssignments.carrierOrganisationId, organisations.id),
    )
    .leftJoin(reviews, eq(reviews.reviewedOrganisationId, organisations.id))
    .where(searchFilter)
    .groupBy(organisations.id)
    .orderBy(desc(organisations.createdAt));
}

/* =========================================
   GET SINGLE ORGANISATION
========================================= */

export async function getOrganisationById(orgId: string) {
  const [org] = await database
    .select({
      id: organisations.id,
      teamName: organisations.teamName,
      industry: organisations.industry,
      email: organisations.emailAddress,
      telephone: organisations.telephone,
      country: organisations.country,
      city: organisations.city,
      region: organisations.region,
      postCode: organisations.postCode,
      streetAddress: organisations.streetAddress,
      createdAt: organisations.createdAt,
      status: organisations.status,

      memberCount: sql<number>`count(distinct ${users.id})`,
      listingsCount: sql<number>`count(distinct ${wasteListings.id})`,
      carrierJobsCount: sql<number>`count(distinct ${carrierAssignments.id})`,
      avgRating: sql<number>`avg(${reviews.rating})`,
    })
    .from(organisations)
    .leftJoin(users, eq(users.organisationId, organisations.id))
    .leftJoin(wasteListings, eq(wasteListings.organisationId, organisations.id))
    .leftJoin(
      carrierAssignments,
      eq(carrierAssignments.carrierOrganisationId, organisations.id),
    )
    .leftJoin(reviews, eq(reviews.reviewedOrganisationId, organisations.id))
    .where(eq(organisations.id, orgId))
    .groupBy(organisations.id);

  return org;
}

/* =========================================
   ENSURE DEFAULT DEPARTMENTS
========================================= */

async function ensureDefaultDepartmentsForOrganisation(orgId: string) {
  const existingDepartments = await database
    .select()
    .from(departments)
    .where(eq(departments.organisationId, orgId));

  const existingTypes = existingDepartments.map(
    (department) => department.type,
  );

  const defaultDepartments: {
    id: string;
    organisationId: string;
    name: string;
    type: DepartmentType;
  }[] = [
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

  const departmentsToCreate = defaultDepartments.filter(
    (department) => !existingTypes.includes(department.type),
  );

  if (departmentsToCreate.length > 0) {
    await database.insert(departments).values(departmentsToCreate);
  }

  const allDepartments = await database
    .select()
    .from(departments)
    .where(eq(departments.organisationId, orgId));

  const generatorDepartment = allDepartments.find(
    (department) => department.type === "generator",
  );

  const managerDepartment = allDepartments.find(
    (department) => department.type === "manager",
  );

  const carrierDepartment = allDepartments.find(
    (department) => department.type === "carrier",
  );

  const complianceDepartment = allDepartments.find(
    (department) => department.type === "compliance",
  );

  if (!generatorDepartment) {
    throw new Error("Failed to create generator department.");
  }

  if (!managerDepartment) {
    throw new Error("Failed to create manager department.");
  }

  if (!carrierDepartment) {
    throw new Error("Failed to create carrier department.");
  }

  if (!complianceDepartment) {
    throw new Error("Failed to create compliance department.");
  }

  return {
    generatorDepartmentId: generatorDepartment.id,
    managerDepartmentId: managerDepartment.id,
    carrierDepartmentId: carrierDepartment.id,
    complianceDepartmentId: complianceDepartment.id,
  };
}

/* =========================================
   ASSIGN FIRST ADMIN TO DEFAULT DEPARTMENT
========================================= */

async function assignFirstAdminToDefaultDepartment({
  orgId,
  defaultDepartmentId,
  forceForSolo,
}: {
  orgId: string;
  defaultDepartmentId: string;
  forceForSolo: boolean;
}) {
  const firstAdmin = await database.query.users.findFirst({
    where: and(
      eq(users.organisationId, orgId),
      or(eq(users.role, "administrator"), eq(users.role, "seniorManagement")),
    ),
  });

  if (!firstAdmin) return;

  /*
    Team orgs:
    - do not override existing department.

    Solo orgs:
    - force first admin into Generator so they can immediately create waste records.
  */
  if (firstAdmin.departmentId && !forceForSolo) return;

  if (firstAdmin.departmentId === defaultDepartmentId) return;

  await database
    .update(users)
    .set({
      departmentId: defaultDepartmentId,
    })
    .where(eq(users.id, firstAdmin.id));
}

/* =========================================
   APPROVE ORGANISATION
========================================= */

export async function approveOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const orgId = formData.get("orgId")?.toString();

  if (!orgId) {
    throw new Error("Missing organisation ID");
  }

  const [organisation] = await database
    .select()
    .from(organisations)
    .where(eq(organisations.id, orgId));

  if (!organisation) {
    throw new Error("Organisation not found");
  }

  const isSoloOrganisation = organisation.operatingMode === "solo";

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

  const {
    generatorDepartmentId,
    complianceDepartmentId,
  } = await ensureDefaultDepartmentsForOrganisation(orgId);

  const defaultAdminDepartmentId = isSoloOrganisation
    ? generatorDepartmentId
    : complianceDepartmentId;

  await assignFirstAdminToDefaultDepartment({
    orgId,
    defaultDepartmentId: defaultAdminDepartmentId,
    forceForSolo: isSoloOrganisation,
  });

  /*
    Site model safety check.

    New organisations should already get a Main Site during organisation
    creation. This keeps approval safe for older pending organisations or any
    organisation created before the sites model existed.
  */
  await createDefaultSiteForOrganisation({
    organisationId: orgId,
  });
}

/* =========================================
   REJECT ORGANISATION
========================================= */

export async function rejectOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const orgId = formData.get("orgId")?.toString();

  if (!orgId) {
    throw new Error("Missing organisation ID");
  }

  await database
    .update(organisations)
    .set({
      status: "REJECTED",
    })
    .where(eq(organisations.id, orgId));
}