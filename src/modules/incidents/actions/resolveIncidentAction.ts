"use server";

import { auth } from "@/auth";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";
import { resolveIncident } from "../core/resolveIncident";

import { notifyDepartmentUsers } from "@/modules/notifications/services/notifyDepartmentUsers";
import { NOTIFICATION_TYPES } from "@/modules/notifications/constants/notificationTypes";

type DepartmentType = "generator" | "manager" | "carrier" | "compliance";

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

    const result = await resolveIncident({
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

    /*
      Step 9:
      Incident resolved
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
          type: NOTIFICATION_TYPES.INCIDENT_RESOLVED,
          title: "Incident resolved",
          message: `The incident for ${result.listing.name} has been resolved: ${result.incident.type}.`,
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
    actionName: "resolveIncident",
    code: ERROR_CODES.INCIDENT_RESOLVE_FAILED,
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
      Compliance should always know about incident resolution.
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