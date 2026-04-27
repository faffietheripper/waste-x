"use server";

import { auth } from "@/auth";
import { createAssignment } from "../core/createAssignment";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";

export const createAssignmentAction = withErrorHandling(
  async (listingId: number, carrierOrganisationId: string) => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return await createAssignment({
      listingId,
      carrierOrganisationId,
      assignedByOrganisationId: session.user.organisationId,
    });
  },
);
