"use server";

import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { auth } from "@/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const deleteListingAction = withErrorHandling(
  async (formData: FormData) => {
    /* ===============================
       AUTH
    ============================== */

    const session = await auth();

    if (!session?.user?.id) {
      throw new Error("Unauthorized");
    }

    /* ===============================
       VALIDATION
    ============================== */

    const listingIdRaw = formData.get("listingId");

    if (typeof listingIdRaw !== "string" || isNaN(parseInt(listingIdRaw))) {
      throw new Error("Invalid listing ID");
    }

    const listingId = parseInt(listingIdRaw);

    /* ===============================
       DELETE (SCOPED TO USER)
    ============================== */

    await database
      .delete(wasteListings)
      .where(
        and(
          eq(wasteListings.id, listingId),
          eq(wasteListings.userId, session.user.id),
        ),
      );

    /* ===============================
       REVALIDATE
    ============================== */

    revalidatePath("/home/my-activity/archived-listings");
  },
  {
    actionName: "deleteListingAction",
    code: ERROR_CODES.WASTE_INVALID_DATA,
    severity: "high", // destructive + user-owned data
  },
);
