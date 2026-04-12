import { database } from "@/db/database";
import {
  reviews,
  wasteListings,
  organisations,
  carrierAssignments,
} from "@/db/schema";
import { eq } from "drizzle-orm";

export async function createReview({
  listingId,
  rating,
  reviewText,
  userId,
  userOrganisationId,
}: {
  listingId: number;
  rating: number;
  reviewText: string;
  userId: string;
  userOrganisationId: string;
}) {
  if (!listingId || !rating || !reviewText) {
    throw new Error("INVALID_INPUT");
  }

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
     FETCH ASSIGNMENT (🔥 NEW)
  ============================== */

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.listingId, listingId),
  });

  if (!assignment) {
    throw new Error("ASSIGNMENT_NOT_FOUND");
  }

  const generatorOrgId = listing.organisationId;
  const carrierOrgId = assignment.carrierOrganisationId;

  /* ===============================
     AUTHORISATION
  ============================== */

  const isGenerator = userOrganisationId === generatorOrgId;
  const isCarrier = userOrganisationId === carrierOrgId;

  if (!isGenerator && !isCarrier) {
    throw new Error("UNAUTHORIZED");
  }

  /* ===============================
     DETERMINE TARGET
  ============================== */

  const targetOrganisationId = isGenerator ? carrierOrgId : generatorOrgId;

  if (targetOrganisationId === userOrganisationId) {
    throw new Error("CANNOT_REVIEW_SELF");
  }

  /* ===============================
     VALIDATE TARGET
  ============================== */

  const targetOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, targetOrganisationId),
  });

  if (!targetOrg) {
    throw new Error("TARGET_ORG_NOT_FOUND");
  }

  /* ===============================
     CREATE REVIEW
  ============================== */

  await database.insert(reviews).values({
    reviewerId: userId,
    reviewedOrganisationId: targetOrganisationId,
    listingId,
    rating,
    comment: reviewText,
  });

  return {
    success: true,
    targetOrganisationId,
  };
}
