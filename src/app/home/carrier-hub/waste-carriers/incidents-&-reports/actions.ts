"use server";

import { auth } from "@/auth";
import { revalidatePath } from "next/cache";

import { getIncidentsByOrganisation } from "@/modules/incidents/queries/getIncidents";
import { getActiveAssignmentsForCarrier } from "@/modules/incidents/queries/getActiveAssignments";
import { createIncident } from "@/modules/incidents/actions/createIncident";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* ================= GET INCIDENTS ================= */

export const getCarrierIncidents = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return getIncidentsByOrganisation(session.user.organisationId);
  },
  {
    actionName: "getCarrierIncidents",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ================= GET ACTIVE ASSIGNMENTS ================= */

export const getCarrierActiveAssignments = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    return getActiveAssignmentsForCarrier(session.user.organisationId);
  },
  {
    actionName: "getCarrierActiveAssignments",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* ================= CREATE INCIDENT ================= */

export const createIncidentAction = withErrorHandling(
  async (data) => {
    const session = await auth();

    if (!session?.user?.id || !session?.user?.organisationId) {
      throw new Error("UNAUTHORIZED");
    }

    await createIncident({
      ...data,
      userId: session.user.id,
      organisationId: session.user.organisationId,
    });

    revalidatePath("/home/carrier-hub/waste-carriers/incidents-&-reports");

    return { success: true };
  },
  {
    actionName: "createIncident",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
