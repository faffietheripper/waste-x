import { database } from "@/db/database";
import { auditEvents, users, organisations, wasteListings } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import ChainTimeline from "./ChainTimeline";

export default async function ChainPage({
  params,
}: {
  params: { listingId: string };
}) {
  const listingId = Number(params.listingId);

  // 📦 Listing info
  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
  });

  if (!listing) {
    return <div>Listing not found</div>;
  }

  // 🔗 Audit events for this listing
  const events = await database
    .select({
      id: auditEvents.id,
      action: auditEvents.action,
      createdAt: auditEvents.createdAt,

      userName: users.name,
      organisationName: organisations.teamName,
    })
    .from(auditEvents)
    .leftJoin(users, eq(auditEvents.userId, users.id))
    .leftJoin(organisations, eq(auditEvents.organisationId, organisations.id))
    .where(eq(auditEvents.entityId, String(listingId)))
    .orderBy(asc(auditEvents.createdAt));

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">Chain of Custody</h1>
        <p className="text-sm text-gray-500">
          Listing #{listing.id} — {listing.name}
        </p>
      </div>

      <ChainTimeline events={events} />
    </div>
  );
}
