"use server";

import { auth } from "@/auth";
import { createBid } from "../core/createBid";

export async function createBidAction({
  listingId,
  amount,
}: {
  listingId: number;
  amount: number;
}) {
  const session = await auth();

  if (!session?.user?.id || !session.user.organisationId) {
    throw new Error("UNAUTHORISED");
  }

  return createBid({
    listingId,
    amount,
    userId: session.user.id,
    organisationId: session.user.organisationId,
  });
}
