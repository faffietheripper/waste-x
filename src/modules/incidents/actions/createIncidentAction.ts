"use server";

import { auth } from "@/auth";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { createIncident } from "../core/createIncident";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

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

    const result = await createIncident({
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

    /*
      Step 9:
      Incident reported
      → notify involved organisations.
    */

    const notificationTargets = buildIncidentNotificationTargets({
      generatorOrganisationId: result.generatorOrganisationId,
      managerOrganisationId: result.managerOrganisationId,
      carrierOrganisationId: result.carrierOrganisationId,
    });

    await Promise.all(
      notificationTargets.map((target) =>
        notifyDepartmentUsers({
          organisationId: target.organisationId,
          departmentTypes: target.departmentTypes,
          actorId: session.user.id,
          listingId: result.listing.id,
          type: NOTIFICATION_TYPES.INCIDENT_REPORTED,
          title: "Incident reported",
          message: `An incident has been reported for ${result.listing.name}: ${result.incident.type}.`,
          excludeUserId: session.user.id,
        }),
      ),
    );

    return {
      success: true,
      message: result.message,
      incident: result.incident,
    };
  },
  {
    actionName: "createIncident",
    code: ERROR_CODES.INCIDENT_CREATE_FAILED,
    severity: "high",
  },
);

/* =========================================================
   HELPERS
========================================================= */

function buildIncidentNotificationTargets({
  generatorOrganisationId,
  managerOrganisationId,
  carrierOrganisationId,
}: {
  generatorOrganisationId: string;
  managerOrganisationId?: string | null;
  carrierOrganisationId?: string | null;
}) {
  const targetMap = new Map<string, Set<DepartmentType>>();

  function addTarget(
    organisationId: string | null | undefined,
    departmentTypes: DepartmentType[],
  ) {
    if (!organisationId) return;

    if (!targetMap.has(organisationId)) {
      targetMap.set(organisationId, new Set<DepartmentType>());
    }

    const existing = targetMap.get(organisationId)!;

    departmentTypes.forEach((departmentType) => {
      existing.add(departmentType);
    });

    /*
      Compliance should always know about incidents.
    */
    existing.add("compliance");
  }

  addTarget(generatorOrganisationId, ["generator"]);
  addTarget(managerOrganisationId, ["manager"]);
  addTarget(carrierOrganisationId, ["carrier"]);

  return Array.from(targetMap.entries()).map(
    ([organisationId, departmentSet]) => ({
      organisationId,
      departmentTypes: Array.from(departmentSet),
    }),
  );
}