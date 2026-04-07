"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { reviews, wasteListings, organisations, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { createNotification } from "../../notifications/actions";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const createReviewAction = withErrorHandling(
  async ({
    listingId,
    rating,
    reviewText,
  }: {
    listingId: number;
    rating: number;
    reviewText: string;
  }) => {
    const session = await auth();
    const userId = session?.user?.id;
    const userOrganisationId = session?.user?.organisationId;

    /* ===============================
       USER VALIDATION (UX SAFE)
    ============================== */

    if (!userId || !userOrganisationId) {
      return { error: "You must be logged in to leave a review." };
    }

    if (!listingId || !rating || !reviewText) {
      return { error: "All fields are required." };
    }

    /* ===============================
       FETCH LISTING
    ============================== */

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!listing) {
      return { error: "Listing not found." };
    }

    /* ===============================
       AUTHORISATION CHECK
    ============================== */

    const isAuthorized =
      listing.organisationId === userOrganisationId ||
      listing.winningOrganisationId === userOrganisationId;

    if (!isAuthorized) {
      return { error: "You are not authorized to review this listing." };
    }

    /* ===============================
       DETERMINE TARGET ORG
    ============================== */

    let targetOrganisationId: string | null = null;

    if (userOrganisationId === listing.organisationId) {
      targetOrganisationId = listing.winningOrganisationId;
    } else if (userOrganisationId === listing.winningOrganisationId) {
      targetOrganisationId = listing.organisationId;
    }

    if (!targetOrganisationId) {
      return { error: "Unable to determine organisation to review." };
    }

    if (targetOrganisationId === userOrganisationId) {
      return { error: "You cannot review your own organisation." };
    }

    /* ===============================
       VALIDATE TARGET ORG
    ============================== */

    const targetOrg = await database.query.organisations.findFirst({
      where: eq(organisations.id, targetOrganisationId),
    });

    if (!targetOrg) {
      return { error: "Organisation not found." };
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

    /* ===============================
       NOTIFY ORG MEMBERS
    ============================== */

    const orgMembers = await database.query.users.findMany({
      where: eq(users.organisationId, targetOrganisationId),
      columns: { id: true },
    });

    await Promise.all(
      orgMembers.map((member) =>
        createNotification(
          member.id,
          "New Review Received!",
          `Your organisation received a ${rating}-star review.`,
          `/home/organisations/${targetOrganisationId}`,
        ),
      ),
    );

    return {
      success: true,
      message: "Review submitted successfully.",
    };
  },
  {
    actionName: "createReviewAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium", // important but not destructive
  },
);
