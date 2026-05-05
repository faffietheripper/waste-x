import { database } from "@/db/database";
import { carrierAssignments, organisations, wasteListings } from "@/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

/* =========================================================
   TYPES
========================================================= */

type DepartmentType = "generator" | "carrier" | "manager" | "compliance";

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

/* =========================================================
   QUERY
========================================================= */

export async function getAssignmentsByDepartment({
  organisationId,
  departmentType,
  statusFilter,
}: {
  organisationId: string;
  departmentType: DepartmentType;
  statusFilter?: AssignmentStatus[];
}) {
  const generatorOrg = alias(organisations, "generatorOrg");
  const managerOrg = alias(organisations, "managerOrg");
  const carrierOrg = alias(organisations, "carrierOrg");

  /*
    Department rules:

    generator:
      sees assignments created by / owned by their organisation

    manager:
      sees assignments where their organisation is the assigned waste manager

    carrier:
      sees assignments where their organisation is the assigned carrier

    compliance:
      sees anything involving their organisation
  */

  const visibilityFilter =
    departmentType === "generator"
      ? or(
          eq(carrierAssignments.organisationId, organisationId),
          eq(carrierAssignments.assignedByOrganisationId, organisationId),
        )
      : departmentType === "manager"
        ? eq(carrierAssignments.managerOrganisationId, organisationId)
        : departmentType === "carrier"
          ? eq(carrierAssignments.carrierOrganisationId, organisationId)
          : or(
              eq(carrierAssignments.organisationId, organisationId),
              eq(carrierAssignments.assignedByOrganisationId, organisationId),
              eq(carrierAssignments.managerOrganisationId, organisationId),
              eq(carrierAssignments.carrierOrganisationId, organisationId),
            );

  const finalFilter = statusFilter?.length
    ? and(visibilityFilter, inArray(carrierAssignments.status, statusFilter))
    : visibilityFilter;

  return database
    .select({
      id: carrierAssignments.id,

      organisationId: carrierAssignments.organisationId,
      listingId: carrierAssignments.listingId,

      managerOrganisationId: carrierAssignments.managerOrganisationId,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,

      assignmentMethod: carrierAssignments.assignmentMethod,
      bidId: carrierAssignments.bidId,
      status: carrierAssignments.status,

      verificationCode: carrierAssignments.verificationCode,

      assignedAt: carrierAssignments.assignedAt,
      managerAcceptedAt: carrierAssignments.managerAcceptedAt,
      carrierAssignedAt: carrierAssignments.carrierAssignedAt,
      respondedAt: carrierAssignments.respondedAt,
      collectedAt: carrierAssignments.collectedAt,
      completedAt: carrierAssignments.completedAt,

      listingName: wasteListings.name,
      listingLocation: wasteListings.location,

      generatorOrgName: generatorOrg.teamName,
      managerOrgName: managerOrg.teamName,
      carrierOrgName: carrierOrg.teamName,
    })
    .from(carrierAssignments)
    .leftJoin(wasteListings, eq(wasteListings.id, carrierAssignments.listingId))
    .leftJoin(
      generatorOrg,
      eq(generatorOrg.id, carrierAssignments.organisationId),
    )
    .leftJoin(
      managerOrg,
      eq(managerOrg.id, carrierAssignments.managerOrganisationId),
    )
    .leftJoin(
      carrierOrg,
      eq(carrierOrg.id, carrierAssignments.carrierOrganisationId),
    )
    .where(finalFilter)
    .orderBy(desc(carrierAssignments.assignedAt));
}
