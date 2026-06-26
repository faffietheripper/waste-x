import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { desc } from "drizzle-orm";
import { redirect } from "next/navigation";

import ListingsFilters from "@/components/app/ListingsFilter";
import ListingCard from "@/components/ListingCard";

import { canUserAccessListing } from "@/modules/listings/core/canUserAccessListing";
import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";

/* =========================================================
   HELPERS
========================================================= */

function getParam(param: string | string[] | undefined) {
  if (!param) return undefined;
  return Array.isArray(param) ? param[0] : param;
}

function formatStatus(status: string | undefined) {
  if (!status || status === "all") return "All visible listings";

  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/* =========================================================
   PAGE
========================================================= */

export default async function BrowsePage({ searchParams }: any) {
  /* =========================================================
     DEPARTMENT PERMISSION GUARD

     Marketplace browsing is an operational bidding area.

     This means:
     - carrier department can access
     - manager department can access
     - generator department cannot access
     - compliance department cannot access

     The organisation must also have the matching capability.
  ========================================================= */

  const context = await requireOperationalPermission("listing:bid");

  const userOrganisationId = context.user.organisationId;

  if (!userOrganisationId) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  /* =========================================================
     FETCH
  ========================================================= */

  const listings = await database
    .select()
    .from(wasteListings)
    .orderBy(desc(wasteListings.createdAt));

  /* =========================================================
     ACCESS CONTROL

     This keeps restricted/internal listings from leaking to organisations
     that should not see them.
  ========================================================= */

  const visibleListings = listings.filter((listing: any) =>
    canUserAccessListing({
      listing,
      userOrganisationId,
    }),
  );

  let filtered = visibleListings;

  /* =========================================================
     PARAMS
  ========================================================= */

  const status = getParam(searchParams.status);
  const location = getParam(searchParams.location);
  const minPrice = getParam(searchParams.minPrice);
  const maxPrice = getParam(searchParams.maxPrice);
  const endDate = getParam(searchParams.endDate);

  /* =========================================================
     FILTERS
  ========================================================= */

  if (status && status !== "all") {
    filtered = filtered.filter((listing: any) => listing.status === status);
  }

  if (location) {
    const loc = location.toLowerCase();

    filtered = filtered.filter(
      (listing: any) =>
        typeof listing.location === "string" &&
        listing.location.toLowerCase().includes(loc),
    );
  }

  if (minPrice) {
    const min = Number(minPrice);

    if (!Number.isNaN(min)) {
      filtered = filtered.filter((listing: any) => {
        const value = listing.currentBid ?? listing.startingPrice ?? 0;
        return value >= min;
      });
    }
  }

  if (maxPrice) {
    const max = Number(maxPrice);

    if (!Number.isNaN(max)) {
      filtered = filtered.filter((listing: any) => {
        const value = listing.currentBid ?? listing.startingPrice ?? 0;
        return value <= max;
      });
    }
  }

  if (endDate) {
    const selectedEndDate = new Date(endDate);

    if (!Number.isNaN(selectedEndDate.getTime())) {
      filtered = filtered.filter((listing: any) => {
        if (!listing.endDate) return false;

        return new Date(listing.endDate) <= selectedEndDate;
      });
    }
  }

  /* =========================================================
     METRICS
  ========================================================= */

  const visibleTotal = visibleListings.length;

  const openCount = visibleListings.filter(
    (listing: any) => listing.status === "open",
  ).length;

  const assignedCount = visibleListings.filter(
    (listing: any) => listing.status === "assigned",
  ).length;

  const completedCount = visibleListings.filter(
    (listing: any) => listing.status === "completed",
  ).length;

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Marketplace
              </p>

              <h1 className="mt-3 text-3xl font-semibold">Browse Listings</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Discover available waste listings your department is allowed to
                access. Marketplace access is restricted to departments that can
                participate in bidding or waste management operations.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                  Current filter: {formatStatus(status)}
                </span>

                {location && (
                  <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                    Location: {location}
                  </span>
                )}

                <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                  Department: {context.department.name}
                </span>
              </div>
            </div>

            <div className="hidden rounded-2xl border border-white/10 bg-white/5 p-5 text-right lg:block">
              <p className="text-xs uppercase tracking-widest text-white/35">
                Visible Results
              </p>
              <p className="mt-2 text-3xl font-semibold text-orange-400">
                {filtered.length}
              </p>
              <p className="mt-1 text-xs text-white/45">
                Matching current filters
              </p>
            </div>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
          <MetricCard label="Visible" value={visibleTotal} />
          <MetricCard label="Open" value={openCount} />
          <MetricCard label="Assigned" value={assignedCount} />
          <MetricCard label="Completed" value={completedCount} />
        </section>

        {/* FILTERS */}
        <ListingsFilters />

        {/* RESULTS HEADER */}
        <section className="flex items-end justify-between gap-6">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Marketplace Results
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-black">
              Waste Listings
            </h2>
            <p className="mt-2 text-sm text-black/45">
              Showing {filtered.length} listing
              {filtered.length === 1 ? "" : "s"} available to your department.
            </p>
          </div>
        </section>

        {/* LISTINGS */}
        {filtered.length === 0 ? (
          <section className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
            <p className="text-base font-semibold text-black">
              No listings found.
            </p>

            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
              No listings matched your current filters, or your organisation
              does not have access to any marketplace listings under this view.
            </p>
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((listing: any) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}