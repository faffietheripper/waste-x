import { database } from "@/db/database";
import { carrierAssignments } from "@/db/schema";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function createAssignment({
  listingId,
  carrierOrganisationId,
  assignedByOrganisationId,
}: {
  listingId: number;
  carrierOrganisationId: string;
  assignedByOrganisationId: string;
}) {
  const verificationCode = generateCode();

  const [assignment] = await database
    .insert(carrierAssignments)
    .values({
      organisationId: assignedByOrganisationId,
      listingId,
      carrierOrganisationId,
      assignedByOrganisationId,
      status: "pending",
      verificationCode,
      codeGeneratedAt: new Date(),
    })
    .returning();

  return {
    success: true,
    assignment,
  };
}
