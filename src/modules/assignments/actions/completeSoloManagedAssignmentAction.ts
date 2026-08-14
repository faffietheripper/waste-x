"use server";

import { and, eq, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  organisations,
  wasteListings,
} from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";

type Input = {
  assignmentId: string;
};

type Capability = "generator" | "carrier" | "manager";

export async function completeSoloManagedAssignmentAction(input: Input) {
  try {
    const { organisationId } = await requireOrgUser();

    if (!input.assignmentId) {
      throw new Error("Missing assignment ID.");
    }

    const assignment = await database.query.carrierAssignments.findFirst({
      where: eq(carrierAssignments.id, input.assignmentId),
    });

    if (!assignment) {
      throw new Error("Assignment not found.");
    }

    const organisation = await database.query.organisations.findFirst({
      where: eq(organisations.id, organisationId),
    });

    if (!organisation) {
      throw new Error("Organisation not found.");
    }

    const capabilities = (organisation.capabilities ?? []) as Capability[];

    const isSoloOrganisation = organisation.operatingMode === "solo";

    if (!isSoloOrganisation) {
      throw new Error("This action is only available in solo mode.");
    }

    if (!capabilities.includes("manager") || !capabilities.includes("carrier")) {
      throw new Error(
        "Your solo organisation must have manager and carrier capability to complete this job directly.",
      );
    }

    if (assignment.managerOrganisationId !== organisationId) {
      throw new Error("Only the assigned manager can complete this solo job.");
    }

    if (!assignment.managerAcceptedAt) {
      throw new Error("You must accept the manager assignment first.");
    }

    if (assignment.carrierOrganisationId) {
      throw new Error(
        "This assignment already has a carrier. Use the standard collection workflow.",
      );
    }

    if (assignment.status !== "accepted") {
      throw new Error("This solo job can only be completed after acceptance.");
    }

    const unresolvedIncident = await database.query.incidents.findFirst({
      where: and(
        eq(incidents.assignmentId, assignment.id),
        or(eq(incidents.status, "open"), eq(incidents.status, "under_review")),
      ),
    });

    if (unresolvedIncident) {
      throw new Error(
        "This job has an unresolved incident. Resolve it before completing the job.",
      );
    }

    const now = new Date();

    await database.transaction(async (tx) => {
      await tx
        .update(carrierAssignments)
        .set({
          carrierOrganisationId: organisationId,
          carrierAssignedAt: assignment.carrierAssignedAt ?? now,
          respondedAt: assignment.respondedAt ?? now,
          collectedAt: assignment.collectedAt ?? now,
          completedAt: now,
          status: "completed",
        })
        .where(eq(carrierAssignments.id, assignment.id));

      await tx
        .update(wasteListings)
        .set({
          assignedCarrierOrganisationId: organisationId,
          status: "completed",
        })
        .where(eq(wasteListings.id, assignment.listingId));
    });

    return {
      success: true,
      message:
        "Solo job completed. You can now prepare the Digital Waste Tracking receive movement.",
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Failed to complete solo managed job.",
    };
  }
}