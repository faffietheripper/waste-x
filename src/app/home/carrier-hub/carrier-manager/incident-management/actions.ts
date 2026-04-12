"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { resolveIncident } from "../../../../../modules/execution/actions/resolveIncident";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const resolveIncidentAction = withErrorHandling(
  async (incidentId: string, assignmentId: string, notes: string) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    await resolveIncident({
      incidentId,
      assignmentId,
      userId: session.user.id,
      notes,
    });

    revalidatePath("/home/carrier-hub/incident-management");
  },
  {
    actionName: "resolveIncidentAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
