import { database } from "@/db/database";
import { supportTickets, supportTicketMessages } from "@/db/schema";

type TicketCategory =
  | "bug"
  | "billing"
  | "access"
  | "feature_request"
  | "compliance"
  | "other";

type TicketPriority = "low" | "medium" | "high" | "urgent";

export async function createTicket({
  organisationId,
  userId,
  category,
  priority,
  message,
}: {
  organisationId: string;
  userId: string;
  category: TicketCategory;
  priority: TicketPriority;
  message: string;
}) {
  if (!category || !priority || !message) {
    throw new Error("INVALID_INPUT");
  }

  const ticket = await database.transaction(async (tx) => {
    const [newTicket] = await tx
      .insert(supportTickets)
      .values({
        organisationId,
        createdByUserId: userId,
        category,
        priority,
        status: "open",
      })
      .returning();

    await tx.insert(supportTicketMessages).values({
      organisationId,
      ticketId: newTicket.id,
      senderUserId: userId,
      message,
    });

    return newTicket;
  });

  return {
    success: true,
    ticketId: ticket.id,
  };
}
