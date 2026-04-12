import { database } from "@/db/database";
import { wasteListings, carrierAssignments, organisations } from "@/db/schema";
import { eq } from "drizzle-orm";

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function assignCarrierDirect({
  listingId,
  carrierOrganisationId,
  assignedByOrganisationId,
}: {
  listingId: number;
  carrierOrganisationId: string;
  assignedByOrganisationId: string;
}) {
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) throw new Error("LISTING_NOT_FOUND");

  if (listing.status !== "open") {
    throw new Error("INVALID_STATE");
  }

  const carrierOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, carrierOrganisationId),
  });

  if (!carrierOrg) {
    throw new Error("CARRIER_NOT_FOUND");
  }

  const verificationCode = generateSixDigitCode();

  await database.transaction(async (tx) => {
    // 🔥 CREATE ASSIGNMENT (SOURCE OF TRUTH)
    await tx.insert(carrierAssignments).values({
      organisationId: listing.organisationId,
      listingId,
      carrierOrganisationId,
      assignedByOrganisationId,
      assignmentMethod: "direct",
      status: "pending",
      verificationCode,
      assignedAt: new Date(),
    });

    // 🔁 UPDATE LISTING SNAPSHOT
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

  return {
    success: true,
    verificationCode,
    carrierOrg,
    listing,
  };
}
