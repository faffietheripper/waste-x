import React from "react";
import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { and, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";

export default async function TeamAssignedJobs() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  const organisationId = session.user.organisationId;

  // ✅ Fetch listings won by this organisation
  const wonListings = await database.query.wasteListings.findMany({
    where: and(
      eq(wasteListings.winningOrganisationId, organisationId),
      isNotNull(wasteListings.winningBidId),
      eq(wasteListings.archived, false),
    ),
    with: {
      bids: true,
      carrierAssignments: {
        orderBy: (ca, { desc }) => [desc(ca.assignedAt)],
        limit: 1,
      },
    },
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Organisation Assigned Jobs</h1>

      {wonListings.length > 0 ? (
        wonListings.map((listing) => {
          const latestAssignment = listing.carrierAssignments[0];

          const isCompleted = latestAssignment?.status === "completed";

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
                  <strong>Winning Bid:</strong> £{listing.currentBid}
                </div>

                <div>
                  <strong>Status:</strong>{" "}
                  {isCompleted ? (
                    <span className="text-green-600 font-bold">Completed</span>
                  ) : listing.offerAccepted ? (
                    <span className="text-yellow-600 font-bold">
                      Job in Progress
                    </span>
                  ) : (
                    <span className="text-blue-600 font-bold">
                      Offer Pending Acceptance
                    </span>
                  )}
                </div>
              </section>

              <div className="mt-4 flex space-x-4">
                <Link href={`/home/listings/${listing.id}`}>
                  <button className="bg-blue-500 text-white px-4 py-2 rounded-md">
                    View Listing
                  </button>
                </Link>
              </div>
            </div>
          );
        })
      ) : (
        <p className="text-gray-600">
          Your organisation has no assigned jobs yet.
        </p>
      )}
    </div>
  );
}
