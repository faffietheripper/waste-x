import React from "react";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import ListingsFilter from "@/components/app/ListingsFilter";
import type { InferSelectModel } from "drizzle-orm";

type Listing = InferSelectModel<typeof wasteListings>;

export default async function FilteredListingsPage({
  searchParams,
}: {
  searchParams: {
    endDate?: string;
    minBid?: string;
    location?: string;
  };
}) {
  const { endDate, minBid, location } = searchParams;

  const allListings: Listing[] = await database.query.wasteListings.findMany({
    where: (listings, { and, eq }) =>
      and(eq(listings.archived, false), eq(listings.status, "open")),

    orderBy: (listings, { desc }) => [desc(listings.createdAt)],
  });

  const filteredListings = allListings
    .filter((listing) => {
      if (endDate) {
        return new Date(listing.endDate) <= new Date(endDate);
      }
      return true;
    })
    .filter((listing) => {
      if (minBid) {
        return listing.startingPrice >= Number(minBid);
      }
      return true;
    })
    .filter((listing) => {
      if (location) {
        return listing.location === location;
      }
      return true;
    });

  return (
    <main>
      <div className="w-full shadow-md pl-[24vw] pt-[13vh] pb-8 fixed bg-gray-50">
        <ListingsFilter />
      </div>

      <section className="pl-[24vw] min-h-screen overflow-y-scroll py-64 px-12">
        <h1 className="font-bold text-3xl text-center mt-8 mb-14">
          Waste Listings
        </h1>

        <div className="grid grid-cols-3 gap-6 mt-6">
          {filteredListings.length > 0 ? (
            filteredListings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))
          ) : (
            <p>No listings match your criteria.</p>
          )}
        </div>
      </section>
    </main>
  );
}
