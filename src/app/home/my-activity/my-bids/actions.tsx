"use server";

import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { auth } from "@/auth";
import { eq, and } from "drizzle-orm";
import { revalidatePath } from "next/cache";

// Delete a bid by ID
export async function deleteBidAction(bidId: number) {
  const session = await auth();

  if (!session || !session.user) {
    throw new Error("Unauthorized");
  }

  await database
    .delete(bids)
    .where(and(eq(bids.id, bidId), eq(bids.userId, session.user.id!)));

  revalidatePath("/home/my-activity/my-bids");
}

//not using this for now because you can always decline the offer or make another bid but they need to be told !!
