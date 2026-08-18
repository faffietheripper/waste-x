"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { database } from "@/db/database";
import { supportTickets } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

/* =========================================================
   TYPES
========================================================= */

type TicketStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

/* =========================================================
   HELPERS
========================================================= */

function cleanString(
  value: FormDataEntryValue | null,
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function isTicketStatus(
  value: string,
): value is TicketStatus {
  return (
    value === "open" ||
    value === "in_progress" ||
    value === "waiting_on_user" ||
    value === "resolved" ||
    value === "closed"
  );
}

async function getTicket(
  ticketId: string,
) {
  return database.query.supportTickets.findFirst({
    where: eq(
      supportTickets.id,
      ticketId,
    ),
    columns: {
      id: true,
      organisationId: true,
      status: true,
      assignedToUserId: true,
    },
  });
}

function revalidateTicket(
  ticketId: string,
) {
  revalidatePath(
    "/admin/support",
  );

  revalidatePath(
    `/admin/support/${ticketId}`,
  );

  revalidatePath(
    "/home/support",
  );

  revalidatePath(
    `/home/support/${ticketId}`,
  );
}

/* =========================================================
   UPDATE TICKET STATUS
========================================================= */

export async function updateTicketStatusAction(
  formData: FormData,
): Promise<void> {
  /*
    Only actual Waste X platform administrators may
    perform platform support administration.
  */
  await requirePlatformAdmin();

  const ticketId = cleanString(
    formData.get("ticketId"),
  );

  const rawStatus = cleanString(
    formData.get("status"),
  );

  if (!ticketId) {
    throw new Error(
      "Support ticket ID is required.",
    );
  }

  if (
    !isTicketStatus(rawStatus)
  ) {
    throw new Error(
      "Invalid support ticket status.",
    );
  }

  const ticket =
    await getTicket(ticketId);

  if (!ticket) {
    throw new Error(
      "Support ticket not found.",
    );
  }

  const now = new Date();

  await database
    .update(supportTickets)
    .set({
      status:
        rawStatus,

      updatedAt:
        now,
    })
    .where(
      and(
        eq(
          supportTickets.id,
          ticket.id,
        ),

        eq(
          supportTickets.organisationId,
          ticket.organisationId,
        ),
      ),
    );

  revalidateTicket(
    ticket.id,
  );
}

/* =========================================================
   ASSIGN TICKET TO CURRENT PLATFORM ADMIN
========================================================= */

export async function assignTicketAction(
  formData: FormData,
): Promise<void> {
  /*
    requirePlatformAdmin() returns the authenticated
    platform-admin database user.
  */
  const admin =
    await requirePlatformAdmin();

  const ticketId = cleanString(
    formData.get("ticketId"),
  );

  if (!ticketId) {
    throw new Error(
      "Support ticket ID is required.",
    );
  }

  const ticket =
    await getTicket(ticketId);

  if (!ticket) {
    throw new Error(
      "Support ticket not found.",
    );
  }

  const now = new Date();

  /*
    Assignment and status remain separate controls.

    Assigning a ticket does NOT silently change its status.
    That keeps the support history predictable and avoids
    inventing workflow transitions behind the admin's back.
  */
  await database
    .update(supportTickets)
    .set({
      assignedToUserId:
        admin.id,

      updatedAt:
        now,
    })
    .where(
      and(
        eq(
          supportTickets.id,
          ticket.id,
        ),

        eq(
          supportTickets.organisationId,
          ticket.organisationId,
        ),
      ),
    );

  revalidateTicket(
    ticket.id,
  );
}