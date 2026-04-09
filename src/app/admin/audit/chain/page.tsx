import Link from "next/link";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { desc } from "drizzle-orm";

export default async function ChainIndexPage() {
  const listings = await database
    .select()
    .from(wasteListings)
    .orderBy(desc(wasteListings.createdAt))
    .limit(20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Chain of Custody</h1>
        <p className="text-sm text-gray-500">
          Select a listing to view its full audit trail
        </p>
      </div>

      <div className="bg-white border rounded-lg divide-y">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/admin/audit/chain/${listing.id}`}
            className="block px-6 py-4 hover:bg-gray-50 transition"
          >
            <div className="text-sm font-medium text-gray-900">
              {listing.name}
            </div>
            <div className="text-xs text-gray-500">
              ID: {listing.id} • {listing.location}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
