import { database } from "@/db/database";
import { wasteListings, departments } from "@/db/schema";
import { eq, and } from "drizzle-orm";

type Input = {
  listingId: number;
  departmentId: string;
};

type Context = {
  userId: string;
  organisationId: string;
};

export async function assignInternalCarrier(input: Input, ctx: Context) {
  /* ===============================
     GET LISTING (SAFE)
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
     UPDATE
  ============================== */

  await database
    .update(wasteListings)
    .set({
      assignedCarrierDepartmentId: input.departmentId,
      assignedCarrierOrganisationId: ctx.organisationId,
      assignmentMethod: "direct",
      assignedAt: new Date(),
      status: "assigned",
    })
    .where(eq(wasteListings.id, input.listingId));

  return { success: true };
}
