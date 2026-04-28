"use server";

import { auth } from "@/auth";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { resolveIncident } from "../core/resolveIncident";

export const resolveIncidentAction = withErrorHandling(
  async ({
    incidentId,
    assignmentId,
    investigationFindings,
    correctiveActions,
    preventativeMeasures,
    complianceReview,
    responsiblePerson,
    dateClosed,
  }: {
    incidentId: string;
    assignmentId: string;
    investigationFindings: string;
    correctiveActions: string;
    preventativeMeasures: string;
    complianceReview: string;
    responsiblePerson: string;
    dateClosed: string;
  }) => {
    const session = await auth();

    if (!session?.user?.id || !session.user.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    if (!dateClosed) {
      throw new Error("DATE_CLOSED_REQUIRED");
    }

    return await resolveIncident({
      incidentId,
      assignmentId,
      organisationId: session.user.organisationId,
      userId: session.user.id,
      investigationFindings,
      correctiveActions,
      preventativeMeasures,
      complianceReview,
      responsiblePerson,
      dateClosed: new Date(dateClosed),
    });
  },
);
