import { database } from "@/db/database";
import { carrierAssignments, wasteListings, organisations } from "@/db/schema";
import { and, eq, inArray, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

export type DepartmentType = "generator" | "carrier" | "compliance";

export type AssignmentStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AssignmentWithDetails = {
  id: string;
  listingId: number;
  status: AssignmentStatus;
  assignmentMethod: "bid" | "direct" | null;
  verificationCode: string | null;

  organisationId: string;
  carrierOrganisationId: string;
  assignedByOrganisationId: string | null;

  assignedAt: Date | null;
  respondedAt: Date | null;
  collectedAt: Date | null;
  completedAt: Date | null;

  listing: {
    id: number;
    name: string;
    location: string;
    status: string | null;
  };

  carrierOrg: {
    id: string;
    name: string;
  };

  generatorOrg: {
    id: string;
    name: string;
  };
};

export async function getAssignmentsByDepartment({
  organisationId,
  departmentType,
  statusFilter,
}: {
  organisationId: string;
  departmentType: DepartmentType;
  statusFilter?: AssignmentStatus[];
}): Promise<AssignmentWithDetails[]> {
  const carrierOrg = alias(organisations, "carrierOrg");
  const generatorOrg = alias(organisations, "generatorOrg");

  let baseCondition;

  if (departmentType === "generator") {
    baseCondition = eq(carrierAssignments.organisationId, organisationId);
  } else if (departmentType === "carrier") {
    baseCondition = eq(
      carrierAssignments.carrierOrganisationId,
      organisationId,
    );
  } else if (departmentType === "compliance") {
    baseCondition = or(
      eq(carrierAssignments.organisationId, organisationId),
      eq(carrierAssignments.carrierOrganisationId, organisationId),
    );
  } else {
    throw new Error(`INVALID_DEPARTMENT_TYPE: ${departmentType}`);
  }

  const finalCondition =
    statusFilter && statusFilter.length > 0
      ? and(baseCondition, inArray(carrierAssignments.status, statusFilter))
      : baseCondition;

  const rows = await database
    .select({
      id: carrierAssignments.id,
      listingId: carrierAssignments.listingId,
      status: carrierAssignments.status,
      assignmentMethod: carrierAssignments.assignmentMethod,
      verificationCode: carrierAssignments.verificationCode,

      organisationId: carrierAssignments.organisationId,
      carrierOrganisationId: carrierAssignments.carrierOrganisationId,
      assignedByOrganisationId: carrierAssignments.assignedByOrganisationId,

      assignedAt: carrierAssignments.assignedAt,
      respondedAt: carrierAssignments.respondedAt,
      collectedAt: carrierAssignments.collectedAt,
      completedAt: carrierAssignments.completedAt,

      listingIdRef: wasteListings.id,
      listingName: wasteListings.name,
      listingLocation: wasteListings.location,
      listingStatus: wasteListings.status,

      carrierOrgId: carrierOrg.id,
      carrierOrgName: carrierOrg.teamName,

      generatorOrgId: generatorOrg.id,
      generatorOrgName: generatorOrg.teamName,
    })
    .from(carrierAssignments)
    .innerJoin(
      wasteListings,
      eq(carrierAssignments.listingId, wasteListings.id),
    )
    .innerJoin(
      carrierOrg,
      eq(carrierAssignments.carrierOrganisationId, carrierOrg.id),
    )
    .innerJoin(
      generatorOrg,
      eq(carrierAssignments.organisationId, generatorOrg.id),
    )
    .where(finalCondition);

  return rows.map((row) => ({
    id: row.id,
    listingId: row.listingId,
    status: row.status as AssignmentStatus,
    assignmentMethod: row.assignmentMethod,
    verificationCode: row.verificationCode,

    organisationId: row.organisationId,
    carrierOrganisationId: row.carrierOrganisationId,
    assignedByOrganisationId: row.assignedByOrganisationId,

    assignedAt: row.assignedAt,
    respondedAt: row.respondedAt,
    collectedAt: row.collectedAt,
    completedAt: row.completedAt,

    listing: {
      id: row.listingIdRef,
      name: row.listingName,
      location: row.listingLocation,
      status: row.listingStatus,
    },

    carrierOrg: {
      id: row.carrierOrgId,
      name: row.carrierOrgName,
    },

    generatorOrg: {
      id: row.generatorOrgId,
      name: row.generatorOrgName,
    },
  }));
}
