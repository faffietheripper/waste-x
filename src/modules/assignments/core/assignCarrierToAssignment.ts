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
    throw new Error("Assignment not found.");
  }

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, assignment.listingId),
  });

  if (!listing) {
    throw new Error("Listing not found.");
  }

  if (assignment.managerOrganisationId !== managerOrganisationId) {
    throw new Error("Only the assigned manager can assign a carrier.");
  }

  if (!assignment.managerAcceptedAt) {
    throw new Error(
      "You must accept the manager assignment before assigning a carrier.",
    );
  }

  if (assignment.status !== "accepted") {
    throw new Error(
      "Carrier can only be assigned after the manager has accepted the assignment.",
    );
  }

  if (assignment.carrierOrganisationId) {
    throw new Error("A carrier has already been assigned.");
  }

  const carrierOrg = await database.query.organisations.findFirst({
    where: eq(organisations.id, carrierOrganisationId),
  });

  if (!carrierOrg) {
    throw new Error("Carrier organisation not found.");
  }

  const capabilities = (carrierOrg.capabilities ?? []) as (
    | "generator"
    | "carrier"
    | "manager"
  )[];

  if (!capabilities.includes("carrier")) {
    throw new Error("Selected organisation does not have carrier capability.");
  }

  if (carrierOrg.status !== "ACTIVE") {
    throw new Error("Selected carrier organisation is not active.");
  }

  const [updatedAssignment] = await database
    .update(carrierAssignments)
    .set({
      carrierOrganisationId,
      carrierAssignedAt: new Date(),

      /*
        Pending now means waiting for carrier response.
      */
      status: "pending",
    })
    .where(eq(carrierAssignments.id, assignmentId))
    .returning();

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
    assignment: updatedAssignment,
    listing,
    generatorOrganisationId: assignment.organisationId,
    managerOrganisationId: assignment.managerOrganisationId,
    carrierOrganisationId,
  };
}