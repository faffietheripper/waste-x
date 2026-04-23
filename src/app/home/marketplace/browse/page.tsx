import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { desc } from "drizzle-orm";
import BrowseFilters from "@/components/app/MarketPlace/BrowseFilters";
import ListingCard from "@/components/ListingCard";
import { auth } from "@/auth";
import { canUserAccessListing } from "@/modules/listings/core/canUserAccessListing";

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

export default async function BrowsePage({ searchParams }: any) {
  /* ===============================
     AUTH
  ============================== */

  const session = await auth();

  if (!session?.user) {
    throw new Error("User not authenticated");
  }

  const userOrganisationId = session.user.organisationId;

  /* ===============================
     FETCH
  ============================== */

  const listings = await database
    .select()
    .from(wasteListings)
    .orderBy(desc(wasteListings.createdAt));

  /* ===============================
     ACCESS CONTROL (🔥 NEW)
  ============================== */

  let filtered = listings.filter((listing: any) =>
    canUserAccessListing({
      listing,
      userOrganisationId,
    }),
  );

  /* ===============================
     PARAMS
  ============================== */

  const status = getParam(searchParams.status);
  const location = getParam(searchParams.location);
  const minPrice = getParam(searchParams.minPrice);
  const maxPrice = getParam(searchParams.maxPrice);

  /* ===============================
     EXISTING FILTERS
  ============================== */

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

  /* ===============================
     UI
  ============================== */

  return (
    <div className="flex flex-col gap-10 pb-20 mt-32">
      <BrowseFilters />

      <h1 className="pl-[24vw] text-3xl font-black text-center mt-28">
        Waste Listings
      </h1>

      <div className="px-10 pl-[24vw] grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <div className="text-gray-400 text-sm">No listings found.</div>
        ) : (
          filtered.map((listing: any) => (
            <ListingCard key={listing.id} listing={listing} />
          ))
        )}
      </div>
    </div>
  );
}
