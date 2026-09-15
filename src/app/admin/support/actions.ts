"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { recordPlatformAdminAuditEvent } from "@/lib/admin/recordPlatformAdminAudit";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

type SupportStatus =
  | "open"
  | "in_progress"
  | "waiting_on_user"
  | "resolved"
  | "closed";

const supportStatuses = new Set<SupportStatus>([
  "open",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
]);

async function currentPlatformAdmin() {
  await requirePlatformAdmin();

  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("Platform admin session is unavailable.");

  const admin = await database.query.users.findFirst({
    where: and(
      eq(users.id, userId),
      eq(users.role, "platform_admin"),
    ),
    columns: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!admin || !admin.isActive || admin.isSuspended) {
    throw new Error("Platform admin account is unavailable.");
  }

  return admin;
}

async function ticketOrThrow(ticketId: string) {
  const ticket = await database.query.supportTickets.findFirst({
    where: eq(supportTickets.id, ticketId),
    columns: {
      id: true,
      organisationId: true,
      status: true,
      assignedToUserId: true,
    },
  });

  if (!ticket) throw new Error("Support ticket not found.");
  return ticket;
}

function revalidateTicket(ticketId: string) {
  revalidatePath("/admin");
  revalidatePath("/admin/support");
  revalidatePath(`/admin/support/${ticketId}`);
}

export async function assignSupportTicketAction(
  ticketId: string,
  formData: FormData,
) {
  await currentPlatformAdmin();
  const ticket = await ticketOrThrow(ticketId);

  const assignedToUserId = String(
    formData.get("assignedToUserId") ?? "",
  ).trim();

  if (assignedToUserId) {
    const assignee = await database.query.users.findFirst({
      where: and(
        eq(users.id, assignedToUserId),
        eq(users.role, "platform_admin"),
      ),
      columns: {
        id: true,
        isActive: true,
        isSuspended: true,
      },
    });

    if (!assignee || !assignee.isActive || assignee.isSuspended) {
      throw new Error("Selected platform admin is unavailable.");
    }
  }

  await database
    .update(supportTickets)
    .set({
      assignedToUserId: assignedToUserId || null,
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId));

  await recordPlatformAdminAuditEvent({
    organisationId: ticket.organisationId,
    entityType: "support_ticket",
    entityId: ticket.id,
    action: "ADMIN_SUPPORT_ASSIGNED",
    previousState: { assignedToUserId: ticket.assignedToUserId },
    newState: { assignedToUserId: assignedToUserId || null },
  });

  revalidateTicket(ticketId);
}

export async function setSupportTicketStatusAction(
  ticketId: string,
  formData: FormData,
) {
  await currentPlatformAdmin();
  const ticket = await ticketOrThrow(ticketId);

  const requested = String(formData.get("status") ?? "").trim();

  if (!supportStatuses.has(requested as SupportStatus)) {
    throw new Error("Invalid support status.");
  }

  await database
    .update(supportTickets)
    .set({
      status: requested as SupportStatus,
      updatedAt: new Date(),
    })
    .where(eq(supportTickets.id, ticketId));

  await recordPlatformAdminAuditEvent({
    organisationId: ticket.organisationId,
    entityType: "support_ticket",
    entityId: ticket.id,
    action: "ADMIN_SUPPORT_STATUS_CHANGED",
    previousState: { status: ticket.status },
    newState: { status: requested },
  });

  revalidateTicket(ticketId);
}

export async function replySupportTicketAction(
  ticketId: string,
  formData: FormData,
) {
  const admin = await currentPlatformAdmin();
  const ticket = await ticketOrThrow(ticketId);

  if (ticket.status === "resolved" || ticket.status === "closed") {
    throw new Error("Reopen the ticket before sending a customer-visible reply.");
  }

  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Reply message is required.");
  if (message.length > 5000) throw new Error("Reply is too long.");

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx.insert(supportTicketMessages).values({
      organisationId: ticket.organisationId,
      ticketId: ticket.id,
      senderUserId: admin.id,
      message,
      isInternalNote: false,
      createdAt: now,
    });

    await tx
      .update(supportTickets)
      .set({
        status: "waiting_on_user",
        assignedToUserId: admin.id,
        updatedAt: now,
      })
      .where(eq(supportTickets.id, ticket.id));
  });

  await recordPlatformAdminAuditEvent({
    organisationId: ticket.organisationId,
    entityType: "support_ticket",
    entityId: ticket.id,
    action: "ADMIN_SUPPORT_PUBLIC_REPLY",
    previousState: {
      status: ticket.status,
      assignedToUserId: ticket.assignedToUserId,
    },
    newState: {
      status: "waiting_on_user",
      assignedToUserId: admin.id,
      visibility: "customer",
    },
  });

  revalidateTicket(ticketId);
}

export async function addInternalSupportNoteAction(
  ticketId: string,
  formData: FormData,
) {
  const admin = await currentPlatformAdmin();
  const ticket = await ticketOrThrow(ticketId);

  const message = String(formData.get("message") ?? "").trim();
  if (!message) throw new Error("Internal note is required.");
  if (message.length > 5000) throw new Error("Internal note is too long.");

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx.insert(supportTicketMessages).values({
      organisationId: ticket.organisationId,
      ticketId: ticket.id,
      senderUserId: admin.id,
      message,
      isInternalNote: true,
      createdAt: now,
    });

    await tx
      .update(supportTickets)
      .set({
        assignedToUserId: admin.id,
        updatedAt: now,
      })
      .where(eq(supportTickets.id, ticket.id));
  });

  await recordPlatformAdminAuditEvent({
    organisationId: ticket.organisationId,
    entityType: "support_ticket",
    entityId: ticket.id,
    action: "ADMIN_SUPPORT_INTERNAL_NOTE_ADDED",
    previousState: { assignedToUserId: ticket.assignedToUserId },
    newState: {
      assignedToUserId: admin.id,
      visibility: "platform_only",
    },
  });

  revalidateTicket(ticketId);
}
