import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import { EmptyState } from "./emptyState";
import { and, eq } from "drizzle-orm";

export default async function ArchivedListings() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Fetch only archived listings belonging to logged-in user
  const archivedListings = await database.query.wasteListings.findMany({
    where: and(
      eq(wasteListings.userId, session.user.id),
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
