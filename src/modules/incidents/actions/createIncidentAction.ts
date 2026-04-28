"use server";

import { auth } from "@/auth";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { createIncident } from "../core/createIncident";

export const createIncidentAction = withErrorHandling(
  async ({
    assignmentId,
    type,
    summary,
    incidentDate,
    incidentLocation,
    immediateAction,
    responsiblePerson,
  }: {
    assignmentId: string;
    type: string;
    summary: string;
    incidentDate?: string | null;
    incidentLocation?: string | null;
    immediateAction?: string | null;
    responsiblePerson?: string | null;
  }) => {
    const session = await auth();

    if (!session?.user?.id || !session.user.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return await createIncident({
      assignmentId,
      type,
      summary,
      userId: session.user.id,
      organisationId: session.user.organisationId,
      incidentDate: incidentDate ? new Date(incidentDate) : null,
      incidentLocation,
      immediateAction,
      responsiblePerson,
    });
  },
);
