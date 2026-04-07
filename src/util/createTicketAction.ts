"use server";

import { database } from "@/db/database";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { auth } from "@/auth";
import { eq } from "drizzle-orm";
import { users, supportTickets, supportTicketMessages } from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type CreateTicketResponse =
  | { success: true; ticketId: string }
  | { success: false; message: string };

/* =========================================================
   ACTION
========================================================= */

export const createTicketAction = withErrorHandling(
  async (
    _prevState: unknown,
    formData: FormData,
  ): Promise<CreateTicketResponse> => {
    /* ===============================
       AUTH
    ============================== */
    const session = await auth();

    if (!session?.user?.id) {
      return { success: false, message: "Unauthorized." };
    }

    /* ===============================
       USER
    ============================== */
    const dbUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!dbUser || !dbUser.organisationId) {
      return { success: false, message: "User organisation not found." };
    }

    const organisationId = String(dbUser.organisationId);

    /* ===============================
       INPUT
    ============================== */
    const category = formData.get("category")?.toString();
    const priority = formData.get("priority")?.toString();
    const message = formData.get("message")?.toString();

    if (!category || !priority || !message) {
      return { success: false, message: "Missing fields." };
    }

    /* ===============================
       TRANSACTION
    ============================== */
    const ticket = await database.transaction(async (tx) => {
      const [newTicket] = await tx
        .insert(supportTickets)
        .values({
          organisationId, // ✅ force correct type
          createdByUserId: String(dbUser.id),
          category: category as any, // ✅ avoid enum TS conflict
          priority: priority as any,
          status: "open" as any,
        })
        .returning();

      await tx.insert(supportTicketMessages).values({
        organisationId,
        ticketId: newTicket.id,
        senderUserId: String(dbUser.id),
        message,
      });

      return newTicket;
    });

    /* ===============================
       RESPONSE
    ============================== */
    return {
      success: true,
      ticketId: String(ticket.id),
    };
  },
  {
    actionName: "createTicketAction",
    severity: "high",
  },
);
