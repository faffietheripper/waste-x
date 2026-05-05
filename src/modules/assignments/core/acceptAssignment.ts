import { randomInt } from "crypto";
import { database } from "@/db/database";
import { carrierAssignments, notifications, users } from "@/db/schema";
import { and, eq } from "drizzle-orm";

type AcceptAssignmentInput = {
  assignmentId: string;
  organisationId: string;
};

function generateVerificationCode() {
  return randomInt(100000, 999999).toString();
}

export async function acceptAssignment({
  assignmentId,
  organisationId,
}: AcceptAssignmentInput) {
  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    return {
      success: false,
      message: "Assignment not found.",
    };
  }

  const isManager = assignment.managerOrganisationId === organisationId;
  const isCarrier = assignment.carrierOrganisationId === organisationId;

  /*
    =========================================================
    MANAGER ACCEPTANCE

    Manager accepts the listing assignment.

    This does NOT:
    - change assignment.status
    - generate verification code
    - involve carrier collection yet

    It only marks the manager as having accepted the job.
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isManager &&
    !assignment.managerAcceptedAt &&
    !assignment.carrierOrganisationId
  ) {
    await database
      .update(carrierAssignments)
      .set({
        managerAcceptedAt: new Date(),
      })
      .where(eq(carrierAssignments.id, assignmentId));

    return {
      success: true,
      message:
        "Manager assignment accepted. You can now assign a carrier to this job.",
    };
  }

  /*
    =========================================================
    CARRIER ACCEPTANCE

    Carrier accepts the actual collection job.

    This SHOULD:
    - update assignment.status to accepted
    - set respondedAt
    - generate verificationCode
    - set codeGeneratedAt
    - notify the generator organisation
    =========================================================
  */

  if (
    assignment.status === "pending" &&
    isCarrier &&
    !!assignment.carrierOrganisationId
  ) {
    const verificationCode = generateVerificationCode();
    const now = new Date();

    await database
      .update(carrierAssignments)
      .set({
        status: "accepted",
        respondedAt: now,
        verificationCode,
        codeGeneratedAt: now,
        codeUsedAt: null,
      })
      .where(eq(carrierAssignments.id, assignmentId));

    /*
      Notify generator organisation users.

      assignment.organisationId = generator-side organisation context.
      This sends the verification code to active users in that organisation.
    */

    const generatorUsers = await database.query.users.findMany({
      where: and(
        eq(users.organisationId, assignment.organisationId),
        eq(users.isActive, true),
      ),
    });

    if (generatorUsers.length > 0) {
      await database.insert(notifications).values(
        generatorUsers.map((user) => ({
          organisationId: assignment.organisationId,
          recipientId: user.id,
          actorId: null,
          listingId: assignment.listingId,
          type: "verification_code_generated",
          title: "Collection verification code generated",
          message: `A carrier has accepted the collection job. Verification code: ${verificationCode}`,
          isRead: false,
        })),
      );
    }

    return {
      success: true,
      message:
        "Carrier assignment accepted. A verification code has been generated and sent to the generator.",
    };
  }

  return {
    success: false,
    message: "You are not allowed to accept this assignment at this stage.",
  };
}
