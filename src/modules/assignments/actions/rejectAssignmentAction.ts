"use server";

import { auth } from "@/auth";
import { rejectAssignment } from "../core/rejectAssignment";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";

export const rejectAssignmentAction = withErrorHandling(
  async (listingId: number) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return await rejectAssignment({
      listingId,
      organisationId: session.user.organisationId,
    });
  },
);
