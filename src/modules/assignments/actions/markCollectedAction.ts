"use server";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { markCollected } from "../core/markCollected";

export const markCollectedAction = withErrorHandling(
  async ({
    assignmentId,
    verificationCode,
  }: {
    assignmentId: string;
    verificationCode: string;
  }) => {
    return await markCollected({
      assignmentId,
      verificationCode,
    });
  },
);
