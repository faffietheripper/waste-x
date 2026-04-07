"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  wasteListings,
  carrierAssignments,
  users,
  organisations,
} from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { createNotification } from "../../notifications/actions";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   6 DIGIT VERIFICATION CODE
========================================================= */

function generateSixDigitCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/* =========================================================
   ASSIGN CARRIER
========================================================= */

export const assignCarrierAction = withErrorHandling(
  async (listingId: number, carrierOrganisationId: string) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    /* ===============================
       FETCH USER
    ============================== */

    const user = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!user?.organisationId) {
      throw new Error("User organisation not found");
    }

    const assignedByOrganisationId = user.organisationId;

    /* ===============================
       FETCH LISTING
    ============================== */

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!listing) {
      throw new Error("Listing not found");
    }

    if (!listing.organisationId) {
      throw new Error("Listing organisation missing");
    }

    const organisationId = listing.organisationId;

    /* ===============================
       FETCH CARRIER
    ============================== */

    const carrierOrg = await database.query.organisations.findFirst({
      where: eq(organisations.id, carrierOrganisationId),
    });

    if (!carrierOrg) {
      throw new Error("Carrier organisation not found");
    }

    const verificationCode = generateSixDigitCode();

    /* ===============================
       TRANSACTION
    ============================== */

    await database.transaction(async (tx) => {
      // 1️⃣ Update listing
      await tx
        .update(wasteListings)
        .set({
          assignedCarrierOrganisationId: carrierOrganisationId,
          assignedByOrganisationId,
          assignedAt: new Date(),
          assigned: true,
        })
        .where(eq(wasteListings.id, listingId));

      // 2️⃣ Insert assignment
      await tx.insert(carrierAssignments).values({
        organisationId,
        listingId,
        carrierOrganisationId,
        assignedByOrganisationId,
        status: "pending",
        assignedAt: new Date(),
        verificationCode,
      });

      // 3️⃣ Notify user
      if (listing.userId) {
        await createNotification(
          listing.userId,
          "Waste Carrier Assigned 🚛",
          `
A waste carrier has been assigned to your job "${listing.name}".

Carrier:
${carrierOrg.teamName}
📧 ${carrierOrg.emailAddress}
📞 ${carrierOrg.telephone}

Verification Code:
🔐 ${verificationCode}

Please keep this code safe — it will be required at collection.
          `.trim(),
          "carrier_assigned",
          listingId,
        );
      }
    });

    /* ===============================
       REVALIDATE
    ============================== */

    revalidatePath("/home/carrier-hub/waste-carriers/assigned-carrier-jobs");
    revalidatePath("/home/my-activity/jobs-in-progress");

    return { success: true };
  },
  {
    actionName: "assignCarrierAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high", // critical workflow
  },
);

/* =========================================================
   GET WINNING JOBS
========================================================= */

export const getWinningJobsAction = withErrorHandling(
  async () => {
    const session = await auth();

    if (!session?.user?.id) return [];

    const user = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
      columns: { organisationId: true },
    });

    if (!user?.organisationId) return [];

    const organisationId = user.organisationId;

    const jobs = await database
      .select()
      .from(wasteListings)
      .where(
        and(
          eq(wasteListings.winningOrganisationId, organisationId),
          eq(wasteListings.offerAccepted, true),
          eq(wasteListings.archived, false),
          or(
            isNull(wasteListings.assignedCarrierOrganisationId),
            eq(wasteListings.assigned, false),
          ),
        ),
      );

    return jobs;
  },
  {
    actionName: "getWinningJobsAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "low",
  },
);
