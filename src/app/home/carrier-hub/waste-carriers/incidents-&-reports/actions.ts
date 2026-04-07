"use server";

import { database } from "@/db/database";
import { incidents, carrierAssignments, wasteListings } from "@/db/schema";
import { auth } from "@/auth";
import { revalidatePath } from "next/cache";
import { eq, and, desc } from "drizzle-orm";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   GET INCIDENTS
========================================================= */

export const getCarrierIncidents = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("Unauthorised");
    }

    return database
      .select({
        id: incidents.id,
        type: incidents.type,
        summary: incidents.summary,
        status: incidents.status,
        createdAt: incidents.createdAt,

        listingName: wasteListings.name,
        listingId: wasteListings.id,
        location: wasteListings.location,
        assignmentId: carrierAssignments.id,
      })
      .from(incidents)
      .innerJoin(
        carrierAssignments,
        eq(incidents.assignmentId, carrierAssignments.id),
      )
      .innerJoin(
        wasteListings,
        eq(carrierAssignments.listingId, wasteListings.id),
      )
      .where(
        eq(incidents.reportedByOrganisationId, session.user.organisationId),
      )
      .orderBy(desc(incidents.createdAt));
  },
  {
    actionName: "getCarrierIncidents",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low", // read operation
  },
);

/* =========================================================
   GET ACTIVE ASSIGNMENTS
========================================================= */

export const getCarrierActiveAssignments = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.organisationId) {
      throw new Error("Unauthorised");
    }

    return database
      .select({
        assignmentId: carrierAssignments.id,
        listingId: wasteListings.id,
        listingName: wasteListings.name,
        assignedAt: carrierAssignments.assignedAt,
      })
      .from(carrierAssignments)
      .innerJoin(
        wasteListings,
        eq(carrierAssignments.listingId, wasteListings.id),
      )
      .where(
        and(
          eq(
            carrierAssignments.carrierOrganisationId,
            session.user.organisationId,
          ),
          eq(carrierAssignments.status, "collected"),
        ),
      );
  },
  {
    actionName: "getCarrierActiveAssignments",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);

/* =========================================================
   CREATE INCIDENT
========================================================= */

export const createIncident = withErrorHandling(
  async (data: { assignmentId: string; type: string; summary: string }) => {
    const session = await auth();

    if (!session?.user?.id || !session.user.organisationId) {
      throw new Error("Unauthorised");
    }

    /* ===============================
       VALIDATE ASSIGNMENT
    ============================== */

    const assignment = await database.query.carrierAssignments.findFirst({
      where: and(
        eq(carrierAssignments.id, data.assignmentId),
        eq(
          carrierAssignments.carrierOrganisationId,
          session.user.organisationId,
        ),
        eq(carrierAssignments.status, "collected"),
      ),
    });

    if (!assignment) {
      throw new Error("Invalid assignment");
    }

    /* ===============================
       CREATE INCIDENT
    ============================== */

    await database.insert(incidents).values({
      organisationId: session.user.organisationId,
      assignmentId: assignment.id,
      listingId: assignment.listingId,
      type: data.type,
      summary: data.summary,
      reportedByUserId: session.user.id,
      reportedByOrganisationId: session.user.organisationId,
    });

    revalidatePath("/home/carrier-hub/waste-carriers/incidents-&-reports");

    // ✅ IMPORTANT: return something (prevents void typing issues)
    return true;
  },
  {
    actionName: "createIncident",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
