import { database } from "@/db/database";
import { carrierAssignments, organisations, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";

type Input = {
  assignmentId: string;
  carrierOrganisationId: string;
  managerOrganisationId: string;
};

export async function assignCarrierToAssignment({
  assignmentId,
  carrierOrganisationId,
  managerOrganisationId,
}: Input) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  if (assignment.managerOrganisationId !== managerOrganisationId) {
    return {
      success: false,
      message: "Only the assigned manager can assign a carrier.",
    };
  }

  if (!assignment.managerAcceptedAt) {
    return {
      success: false,
      message:
        "You must accept the manager assignment before assigning a carrier.",
    };
  }

  if (assignment.status !== "pending") {
    return {
      success: false,
      message: "Carrier can only be assigned while the assignment is pending.",
    };
  }

  if (assignment.carrierOrganisationId) {
    return {
      success: false,
      message: "A carrier has already been assigned.",
    };
  }

  const carrierOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, carrierOrganisationId),
  });

  if (!carrierOrg) {
    return {
      success: false,
      message: "Carrier organisation not found.",
    };
  }

  const capabilities = (carrierOrg.capabilities ?? []) as (
    | "generator"
    | "carrier"
    | "manager"
  )[];

  if (!capabilities.includes("carrier")) {
    return {
      success: false,
      message: "Selected organisation does not have carrier capability.",
    };
  }

  if (carrierOrg.status !== "ACTIVE") {
    return {
      success: false,
      message: "Selected carrier organisation is not active.",
    };
  }

  await database
    .update(carrierAssignments)
    .set({
      carrierOrganisationId,
      carrierAssignedAt: new Date(),

      /*
        Keep status as pending.
        It now means waiting for the carrier response.
      */
      status: "pending",
    })
    .where(eq(carrierAssignments.id, assignmentId));

  await database
    .update(wasteListings)
    .set({
      assignedCarrierOrganisationId: carrierOrganisationId,
    })
    .where(eq(wasteListings.id, assignment.listingId));

  return {
    success: true,
    message:
      carrierOrganisationId === managerOrganisationId
        ? "Carrier assigned internally to your organisation logistics team."
        : "Carrier organisation assigned. Waiting for carrier response.",
  };
}
