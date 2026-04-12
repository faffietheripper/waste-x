"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

import { createTicket } from "@/modules/support/tickets/actions/createTicket";
import { createTicketSchema } from "@/modules/support/validators/createTicketSchema";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const createTicketAction = withErrorHandling(
  async (_prevState: any, formData: FormData) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("UNAUTHORIZED");
    }

    const dbUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (!dbUser?.organisationId) {
      throw new Error("USER_ORG_NOT_FOUND");
    }

    const parsed = createTicketSchema.safeParse({
      category: formData.get("category"),
      priority: formData.get("priority"),
      message: formData.get("message"),
    });

    if (!parsed.success) {
      throw new Error("INVALID_INPUT");
    }

    return createTicket({
      organisationId: dbUser.organisationId,
      userId: dbUser.id,
      ...parsed.data,
    });
  },
  {
    actionName: "createTicketAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "high",
  },
);
