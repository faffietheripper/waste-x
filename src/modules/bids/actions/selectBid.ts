import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assignCarrierDirect } from "@/modules/assignments/actions/assignCarrierDirect";

export async function selectBid({
  listingId,
  bidId,
  organisationId,
}: {
  listingId: number;
  bidId: number;
  organisationId: string;
}) {
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) throw new Error("LISTING_NOT_FOUND");

  if (listing.organisationId !== organisationId) {
    throw new Error("UNAUTHORIZED");
  }

  const bid = await database.query.bids.findFirst({
    where: eq(bids.id, bidId),
  });

  if (!bid) throw new Error("BID_NOT_FOUND");

  // 🔥 THIS IS THE KEY CHANGE
  // selecting a bid = creating assignment

  await assignCarrierDirect({
    listingId,
    carrierOrganisationId: bid.organisationId,
    assignedByOrganisationId: organisationId,
  });

  // optionally mark bid as accepted
  await database
    .update(bids)
    .set({ status: "accepted" })
    .where(eq(bids.id, bidId));

  return { success: true };
}
