import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import { EmptyState } from "./emptyState";
import { and, eq } from "drizzle-orm";

export default async function TeamArchivedListings() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  // Fetch archived listings for this organisation
  const archivedListings = await database.query.wasteListings.findMany({
    where: and(
      eq(wasteListings.organisationId, session.user.organisationId),
      eq(wasteListings.archived, true),
    ),
  });

  const hasArchivedListings = archivedListings.length > 0;

  return (
    <main>
      <h1 className="font-bold pb-10">Manage Archived Listings</h1>

      {hasArchivedListings ? (
        <div className="grid grid-cols-3 gap-8">
          {archivedListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}
