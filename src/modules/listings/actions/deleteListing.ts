import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function deleteListing({
  listingId,
  userId,
}: {
  listingId: number;
  userId: string;
}) {
  const result = await database
    .delete(wasteListings)
    .where(
      and(eq(wasteListings.id, listingId), eq(wasteListings.userId, userId)),
    );

  return { success: true };
}
