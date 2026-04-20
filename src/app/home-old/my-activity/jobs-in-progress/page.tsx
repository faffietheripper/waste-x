import { auth } from "@/auth";
import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import ListingCard from "@/components/ListingCard";
import { EmptyState } from "./emptyState";
import { and, eq } from "drizzle-orm";

export default async function AssignedListings() {
  const session = await auth();

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  // Fetch only assigned listings owned by logged-in user
  const assignedListings = await database.query.wasteListings.findMany({
    where: and(
      eq(wasteListings.userId, session.user.id),
      eq(wasteListings.assigned, true),
    ),
  });

  const hasAssignedListings = assignedListings.length > 0;

  return (
    <main>
      <h1 className="font-bold pb-10">Manage Assigned Listings</h1>

      {hasAssignedListings ? (
        <div className="grid grid-cols-3 gap-8">
          {assignedListings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyState />
      )}
    </main>
  );
}
