import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { eq } from "drizzle-orm";
import { bids } from "@/db/schema";
import Link from "next/link";

export default async function TeamBids() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  const organisationId = session.user.organisationId;

  const allOrgBids = await database.query.bids.findMany({
    where: eq(bids.organisationId, organisationId),
    with: {
      listing: true,
    },
  });

  const hasBids = allOrgBids.length > 0;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Organisation Bids</h1>

      {hasBids ? (
        <ul className="space-y-4">
          {allOrgBids.map((bid) => {
            const isWinningBid = bid.listing?.winningBidId === bid.id;

            return (
              <li
                key={bid.id}
                className="p-6 border flex justify-between rounded-lg shadow-sm"
              >
                <section>
                  <div>
                    <strong>Bid for:</strong> {bid.listing?.name}
                  </div>

                  <div>
                    <strong>Bid Amount:</strong> £{bid.amount}
                  </div>

                  <div>
                    <strong>Date:</strong>{" "}
                    {new Date(bid.timestamp).toLocaleString()}
                  </div>

                  {bid.cancelledJob ? (
                    <div>
                      <h1 className="text-red-600 font-bold">Canceled Job</h1>
                      <p>Cancellation Reason: {bid.cancellationReason}</p>
                    </div>
                  ) : bid.declinedOffer ? (
                    <h1 className="text-red-600 font-bold">Declined Offer</h1>
                  ) : isWinningBid ? (
                    <h1 className="text-yellow-600 font-bold">Winning Bid</h1>
                  ) : (
                    <h1 className="text-green-600 font-bold">Pending</h1>
                  )}
                </section>

                <div className="mt-4 flex space-x-4">
                  <Link href={`/home/listings/${bid.listingId}`}>
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
        <p className="text-gray-600">
          Your organisation has not placed any bids yet.
        </p>
      )}
    </div>
  );
}
