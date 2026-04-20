import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import { EmptyState } from "./emptyState";
import { eq } from "drizzle-orm";

export default async function TeamListings() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    throw new Error("Unauthorized");
  }

  // Fetch all listings owned by this organisation
  const orgListings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, session.user.organisationId),
  });

  const hasListings = orgListings.length > 0;

  return (
    <main>
      <h1 className="font-bold pb-10 pt-4">Manage Active Listings</h1>

      {hasListings ? (
        <div className="grid grid-cols-3 gap-8">
          {orgListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}
