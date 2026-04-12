import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function withdrawBid({
  bidId,
  userId,
}: {
  bidId: number;
  userId: string;
}) {
  const bid = await database.query.bids.findFirst({
    where: eq(bids.id, bidId),
  });

  if (!bid || bid.userId !== userId) {
    throw new Error("BID_NOT_FOUND");
  }

  // 🔥 instead of delete → mark withdrawn
  await database
    .update(bids)
    .set({
      status: "withdrawn",
    })
    .where(eq(bids.id, bidId));

  return { success: true };
}
