"use server";

import { database } from "@/db/database";
import { wasteListings, listingTemplateData } from "@/db/schema";
import { requireOrgUser } from "@/lib/access/require-org-user";
import { createListing } from "../core/createListing";
import { withErrorHandling } from "@/lib/errors/withErrorHandling";
import { ERROR_CODES } from "@/lib/errors/errorCodes";

export const createListingAction = withErrorHandling(
  async (input: any) => {
    const { userId, organisationId } = await requireOrgUser();

    /* ===============================
       CREATE LISTING
    ============================== */

    const listing = createListing(input, {
      userId,
      organisationId,
    });

    const inserted = await database
      .insert(wasteListings)
      .values(listing)
      .returning({ id: wasteListings.id });

    const listingId = inserted?.[0]?.id;

    if (!listingId) {
      throw new Error("Failed to create listing");
    }

    /* ===============================
       🔥 INSERT TEMPLATE DATA
    ============================== */

    await database.insert(listingTemplateData).values({
      id: crypto.randomUUID(),
      listingId,
      organisationId,
      templateId: input.templateId,
      templateVersion: 1,
      dataJson: JSON.stringify(input.templateData),
    });

    return { success: true, id: listingId };
  },
  {
    actionName: "createListing",
    code: ERROR_CODES.LISTING_CREATE_FAILED,
    severity: "high",
  },
);
