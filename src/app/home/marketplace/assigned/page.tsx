import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";

/* =========================================================
   PAGE
========================================================= */

export default async function AssignedPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  /* =========================================================
     FETCH (SAFE QUERY — NO RELATIONS)
  ========================================================= */

  const allListings = await database.select().from(wasteListings);

  /* =========================================================
     FILTER (TEMP SAFE — UNTIL SCHEMA IS FIXED)
  ========================================================= */

  const assignedListings = allListings.filter(
    (l: any) =>
      l.winningOrganisationId === orgId ||
      l.assignedCarrierOrganisationId === orgId,
  );

  const status = searchParams.status || "";

  let filtered = assignedListings;

  if (status === "in-progress") {
    filtered = assignedListings.filter((l: any) => l.status !== "completed");
  }

  if (status === "completed") {
    filtered = assignedListings.filter((l: any) => l.status === "completed");
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-10 flex flex-col gap-10">
      {/* HEADER */}
      <div className="">
        <h1 className="text-2xl font-semibold">Assigned Jobs</h1>
        <p className="text-sm text-gray-500">
          Jobs assigned to your organisation
        </p>
      </div>

      {/* GRID */}
      <div className=" grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {filtered.length === 0 && (
          <div className="text-gray-500 text-sm">No assigned jobs found.</div>
        )}

        {filtered.map((listing: any) => (
          <div
            key={listing.id}
            className="border border-gray-200 rounded-xl p-5 hover:shadow-md transition"
          >
            {/* TITLE */}
            <h2 className="text-lg font-semibold">{listing.name}</h2>

            {/* LOCATION */}
            <p className="text-sm text-gray-500">{listing.location}</p>

            {/* STATUS */}
            <div className="mt-3">
              <span className="text-xs px-2 py-1 rounded bg-gray-100">
                {listing.status || "unknown"}
              </span>
            </div>

            {/* PRICE */}
            <p className="mt-3 text-sm">
              £{listing.currentBid ?? listing.startingPrice}
            </p>

            {/* ACTION */}
            <div className="mt-4">
              <a
                href={`/home/marketplace/assigned/${listing.id}`}
                className="text-sm text-blue-600 hover:underline"
              >
                View Job →
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
