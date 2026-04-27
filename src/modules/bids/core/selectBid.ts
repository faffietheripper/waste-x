import { database } from "@/db/database";
import { bids, wasteListings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { assignCarrierDirect } from "@/modules/assignments/core/assignCarrierDirect";

type Input = {
  listingId: number;
  bidId: number;
};

type Context = {
  organisationId: string;
};

export async function selectBid(input: Input, ctx: Context) {
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, input.listingId),
  });

  if (!listing) throw new Error("Listing not found");

  if (listing.organisationId !== ctx.organisationId) {
    throw new Error("Not authorised");
  }

  const bid = await database.query.bids.findFirst({
    where: eq(bids.id, input.bidId),
  });

  if (!bid) throw new Error("Bid not found");

  /* ===============================
     ASSIGNMENT (CORE LOGIC)
  ============================== */

  await assignCarrierDirect({
    listingId: input.listingId,
    carrierOrganisationId: bid.organisationId,
    assignedByOrganisationId: ctx.organisationId,
  });

  /* ===============================
     MARK BID ACCEPTED
  ============================== */

  await database
    .update(bids)
    .set({ status: "accepted" })
    .where(eq(bids.id, input.bidId));

  return {
    success: true,
    message: "Listing assigned successfully",
  };
}
