"use server";

import crypto from "crypto";

import { database } from "@/db/database";
import {
  organisations,
  users,
  wasteListings,
  carrierAssignments,
  reviews,
  departments,
} from "@/db/schema";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

/* =========================================
   GET ALL ORGANISATIONS (WITH SEARCH)
========================================= */

export async function getAllOrganisations(search?: string) {
  const query = database
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
    .groupBy(organisations.id);

  if (search) {
    query.where(
      or(
        ilike(organisations.teamName, `%${search}%`),
        ilike(organisations.emailAddress, `%${search}%`),
      ),
    );
  }

  return query.orderBy(desc(organisations.createdAt));
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

  const defaultDepartments = [
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Generator Operations",
      type: "generator" as const,
    },
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Carrier Operations",
      type: "carrier" as const,
    },
    {
      id: crypto.randomUUID(),
      organisationId: orgId,
      name: "Compliance",
      type: "compliance" as const,
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

  const complianceDepartment = allDepartments.find(
    (department) => department.type === "compliance",
  );

  if (!complianceDepartment) {
    throw new Error("Failed to create compliance department.");
  }

  return {
    complianceDepartmentId: complianceDepartment.id,
  };
}

/* =========================================
   ASSIGN FIRST ADMIN TO COMPLIANCE
========================================= */

async function assignFirstAdminToComplianceDepartment({
  orgId,
  complianceDepartmentId,
}: {
  orgId: string;
  complianceDepartmentId: string;
}) {
  const firstAdmin = await database.query.users.findFirst({
    where: and(
      eq(users.organisationId, orgId),
      or(eq(users.role, "administrator"), eq(users.role, "seniorManagement")),
    ),
  });

  if (!firstAdmin) return;

  if (firstAdmin.departmentId) return;

  await database
    .update(users)
    .set({
      departmentId: complianceDepartmentId,
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

  await database
    .update(organisations)
    .set({
      status: "ACTIVE",
    })
    .where(eq(organisations.id, orgId));

  const { complianceDepartmentId } =
    await ensureDefaultDepartmentsForOrganisation(orgId);

  await assignFirstAdminToComplianceDepartment({
    orgId,
    complianceDepartmentId,
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
