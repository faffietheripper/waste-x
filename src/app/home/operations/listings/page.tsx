import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

/* =========================================================
   STATUS MAPPING
========================================================= */

function mapStatusFilter(status: string) {
  switch (status) {
    case "active":
      return eq(wasteListings.status, "open");

    case "assigned":
      return eq(wasteListings.status, "assigned");

    case "completed":
      return eq(wasteListings.status, "completed");

    case "archived":
      return eq(wasteListings.archived, true);

    default:
      return undefined;
  }
}

/* =========================================================
   PAGE
========================================================= */

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const status = searchParams.status || "all";

  const filters = [
    eq(wasteListings.organisationId, session.user.organisationId),
  ];

  const statusFilter = mapStatusFilter(status);

  if (statusFilter) {
    filters.push(statusFilter);
  }

  const listings = await database.query.wasteListings.findMany({
    where: and(...filters),
    orderBy: (listings, { desc }) => [desc(listings.createdAt)],
  });

  return (
    <div className="p-10 flex flex-col gap-8">
      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Waste Listings</h1>

        <Link
          href="/home/operations/listings/create"
          className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm"
        >
          + Create Listing
        </Link>
      </div>

      {/* LIST */}
      <div className="flex flex-col gap-4">
        {listings.length === 0 && (
          <div className="text-gray-500 text-sm">No listings found.</div>
        )}

        {listings.map((listing) => (
          <div
            key={listing.id}
            className="border border-gray-200 rounded-md p-5 flex justify-between items-center"
          >
            <div>
              <h2 className="font-medium">{listing.name}</h2>
              <p className="text-sm text-gray-500">{listing.location}</p>
            </div>

            <div className="text-sm text-gray-400">{listing.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
