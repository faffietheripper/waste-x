"use server";

import { auth } from "@/auth";
import { cancelAssignment } from "../core/cancelAssignment";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";

export const cancelAssignmentAction = withErrorHandling(
  async (listingId: number, reason: string) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return await cancelAssignment({
      listingId,
      organisationId: session.user.organisationId,
      cancellationReason: reason,
    });
  },
);
