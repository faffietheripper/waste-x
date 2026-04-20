import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { and, eq, isNotNull, desc } from "drizzle-orm";
import { wasteListings, bids, carrierAssignments } from "@/db/schema";
import Link from "next/link";
import { acceptOfferAction, declineOfferAction } from "./actions";
import CancelJob from "@/components/app/CancelJob";

export default async function MyWinningBids() {
  const session = await auth();

  if (!session?.user?.id || !session.user.organisationId) {
    throw new Error("Unauthorized");
  }

  const listings = await database.query.wasteListings.findMany({
    where: and(
      isNotNull(wasteListings.winningBidId),
      eq(wasteListings.winningOrganisationId, session.user.organisationId),
    ),

    orderBy: (listing, { desc }) => [desc(listing.createdAt)],

    with: {
      bids: true,

      carrierAssignments: {
        orderBy: (ca, { desc }) => [desc(ca.assignedAt)],
        limit: 1,
      },
    },
  });

  const activeListings = listings.filter((listing) => {
    const assignment = listing.carrierAssignments[0];

    if (assignment && assignment.status === "completed") {
      return false;
    }

    return true;
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">My Winning Bids</h1>

      {activeListings.length === 0 && (
        <p className="text-gray-500">You have no active winning bids.</p>
      )}

      {activeListings.map((listing) => {
        const winningBid = listing.bids.find(
          (b) => b.id === listing.winningBidId,
        );

        const assignment = listing.carrierAssignments[0];

        const showOfferActions = !listing.offerAccepted;

        const canCancel =
          listing.offerAccepted &&
          (!assignment || assignment.status === "pending");

        return (
          <div
            key={listing.id}
            className="p-6 border flex justify-between rounded-lg shadow-sm mb-4"
          >
            <section>
              <div>
                <strong>Listing:</strong> {listing.name}
              </div>

              <div>
                <strong>Winning Bid:</strong> £{winningBid?.amount}
              </div>

              <div>
                <strong>Date:</strong>{" "}
                {winningBid && new Date(winningBid.timestamp).toLocaleString()}
              </div>

              <div className="mt-2 font-semibold">
                {!listing.offerAccepted && "Awaiting your decision"}

                {listing.offerAccepted &&
                  !assignment &&
                  "Offer accepted – awaiting carrier"}

                {assignment?.status === "pending" &&
                  "Awaiting carrier response"}

                {assignment?.status === "accepted" && "Job assigned"}

                {assignment?.status === "collected" &&
                  "Collected – awaiting completion"}
              </div>
            </section>

            <div className="flex gap-3 items-start">
              <Link href={`/home/waste-listings/${listing.id}`}>
                <button className="bg-gray-500 text-white px-4 py-2 rounded-md">
                  View Listing
                </button>
              </Link>

              {showOfferActions && winningBid && (
                <>
                  <form action={acceptOfferAction}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <button className="bg-blue-600 text-white px-4 py-2 rounded-md">
                      Accept Offer
                    </button>
                  </form>

                  <form action={declineOfferAction}>
                    <input type="hidden" name="listingId" value={listing.id} />
                    <input type="hidden" name="bidId" value={winningBid.id} />
                    <button className="bg-red-600 text-white px-4 py-2 rounded-md">
                      Decline Offer
                    </button>
                  </form>
                </>
              )}

              {canCancel && winningBid && (
                <CancelJob listingId={listing.id} bidId={winningBid.id} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
