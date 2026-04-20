import { auth } from "@/auth";
import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   PAGE
========================================================= */

export default async function MyBidsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  /* ===============================
     FETCH BIDS
  ============================== */

  const allBids = await database.query.bids.findMany({
    where: eq(bids.organisationId, orgId),
    with: {
      listing: true,
    },
  });

  /* ===============================
     FILTER LOGIC
  ============================== */

  const status = searchParams?.status || "";

  let filtered = allBids as any[];

  if (status === "won") {
    filtered = allBids.filter(
      (b: any) => b.listing?.winningOrganisationId === orgId,
    );
  }

  if (status === "lost") {
    filtered = allBids.filter(
      (b: any) =>
        b.listing?.winningOrganisationId &&
        b.listing?.winningOrganisationId !== orgId,
    );
  }

  if (status === "cancelled") {
    filtered = allBids.filter((b: any) => b.cancelledJob === true);
  }

  if (!status) {
    // ACTIVE
    filtered = allBids.filter(
      (b: any) => !b.cancelledJob && !b.listing?.winningOrganisationId,
    );
  }

  /* ===============================
     UI
  ============================== */

  return (
    <div className="p-10 flex flex-col gap-10">
      {/* HEADER */}
      <div className="">
        <h1 className="text-2xl font-semibold">My Bids</h1>
        <p className="text-sm text-gray-500">
          Track all bids placed by your organisation
        </p>
      </div>

      {/* GRID */}
      <div className=" grid grid-cols-3 gap-6">
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-400">No bids found.</p>
        ) : (
          filtered.map((bid: any) => {
            const listing = bid.listing;

            const statusLabel = bid.cancelledJob
              ? "Cancelled"
              : listing?.winningOrganisationId === orgId
                ? "Won"
                : listing?.winningOrganisationId
                  ? "Lost"
                  : "Active";

            return (
              <div
                key={bid.id}
                className="border border-gray-200 rounded-xl p-6 bg-white shadow-sm hover:shadow-md transition"
              >
                <h2 className="text-sm font-semibold text-gray-800">
                  {listing?.name || "Unknown Listing"}
                </h2>

                <p className="text-xs text-gray-500 mt-1">
                  {listing?.location || "Unknown location"}
                </p>

                <p className="text-xs mt-2">Your Bid: £{bid.amount}</p>

                <p className="text-xs text-gray-400 mt-3 uppercase">
                  {statusLabel}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
