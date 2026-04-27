import { database } from "@/db/database";
import { wasteListings, departments, carrierAssignments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Input = {
  listingId: number;
  departmentId: string;
};

type Context = {
  userId: string;
  organisationId: string;
};

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function assignInternalCarrier(input: Input, ctx: Context) {
  /* ===============================
     GET LISTING
  ============================== */

  const [listing] = await database
    .select()
    .from(wasteListings)
    .where(eq(wasteListings.id, input.listingId));

  if (!listing) {
    throw new Error("Listing not found");
  }

  /* ===============================
     PERMISSIONS
  ============================== */

  if (listing.organisationId !== ctx.organisationId) {
    throw new Error("Not authorised");
  }

  if (listing.assignedCarrierOrganisationId) {
    throw new Error("Already assigned");
  }

  /* ===============================
     MODE VALIDATION
  ============================== */

  if (
    listing.marketMode !== "internal_only" &&
    listing.marketMode !== "direct_award"
  ) {
    throw new Error("This listing cannot be directly assigned");
  }

  /* ===============================
     VALIDATE DEPARTMENT
  ============================== */

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

  /* ===============================
     DUPLICATE ASSIGNMENT CHECK
  ============================== */

  const [existingAssignment] = await database
    .select()
    .from(carrierAssignments)
    .where(eq(carrierAssignments.listingId, input.listingId));

  if (existingAssignment) {
    throw new Error("Assignment already exists");
  }

  const verificationCode = generateSixDigitCode();
  const now = new Date();

  /* ===============================
     TRANSACTION
  ============================== */

  await database.transaction(async (tx) => {
    await tx.insert(carrierAssignments).values({
      organisationId: ctx.organisationId,
      listingId: input.listingId,
      carrierOrganisationId: ctx.organisationId,
      assignedByOrganisationId: ctx.organisationId,
      assignmentMethod: "direct",
      status: "accepted",
      respondedAt: now,
      verificationCode,
      codeGeneratedAt: now,
      assignedAt: now,
    });

    await tx.insert(carrierAssignments).values({
      organisationId: ctx.organisationId,
      listingId: input.listingId,
      carrierOrganisationId: ctx.organisationId,
      assignedByOrganisationId: ctx.organisationId,
      assignmentMethod: "direct",
      status: "accepted",
      verificationCode,
      codeGeneratedAt: now,
      assignedAt: now,
      respondedAt: now,
    });
  });

  return {
    success: true,
    message: "Internal carrier assigned successfully",
  };
}
