"use server";

import { database } from "@/db/database";
import { incidents, carrierAssignments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const resolveIncidentAction = withErrorHandling(
  async (incidentId: string, assignmentId: string, notes: string) => {
    /* ===============================
       VALIDATION
    ============================== */

    if (!notes || notes.trim().length < 10) {
      throw new Error("Resolution notes must be at least 10 characters.");
    }

    /* ===============================
       AUTH
    ============================== */

    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    /* ===============================
       TRANSACTION
    ============================== */

    await database.transaction(async (tx) => {
      // 🔧 Update incident
      await tx
        .update(incidents)
        .set({
          status: "resolved",
          correctiveActions: notes,
          resolvedAt: new Date(),
          resolvedByUserId: session.user.id,
          dateClosed: new Date(),
        })
        .where(eq(incidents.id, incidentId));

      // 🔧 Complete assignment
      await tx
        .update(carrierAssignments)
        .set({
          status: "completed",
          completedAt: new Date(),
        })
        .where(eq(carrierAssignments.id, assignmentId));
    });

    /* ===============================
       REVALIDATE
    ============================== */

    revalidatePath("/home/carrier-hub/incident-management");
  },
  {
    actionName: "resolveIncidentAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
