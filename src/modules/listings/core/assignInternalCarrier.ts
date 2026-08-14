import { database } from "@/db/database";
import {
  carrierAssignments,
  departments,
  organisations,
  wasteListings,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";

type Input = {
  listingId: number;
  departmentId?: string | null;
};

type Context = {
  userId: string;
  organisationId: string;
};

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function assignInternalCarrier(input: Input, ctx: Context) {
  const [organisation] = await database
    .select({
      id: organisations.id,
      operatingMode: organisations.operatingMode,
    })
    .from(organisations)
    .where(eq(organisations.id, ctx.organisationId));

  if (!organisation) {
    throw new Error("Organisation not found");
  }

  const isSoloOrganisation = organisation.operatingMode === "solo";

  const [listing] = await database
    .select()
    .from(wasteListings)
    .where(eq(wasteListings.id, input.listingId));

  if (!listing) {
    throw new Error("Listing not found");
  }

  if (listing.organisationId !== ctx.organisationId) {
    throw new Error("Not authorised");
  }

  if (listing.status !== "open") {
    throw new Error("This listing is no longer open for assignment");
  }

  if (listing.assignedCarrierOrganisationId) {
    throw new Error("Already assigned");
  }

  if (
    !isSoloOrganisation &&
    listing.marketMode !== "internal_only" &&
    listing.marketMode !== "direct_award"
  ) {
    throw new Error("This listing cannot be directly assigned");
  }

  let selectedDepartment:
    | {
        id: string;
        organisationId: string;
        name: string;
        type: "generator" | "carrier" | "manager" | "compliance";
      }
    | undefined;

  if (!isSoloOrganisation) {
    if (!input.departmentId) {
      throw new Error("Carrier department is required");
    }

    const [department] = await database
      .select()
      .from(departments)
      .where(
        and(
          eq(departments.id, input.departmentId),
          eq(departments.organisationId, ctx.organisationId),
        ),
      );

    if (!department) {
      throw new Error("Invalid department");
    }

    if (department.type !== "carrier") {
      throw new Error("Department is not a carrier");
    }

    selectedDepartment = department;
  }

  const verificationCode = generateSixDigitCode();
  const now = new Date();

  let createdAssignmentId: string | null = null;

  await database.transaction(async (tx) => {
    const [existingAssignment] = await tx
      .select({
        id: carrierAssignments.id,
      })
      .from(carrierAssignments)
      .where(eq(carrierAssignments.listingId, input.listingId))
      .limit(1);

    if (existingAssignment) {
      throw new Error("Assignment already exists");
    }

    const [createdAssignment] = await tx
      .insert(carrierAssignments)
      .values({
        organisationId: ctx.organisationId,
        listingId: input.listingId,
        siteId: listing.siteId ?? null,

        jobSource: "internal_operation",

        carrierOrganisationId: ctx.organisationId,
        assignedByOrganisationId: ctx.organisationId,
        managerOrganisationId: ctx.organisationId,

        assignmentMethod: "direct",
        status: "accepted",

        verificationCode,
        codeGeneratedAt: now,

        assignedAt: now,
        managerAcceptedAt: now,
        carrierAssignedAt: now,
        respondedAt: now,
      })
      .returning({
        id: carrierAssignments.id,
      });

    createdAssignmentId = createdAssignment.id;

    await tx
      .update(wasteListings)
      .set({
        assignmentMethod: "direct",
        assignedCarrierDepartmentId: selectedDepartment?.id ?? null,
        assignedCarrierOrganisationId: ctx.organisationId,
        assignedByOrganisationId: ctx.organisationId,
        assignedAt: now,
        status: "assigned",
      })
      .where(eq(wasteListings.id, input.listingId));
  });

  return {
    success: true,
    assignmentId: createdAssignmentId,
    message: isSoloOrganisation
      ? "Self-managed job started successfully"
      : "Internal carrier assigned successfully",
  };
}