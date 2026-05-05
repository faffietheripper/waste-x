import { database } from "@/db/database";
import { carrierAssignments, organisations, wasteListings } from "@/db/schema";
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

type DepartmentType = "generator" | "carrier" | "compliance";

type AssignmentStatus =
  | "pending"
  | "accepted"
  | "carrier_pending"
  | "in_progress"
  | "completed"
  | "rejected"
  | "cancelled";

export async function getAssignmentsByDepartment({
  organisationId,
  departmentType,
  statusFilter,
  includeManagerAssignments = false,
}: {
  organisationId: string;
  departmentType: DepartmentType;
  statusFilter?: AssignmentStatus[];
  includeManagerAssignments?: boolean;
}) {
  const generatorOrg = alias(organisations, "generatorOrg");
  const managerOrg = alias(organisations, "managerOrg");
  const carrierOrg = alias(organisations, "carrierOrg");

  const baseFilter =
    departmentType === "generator"
      ? or(
          eq(carrierAssignments.organisationId, organisationId),
          eq(carrierAssignments.assignedByOrganisationId, organisationId),
        )
      : departmentType === "carrier"
        ? or(
            eq(carrierAssignments.carrierOrganisationId, organisationId),
            eq(carrierAssignments.organisationId, organisationId),
          )
        : or(
            eq(carrierAssignments.organisationId, organisationId),
            eq(carrierAssignments.assignedByOrganisationId, organisationId),
            eq(carrierAssignments.carrierOrganisationId, organisationId),
          );

  const visibilityFilter = includeManagerAssignments
    ? or(
        baseFilter,
        eq(carrierAssignments.managerOrganisationId, organisationId),
      )
    : baseFilter;

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
