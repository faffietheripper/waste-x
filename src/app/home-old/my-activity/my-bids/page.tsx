import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { eq } from "drizzle-orm";
import { bids } from "@/db/schema";
import Link from "next/link";

export default async function MyBids() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const allBids = await database.query.bids.findMany({
    where: eq(bids.userId, session.user.id),
    with: {
      listing: true, // ✅ Correct relation
    },
    orderBy: (b, { desc }) => [desc(b.timestamp)],
  });

  const hasBids = allBids.length > 0;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">My Bids</h1>

      {hasBids ? (
        <ul className="space-y-4">
          {allBids.map((bid) => {
            const isWinningBid = bid.listing?.winningBidId === bid.id;

            return (
              <li
                key={bid.id}
                className="p-6 border flex justify-between rounded-lg shadow-sm"
              >
                <section>
                  <div>
                    <strong>Bid for:</strong>{" "}
                    {bid.listing?.name ?? "Unknown Listing"}
                  </div>

                  <div>
                    <strong>Bid Amount:</strong> £{bid.amount}
                  </div>

                  <div>
                    <strong>Date:</strong> {bid.timestamp?.toLocaleString()}
                  </div>

                  {bid.cancelledJob ? (
                    <div className="mt-2">
                      <h1 className="text-red-600 font-bold">Cancelled Job</h1>
                      <p>Reason: {bid.cancellationReason ?? "N/A"}</p>
                    </div>
                  ) : bid.declinedOffer ? (
                    <h1 className="text-red-600 font-bold mt-2">
                      Declined Offer
                    </h1>
                  ) : isWinningBid ? (
                    <h1 className="text-yellow-600 font-bold mt-2">
                      Winning Bid
                    </h1>
                  ) : (
                    <h1 className="text-green-600 font-bold mt-2">Pending</h1>
                  )}
                </section>

                <div className="mt-4 flex space-x-4">
                  <Link href={`/home/create-waste-listings/${bid.listingId}`}>
                    <button className="bg-blue-500 text-white px-4 py-2 rounded-md">
                      View Listing
                    </button>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-gray-600">You have no bids yet.</p>
      )}
    </div>
  );
}
