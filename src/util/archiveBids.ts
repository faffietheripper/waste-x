"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { database } from "@/db/database";
import { wasteListings, bids } from "@/db/schema";
import { createNotification } from "@/modules/notifications/services/createNotification";

export async function archiveBids(formData: FormData) {
  const listingId = Number(formData.get("listingId"));

  if (!listingId || Number.isNaN(listingId)) {
    throw new Error("Invalid listing ID.");
  }

  try {
    const listing = await database.query.wasteListings.findFirst({
      where: eq(wasteListings.id, listingId),
      columns: {
        id: true,
        name: true,
        organisationId: true,
      },
    });

    if (!listing) {
      throw new Error("Listing not found.");
    }

    await database
      .update(wasteListings)
      .set({
        archived: true,
      })
      .where(eq(wasteListings.id, listingId));

    const bidUsers = await database.query.bids.findMany({
      where: eq(bids.listingId, listingId),
      columns: {
        userId: true,
      },
    });

    const uniqueRecipientIds = Array.from(
      new Set(
        bidUsers
          .map((bidUser) => bidUser.userId)
          .filter((userId): userId is string => Boolean(userId)),
      ),
    );

    await Promise.all(
      uniqueRecipientIds.map((recipientId) =>
        createNotification({
          organisationId: listing.organisationId,
          recipientId,
          listingId: listing.id,
          type: "listing_archived",
          title: "Listing Archived",
          message: `The listing "${listing.name}" you bid on has been archived. You can no longer bid on it.`,
        }),
      ),
    );

    console.log("Listing archived and notifications sent successfully.");
  } catch (error) {
    console.error("Error archiving listing:", error);
    throw new Error("Failed to archive listing.");
  }

  redirect("/home/my-activity/archived-listings");
}