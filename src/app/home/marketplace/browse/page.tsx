import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { desc } from "drizzle-orm";
import BrowseFilters from "@/components/app/MarketPlace/BrowseFilters";
import ListingCard from "@/components/ListingCard";

/* =========================================================
   HELPERS
========================================================= */

function getParam(param: string | string[] | undefined) {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
}

/* =========================================================
   PAGE
========================================================= */

export default async function BrowsePage({
  searchParams,
}: {
  searchParams: {
    status?: string | string[];
    minPrice?: string | string[];
    maxPrice?: string | string[];
    location?: string | string[];
  };
}) {
  /* =========================================================
     FETCH
  ========================================================= */

  const listings = await database
    .select()
    .from(wasteListings)
    .orderBy(desc(wasteListings.createdAt));

  /* =========================================================
     NORMALISE PARAMS
  ========================================================= */

  const status = getParam(searchParams.status);
  const location = getParam(searchParams.location);
  const minPrice = getParam(searchParams.minPrice);
  const maxPrice = getParam(searchParams.maxPrice);

  /* =========================================================
     FILTERING (DEFENSIVE)
  ========================================================= */

  let filtered = listings;

  if (status) {
    filtered = filtered.filter((l: any) => l.status === status);
  }

  if (location) {
    const loc = location.toLowerCase();
    filtered = filtered.filter(
      (l: any) =>
        typeof l.location === "string" &&
        l.location.toLowerCase().includes(loc),
    );
  }

  if (minPrice) {
    const min = Number(minPrice);
    if (!isNaN(min)) {
      filtered = filtered.filter(
        (l: any) =>
          l.currentBid === null ||
          l.currentBid === undefined ||
          l.currentBid >= min,
      );
    }
  }

  if (maxPrice) {
    const max = Number(maxPrice);
    if (!isNaN(max)) {
      filtered = filtered.filter(
        (l: any) =>
          l.currentBid === null ||
          l.currentBid === undefined ||
          l.currentBid <= max,
      );
    }
  }

  /* =========================================================
     DEBUG (REMOVE LATER)
  ========================================================= */

  console.log("RAW LISTINGS:", listings.length);
  console.log("FILTERED LISTINGS:", filtered.length);
  console.log("PARAMS:", { status, location, minPrice, maxPrice });

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="flex flex-col gap-10 pb-20 mt-32">
      {/* FILTER BAR */}
      <BrowseFilters />
      <h1 className="pl-[24vw] text-3xl font-black text-center  mt-28">
        Waste Listings
      </h1>
      {/* GRID */}
      <div className="px-10 pl-[24vw] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <div className="text-gray-400 text-sm">
            No listings found.
            <br />
            <span className="text-xs opacity-60">
              (Check console logs — data may be filtered out)
            </span>
          </div>
        ) : (
          filtered.map((listing: any) => (
            <>
              <ListingCard key={listing.id} listing={listing} />
            </>
          ))
        )}
      </div>
    </div>
  );
}
