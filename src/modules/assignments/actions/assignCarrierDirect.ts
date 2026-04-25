import { database } from "@/db/database";
import { wasteListings, carrierAssignments, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   HELPERS
========================================================= */

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* =========================================================
   CORE
========================================================= */

export async function assignCarrierDirect({
  listingId,
  carrierOrganisationId,
  assignedByOrganisationId,
}: {
  listingId: number;
  carrierOrganisationId: string;
  assignedByOrganisationId: string;
}) {
  /* ===============================
     FETCH LISTING
  ============================== */

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    throw new Error("LISTING_NOT_FOUND");
  }

  /* ===============================
     STATE VALIDATION
  ============================== */

  if (listing.status === "completed") {
    throw new Error("LISTING_COMPLETED");
  }

  if (listing.status === "cancelled") {
    throw new Error("LISTING_CANCELLED");
  }

  if (listing.status === "assigned") {
    throw new Error("LISTING_ALREADY_ASSIGNED");
  }

  /* ===============================
     CARRIER VALIDATION
  ============================== */

  const carrierOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, carrierOrganisationId),
  });

  if (!carrierOrg) {
    throw new Error("CARRIER_NOT_FOUND");
  }

  /* ===============================
     ALLOWED CARRIERS (RESTRICTED)
  ============================== */

  if (listing.allowedCarrierIds) {
    const allowed = listing.allowedCarrierIds
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);

    if (allowed.length > 0 && !allowed.includes(carrierOrganisationId)) {
      throw new Error("CARRIER_NOT_ALLOWED");
    }
  }

  /* ===============================
     GENERATE VERIFICATION CODE
  ============================== */

  const verificationCode = generateSixDigitCode();

  /* ===============================
     TRANSACTION (SOURCE OF TRUTH)
  ============================== */

  await database.transaction(async (tx) => {
    const existingAssignment = await tx.query.carrierAssignments.findFirst({
      where: eq(carrierAssignments.listingId, listingId),
    });

    if (existingAssignment) {
      throw new Error("ALREADY_ASSIGNED");
    }

    /* ---------- CREATE ASSIGNMENT ---------- */

    await tx.insert(carrierAssignments).values({
      organisationId: listing.organisationId,
      listingId,
      carrierOrganisationId,
      assignedByOrganisationId,
      assignmentMethod: "direct",
      status: "pending",
      verificationCode,
      codeGeneratedAt: new Date(),
      assignedAt: new Date(),
    });

    /* ---------- UPDATE LISTING SNAPSHOT ---------- */

    await tx
      .update(wasteListings)
      .set({
        assignedCarrierOrganisationId: carrierOrganisationId,
        assignmentMethod: "direct",
        status: "assigned",
        assignedAt: new Date(),
      })
      .where(eq(wasteListings.id, listingId));
  });

  /* ===============================
     RETURN
  ============================== */

  return {
    success: true,
    message: "Carrier assigned successfully",
    verificationCode,
    carrierOrganisationId,
    listingId,
  };
}
