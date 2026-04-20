"use server";

import { auth } from "@/auth";

import { createReview } from "@/modules/reviews/actions/createReview";
import { createNotification } from "@/modules/notifications/actions/createNotification";

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

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    const result = await createReview({
      listingId,
      rating,
      reviewText,
      userId: session.user.id,
      userOrganisationId: session.user.organisationId,
    });

    /* ===============================
       NOTIFICATIONS (SIDE EFFECT)
    ============================== */

    // 🔥 keep outside core logic
    await createNotification({
      organisationId: result.targetOrganisationId,
      title: "New Review Received!",
      message: `Your organisation received a ${rating}-star review.`,
      link: `/home/organisations/${result.targetOrganisationId}`,
    });

    return {
      success: true,
      message: "Review submitted successfully.",
    };
  },
  {
    actionName: "createReviewAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
