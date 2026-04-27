"use server";

import { completeAssignment } from "../core/completeAssignment";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";

export const completeAssignmentAction = withErrorHandling(
  async ({ assignmentId }: { assignmentId: string }) => {
    return await completeAssignment({ assignmentId });
  },
);
