import { database } from "@/db/database";
import { carrierAssignments, wasteListings, bids } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function cancelAssignment({
  listingId,
  bidId,
  userId,
  cancellationReason,
}: {
  listingId: number;
  bidId: number;
  userId: string;
  cancellationReason: string;
}) {
  if (!cancellationReason.trim()) {
    throw new Error("CANCELLATION_REASON_REQUIRED");
  }

  const bid = await database.query.bids.findFirst({
    where: eq(bids.id, bidId),
  });

  if (!bid || bid.userId !== userId) {
    throw new Error("BID_NOT_FOUND");
  }

  // ❌ cancel bid
  await database
    .update(bids)
    .set({
      status: "withdrawn",
      cancellationReason,
    })
    .where(eq(bids.id, bidId));

  // ❌ remove assignment (if exists)
  await database
    .update(carrierAssignments)
    .set({
      status: "rejected",
    })
    .where(eq(carrierAssignments.listingId, listingId));

  // 🔁 reset listing
  await database
    .update(wasteListings)
    .set({
      assignedCarrierOrganisationId: null,
      assignmentMethod: null,
      status: "open",
    })
    .where(eq(wasteListings.id, listingId));

  return { success: true };
}
