import React from "react";
import Image from "next/image";
import Link from "next/link";
import { format } from "date-fns";
import { InferSelectModel } from "drizzle-orm";
import { wasteListings } from "@/db/schema";
import { getImageUrl } from "@/util/files";
import { isBidOver } from "@/util/bids";
import { archiveBids } from "@/util/archiveBids";
import { unarchivedBids } from "@/util/unarchivedBids";
import { auth } from "@/auth";
import { deleteListingAction } from "@/modules/listings/actions/deleteListingAction";

type Listing = InferSelectModel<typeof wasteListings>;

export default async function ListingCard({ listing }: { listing: Listing }) {
  const session = await auth();
  const userRole = session?.user?.role;

  const bidOver = await isBidOver(listing);

  const canPlaceBid =
    userRole !== "wasteGenerator" &&
    listing.userId !== session?.user?.id &&
    !bidOver;

  /* ===============================
     FILES
  ============================== */

  const fileKeys = listing.fileKey?.split(",") ?? [];

  const firstImageUrl = fileKeys[0]
    ? getImageUrl(fileKeys[0])
    : "/placeholder.png";

  /* ===============================
     UI
  ============================== */

  return (
    <div className="border p-6 rounded-lg w-full flex flex-col gap-6 justify-between">
      <div className="flex flex-col">
        <Image
          src={firstImageUrl}
          width={200}
          height={200}
          alt={listing.name}
          className="rounded-lg h-48 w-full object-cover"
        />

        <h1 className="text-lg font-semibold my-3">{listing.name}</h1>

        <h1 className="text-md mb-2">
          <span className="font-semibold">Starting Price: </span>£
          {listing.startingPrice}
        </h1>

        {bidOver ? (
          <p className="text-red-600 text-md font-semibold">Bidding is Over.</p>
        ) : (
          <p>
            <span className="font-semibold text-md">Bid Ends On: </span>
            {format(listing.endDate, "M/dd/yy")}
          </p>
        )}
      </div>

      {/* ===============================
         ACTIVE LISTING
      ============================== */}

      {!listing.archived ? (
        <section>
          {listing.userId === session?.user?.id ? (
            <div className="grid grid-cols-2 gap-2">
              <Link href={`/home/marketplace/browse/${listing.id}`}>
                <button className="bg-blue-600 py-2 px-4 rounded-md w-full text-white">
                  View Listing
                </button>
              </Link>

              <form action={archiveBids}>
                <input type="hidden" name="listingId" value={listing.id} />
                <button
                  type="submit"
                  className="bg-gray-600 py-2 px-4 rounded-md w-full text-white"
                >
                  Archive
                </button>
              </form>
            </div>
          ) : (
            <Link href={`/home/marketplace/browse/${listing.id}`}>
              <button className="bg-blue-600 py-2 px-4 rounded-md w-full text-white">
                View Listing
              </button>
            </Link>
          )}
        </section>
      ) : (
        /* ===============================
           ARCHIVED LISTING
        ============================== */
        <section>
          <Link href={`/home/marketplace/browse/${listing.id}`}>
            <button className="bg-blue-600 py-2 px-4 mb-2 rounded-md w-full text-white">
              {userRole === "wasteGenerator"
                ? "View Listing"
                : canPlaceBid
                  ? "Place Bid"
                  : "Cannot Bid"}
            </button>
          </Link>

          <div className="grid grid-cols-2 gap-2">
            <form action={deleteListingAction}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button className="bg-red-600 py-2 px-4 rounded-md w-full text-white">
                Delete
              </button>
            </form>

            <form action={unarchivedBids}>
              <input type="hidden" name="listingId" value={listing.id} />
              <button
                type="submit"
                className="bg-gray-600 py-2 px-4 rounded-md w-full text-white"
              >
                Unarchive
              </button>
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
