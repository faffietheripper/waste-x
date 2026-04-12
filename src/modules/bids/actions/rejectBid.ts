import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function rejectBid(bidId: number) {
  await database
    .update(bids)
    .set({ status: "rejected" })
    .where(eq(bids.id, bidId));

  return { success: true };
}
