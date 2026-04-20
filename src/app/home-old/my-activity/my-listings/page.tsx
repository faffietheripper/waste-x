import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import { EmptyState } from "./emptyState";
import { and, eq } from "drizzle-orm";

export default async function MyListings() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const activeListings = await database.query.wasteListings.findMany({
    where: and(
      eq(wasteListings.userId, session.user.id),
      eq(wasteListings.archived, false),
    ),
  });

  const hasListings = activeListings.length > 0;

  return (
    <main>
      <h1 className="font-bold pb-10 pt-4">Manage Active Listings</h1>

      {hasListings ? (
        <div className="grid grid-cols-3 gap-8">
          {activeListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}
