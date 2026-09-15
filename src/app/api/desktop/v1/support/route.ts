import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { database } from "@/db/database";
import { clientDevices } from "@/db/client-sync-schema";
import {
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";
import { requireClientApiContext } from "@/lib/client-api/auth";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

const categories = [
  "bug",
  "billing",
  "access",
  "feature_request",
  "compliance",
  "other",
] as const;

const priorities = ["low", "medium", "high", "urgent"] as const;

const commonMutation = {
  actorUserId: z.string().trim().min(1),
  messageId: z.string().trim().min(1),
  message: z.string().trim().min(1).max(5000),
  occurredAt: z.string().trim().min(1),
};

const mutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("ticket.create"),
    data: z.object({
      ...commonMutation,
      ticketId: z.string().trim().min(1),
      category: z.enum(categories),
      priority: z.enum(priorities),
      message: z.string().trim().min(10).max(5000),
    }),
  }),
  z.object({
    operation: z.literal("ticket.reply"),
    data: z.object({
      ...commonMutation,
      ticketId: z.string().trim().min(1),
    }),
  }),
]);

type ClientContext = Awaited<ReturnType<typeof requireClientApiContext>>;

async function requireDesktopDevice(context: ClientContext) {
  const device = await database.query.clientDevices.findFirst({
    where: and(
      eq(clientDevices.id, context.deviceId),
      eq(clientDevices.organisationId, context.organisationId),
      eq(clientDevices.deviceType, "DESKTOP"),
      eq(clientDevices.status, "ACTIVE"),
    ),
    columns: { id: true },
  });

  if (!device) throw new Error("DESKTOP_DEVICE_REQUIRED");
}

async function requireOrganisationActor(
  organisationId: string,
  actorUserId: string,
) {
  const actor = await database.query.users.findFirst({
    where: and(
      eq(users.id, actorUserId),
      eq(users.organisationId, organisationId),
    ),
    columns: {
      id: true,
      isActive: true,
      isSuspended: true,
      status: true,
    },
  });

  if (
    !actor ||
    !actor.isActive ||
    actor.isSuspended ||
    actor.status === "SUSPENDED"
  ) {
    return null;
  }

  return actor;
}

