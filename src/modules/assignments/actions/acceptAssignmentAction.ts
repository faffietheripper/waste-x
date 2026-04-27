"use server";

import { auth } from "@/auth";
import { acceptAssignment } from "../core/acceptAssignment";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";

export const acceptAssignmentAction = withErrorHandling(
  async (listingId: number) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return await acceptAssignment({
      listingId,
      organisationId: session.user.organisationId,
    });
  },
);
