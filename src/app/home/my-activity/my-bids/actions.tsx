"use server";

import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { auth } from "@/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

/* =========================================================
   DELETE BID
========================================================= */

export const deleteBidAction = withErrorHandling(
  async (bidId: number) => {
    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    await database
      .delete(bids)
      .where(and(eq(bids.id, bidId), eq(bids.userId, session.user.id)));

    revalidatePath("/home/my-activity/my-bids");
  },
  {
    actionName: "deleteBidAction",
    code: ERROR_CODES.SYSTEM_UNEXPECTED,
    severity: "medium", // destructive but limited scope
  },
);

/*
NOTE:
Not currently used — users can decline offers or place new bids instead.
If reintroduced later, consider:
- soft delete (archived flag)
- audit event logging
*/