async function readSupportData(organisationId: string, viewerUserId: string) {
  const ticketRows = await database
    .select({
      id: supportTickets.id,
      createdByUserId: supportTickets.createdByUserId,
      category: supportTickets.category,
      priority: supportTickets.priority,
      status: supportTickets.status,
      assignedToUserId: supportTickets.assignedToUserId,
      createdAt: supportTickets.createdAt,
      updatedAt: supportTickets.updatedAt,
    })
    .from(supportTickets)
    .where(eq(supportTickets.organisationId, organisationId))
    .orderBy(desc(supportTickets.updatedAt), desc(supportTickets.createdAt));

  const messageRows = await database
    .select({
      id: supportTicketMessages.id,
      ticketId: supportTicketMessages.ticketId,
      senderUserId: supportTicketMessages.senderUserId,
      message: supportTicketMessages.message,
      createdAt: supportTicketMessages.createdAt,
      senderName: users.name,
      senderRole: users.role,
    })
    .from(supportTicketMessages)
    .leftJoin(users, eq(supportTicketMessages.senderUserId, users.id))
    .where(
      and(
        eq(supportTicketMessages.organisationId, organisationId),
        eq(supportTicketMessages.isInternalNote, false),
      ),
    )
    .orderBy(asc(supportTicketMessages.createdAt));

  const messagesByTicket = new Map<string, typeof messageRows>();

  for (const row of messageRows) {
    const bucket = messagesByTicket.get(row.ticketId) ?? [];
    bucket.push(row);
    messagesByTicket.set(row.ticketId, bucket);
  }

  return {
    viewer: { userId: viewerUserId },
    tickets: ticketRows.map((ticket) => ({
      ...ticket,
      messages: (messagesByTicket.get(ticket.id) ?? []).map((message) => ({
        ...message,
        authorKind:
          message.senderRole === "platform_admin" ? "support" : "customer",
      })),
    })),
  };
}

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);

    try {
      await requireDesktopDevice(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "DESKTOP_DEVICE_REQUIRED"
      ) {
        return clientApiError(
          "DESKTOP_DEVICE_REQUIRED",
          403,
          "This support endpoint is available to authorised Waste X Desktop devices.",
        );
      }
      throw error;
    }

    return clientApiJson({
      ok: true,
      ...(await readSupportData(context.organisationId, context.userId)),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);

    try {
      await requireDesktopDevice(context);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "DESKTOP_DEVICE_REQUIRED"
      ) {
        return clientApiError(
          "DESKTOP_DEVICE_REQUIRED",
          403,
          "This support endpoint is available to authorised Waste X Desktop devices.",
        );
      }
      throw error;
    }

    const parsed = mutationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_SUPPORT_REQUEST",
        400,
        "The support request is incomplete or invalid.",
      );
    }

    const mutation = parsed.data;
    const actor = await requireOrganisationActor(
      context.organisationId,
      mutation.data.actorUserId,
    );

    if (!actor) {
      return clientApiError(
        "SUPPORT_ACTOR_UNAVAILABLE",
        403,
        "The user who created this offline support change is no longer available.",
      );
    }

    if (mutation.operation === "ticket.create") {
      const anyTicketWithId = await database.query.supportTickets.findFirst({
        where: eq(supportTickets.id, mutation.data.ticketId),
        columns: { id: true, organisationId: true },
      });

      if (
        anyTicketWithId &&
        anyTicketWithId.organisationId !== context.organisationId
      ) {
        return clientApiError(
          "SUPPORT_TICKET_ID_CONFLICT",
          409,
          "Waste X could not reconcile this offline support ticket ID.",
        );
      }

      await database.transaction(async (tx) => {
        if (!anyTicketWithId) {
          const occurredAt = new Date(mutation.data.occurredAt);

          await tx.insert(supportTickets).values({
            id: mutation.data.ticketId,
            organisationId: context.organisationId,
            createdByUserId: actor.id,
            category: mutation.data.category,
            priority: mutation.data.priority,
            status: "open",
            createdAt: occurredAt,
            updatedAt: occurredAt,
          });
        }

        await tx
          .insert(supportTicketMessages)
          .values({
            id: mutation.data.messageId,
            organisationId: context.organisationId,
            ticketId: mutation.data.ticketId,
            senderUserId: actor.id,
            message: mutation.data.message,
            isInternalNote: false,
            createdAt: new Date(mutation.data.occurredAt),
          })
          .onConflictDoNothing();
      });
    } else {
      const ticket = await database.query.supportTickets.findFirst({
        where: and(
          eq(supportTickets.id, mutation.data.ticketId),
          eq(supportTickets.organisationId, context.organisationId),
        ),
        columns: { id: true, status: true },
      });

      if (!ticket) {
        return clientApiError(
          "SUPPORT_TICKET_NOT_FOUND",
          404,
          "This support ticket could not be found.",
        );
      }

      if (ticket.status === "resolved" || ticket.status === "closed") {
        return clientApiError(
          "SUPPORT_TICKET_CLOSED",
          409,
          "Resolved or closed support tickets cannot receive customer replies.",
        );
      }

      const occurredAt = new Date(mutation.data.occurredAt);

      await database.transaction(async (tx) => {
        const inserted = await tx
          .insert(supportTicketMessages)
          .values({
            id: mutation.data.messageId,
            organisationId: context.organisationId,
            ticketId: ticket.id,
            senderUserId: actor.id,
            message: mutation.data.message,
            isInternalNote: false,
            createdAt: occurredAt,
          })
          .onConflictDoNothing()
          .returning({ id: supportTicketMessages.id });

        if (inserted.length) {
          await tx
            .update(supportTickets)
            .set({
              updatedAt: occurredAt,
              ...(ticket.status === "waiting_on_user"
                ? { status: "open" as const }
                : {}),
            })
            .where(
              and(
                eq(supportTickets.id, ticket.id),
                eq(supportTickets.organisationId, context.organisationId),
              ),
            );
        }
      });
    }

    return clientApiJson({
      ok: true,
      ticketId: mutation.data.ticketId,
      data: await readSupportData(context.organisationId, context.userId),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
