"use server";

import { database } from "@/db/database";
import { wasteListings, carrierAssignments, users } from "@/db/schema";
import { auth } from "@/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   ASSIGN CARRIER
========================================================= */

export const assignCarrierAction = withErrorHandling(
  async (listingId: number, carrierOrgId: string) => {
    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const dbUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!dbUser?.organisationId) {
      throw new Error("User has no organisation");
    }

    /* ===============================
       CREATE ASSIGNMENT
    ============================== */

    await database.insert(carrierAssignments).values({
      organisationId: dbUser.organisationId,
      listingId,
      carrierOrganisationId: carrierOrgId,
      assignedByOrganisationId: dbUser.organisationId,
      status: "pending",
    });

    /* ===============================
       UPDATE LISTING
    ============================== */

    await database
      .update(wasteListings)
      .set({
        assignedCarrierOrganisationId: carrierOrgId,
        assignedByOrganisationId: dbUser.organisationId,
        assignedAt: new Date(),
        assigned: true,
      })
      .where(eq(wasteListings.id, listingId));

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "assignCarrierAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);

/* =========================================================
   ACCEPT CARRIER JOB
========================================================= */

export const acceptCarrierJobAction = withErrorHandling(
  async (formData: FormData) => {
    const listingId = Number(formData.get("listingId"));
    if (!listingId) throw new Error("Listing ID required");

    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!listing?.assignedCarrierOrganisationId) {
      throw new Error("Listing not assigned");
    }

    await database
      .update(carrierAssignments)
      .set({
        status: "accepted",
        respondedAt: new Date(),
      })
      .where(
        and(
          eq(carrierAssignments.listingId, listingId),
          eq(
            carrierAssignments.carrierOrganisationId,
            listing.assignedCarrierOrganisationId,
          ),
          eq(carrierAssignments.status, "pending"),
        ),
      );

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "acceptCarrierJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   REJECT CARRIER JOB
========================================================= */

export const rejectCarrierJobAction = withErrorHandling(
  async (formData: FormData) => {
    const listingId = Number(formData.get("listingId"));
    if (!listingId) throw new Error("Listing ID required");

    const session = await auth();
    if (!session?.user?.id) throw new Error("Unauthorized");

    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
    });

    if (!listing?.assignedCarrierOrganisationId) {
      throw new Error("Listing not assigned");
    }

    /* ===============================
       DELETE ASSIGNMENT
    ============================== */

    await database
      .delete(carrierAssignments)
      .where(
        and(
          eq(carrierAssignments.listingId, listingId),
          eq(
            carrierAssignments.carrierOrganisationId,
            listing.assignedCarrierOrganisationId,
          ),
        ),
      );

    /* ===============================
       RESET LISTING
    ============================== */

    await database
      .update(wasteListings)
      .set({
        assignedCarrierOrganisationId: null,
        assignedByOrganisationId: null,
        assignedAt: null,
        assigned: false,
      })
      .where(eq(wasteListings.id, listingId));

    revalidatePath("/home/my-activity/assigned-jobs");
  },
  {
    actionName: "rejectCarrierJobAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);

/* =========================================================
   MARK COLLECTED
========================================================= */

export const markCollectedAction = withErrorHandling(
  async (_prevState: any, formData: FormData) => {
    const listingId = Number(formData.get("listingId"));
    const verificationCode = formData.get("verificationCode")?.toString();

    /* ===============================
       VALIDATION (USER-FACING)
    ============================== */

    if (!listingId || !verificationCode) {
      return {
        success: false,
        message: "Verification code is required.",
      };
    }

    const session = await auth();
    if (!session?.user?.id) {
      return {
        success: false,
        message: "You are not authorised.",
      };
    }

    /* ===============================
       FIND ASSIGNMENT
    ============================== */

    const assignment = await database.query.carrierAssignments.findFirst({
      where: and(
        eq(carrierAssignments.listingId, listingId),
        eq(carrierAssignments.verificationCode, verificationCode),
        eq(carrierAssignments.status, "accepted"),
      ),
    });

    if (!assignment) {
      return {
        success: false,
        message: "❌ Incorrect verification code.",
      };
    }

    /* ===============================
       UPDATE STATUS
    ============================== */

    await database
      .update(carrierAssignments)
      .set({
        status: "collected",
        collectedAt: new Date(),
        codeUsedAt: new Date(),
      })
      .where(eq(carrierAssignments.id, assignment.id));

    revalidatePath("/home/carrier-hub/assigned-jobs");

    return {
      success: true,
      message: "✅ Waste successfully marked as collected.",
    };
  },
  {
    actionName: "markCollectedAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium",
  },
);
