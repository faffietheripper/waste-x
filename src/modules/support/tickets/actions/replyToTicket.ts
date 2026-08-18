"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  supportTicketMessages,
  supportTickets,
  users,
} from "@/db/schema";

export type ReplyToTicketActionState = {
  success: boolean;
  message: string;
};

const MAX_MESSAGE_LENGTH = 5000;

function fail(message: string): ReplyToTicketActionState {
  return {
    success: false,
    message,
  };
}

export async function replyToTicketAction(
  _previousState: ReplyToTicketActionState | null,
  formData: FormData,
): Promise<ReplyToTicketActionState> {
  const session = await auth();

  if (!session?.user?.id) {
    return fail("You must be signed in to reply to a support ticket.");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    return fail(
      "Your account is not available to reply to this ticket.",
    );
  }

  const ticketId = String(
    formData.get("ticketId") ?? "",
  ).trim();

  const message = String(
    formData.get("message") ?? "",
  ).trim();

  const requestedInternalNote =
    String(formData.get("isInternalNote") ?? "") === "true";

  if (!ticketId) {
    return fail(
      "The support ticket could not be identified.",
    );
  }

  if (!message) {
    return fail("Enter a reply before sending.");
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return fail(
      `Support replies must be ${MAX_MESSAGE_LENGTH.toLocaleString(
        "en-GB",
      )} characters or fewer.`,
    );
  }

  const ticket =
    await database.query.supportTickets.findFirst({
      where: eq(supportTickets.id, ticketId),
      columns: {
        id: true,
        organisationId: true,
        status: true,
      },
    });

  if (!ticket) {
    return fail(
      "That support ticket could not be found.",
    );
  }

  const isPlatformAdmin =
    currentUser.role === "platform_admin";

  /*
    Customer users may only reply to support tickets belonging
    to their own organisation.

    platform_admin is the separate Waste X platform role and may
    reply across organisations through the admin workspace.
  */
  if (
    !isPlatformAdmin &&
    (!currentUser.organisationId ||
      currentUser.organisationId !==
        ticket.organisationId)
  ) {
    return fail(
      "You do not have access to reply to this support ticket.",
    );
  }

  if (ticket.status === "closed") {
    return fail(
      "This support ticket is closed and can no longer be replied to.",
    );
  }

  /*
    A customer cannot manufacture an internal note by manually
    posting isInternalNote=true.
  */
  const isInternalNote =
    isPlatformAdmin && requestedInternalNote;

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .insert(supportTicketMessages)
      .values({
        organisationId:
          ticket.organisationId,

        ticketId:
          ticket.id,

        senderUserId:
          currentUser.id,

        message,

        isInternalNote,

        createdAt:
          now,
      });

    await tx
      .update(supportTickets)
      .set({
        updatedAt: now,
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
  });

  revalidatePath("/home/support");
  revalidatePath(
    `/home/support/${ticket.id}`,
  );

  revalidatePath("/admin/support");
  revalidatePath(
    `/admin/support/${ticket.id}`,
  );

  return {
    success: true,

    message: isInternalNote
      ? "Internal note saved."
      : "Your reply has been added to the ticket.",
  };
}