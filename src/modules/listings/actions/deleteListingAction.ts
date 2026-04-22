"use server";

import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const deleteListingAction = withErrorHandling(
  async (formData: FormData) => {
    /* ===============================
       AUTH
    ============================== */

    const { userId } = await requireOrgUser();

    /* ===============================
       INPUT
    ============================== */

    const listingIdRaw = formData.get("listingId");

    if (!listingIdRaw) {
      throw new Error("Listing ID is required");
    }

    const listingId = Number(listingIdRaw);

    if (isNaN(listingId)) {
      throw new Error("Invalid listing ID");
    }

    /* ===============================
       DELETE (OWNERSHIP ENFORCED)
    ============================== */

    await database
      .delete(wasteListings)
      .where(
        and(eq(wasteListings.id, listingId), eq(wasteListings.userId, userId)),
      );

    return { success: true };
  },
  {
    actionName: "deleteListing",
    code: ERROR_CODES.LISTING_DELETE_FAILED,
    severity: "high",
  },
);
