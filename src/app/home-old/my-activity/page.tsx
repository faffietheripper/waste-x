import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  users,
  bids,
  carrierAssignments,
  reviews,
  wasteListings,
  notifications,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

export default async function MyActivityPage() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("Unauthorized");

  const userId = session.user.id;

  /* ===============================
     USER
  ============================== */

  const user = await database.query.users.findFirst({
    where: eq(users.id, userId),
  });

  if (!user) throw new Error("User not found");

  /* ===============================
     DATA (REAL + CORRECT)
  ============================== */

  // MY BIDS
  const myBids = await database.query.bids.findMany({
    where: eq(bids.userId, userId),
  });

  // MY LISTINGS (for generators / managers)
  const myListings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.userId, userId),
  });

  // ORG ASSIGNMENTS (user operates within org)
  const orgAssignments = user.organisationId
    ? await database.query.carrierAssignments.findMany({
        where: eq(carrierAssignments.organisationId, user.organisationId),
      })
    : [];

  // COMPLETED / ACTIVE SPLIT
  const completedJobs = orgAssignments.filter((a) => a.status === "completed");

  const activeJobs = orgAssignments.filter(
    (a) => a.status === "pending" || a.status === "accepted",
  );

  // MY REVIEWS
  const myReviews = await database.query.reviews.findMany({
    where: eq(reviews.reviewerId, userId),
  });

  // MY NOTIFICATIONS (activity signal)
  const myNotifications = await database.query.notifications.findMany({
    where: eq(notifications.recipientId, userId),
  });

  /* ===============================
     RECENT ITEMS
  ============================== */

  const recentBids = myBids.slice(0, 3);
  const recentAssignments = orgAssignments.slice(0, 3);
  const recentListings = myListings.slice(0, 3);
  const recentReviews = myReviews.slice(0, 3);

  /* ===============================
     UI
  ============================== */

  return (
    <div className="pt-6 space-y-10">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-2">My Activity</h1>
        <p className="text-sm opacity-80">
          Personal operational overview across Waste X
        </p>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card
          title="My Listings"
          value={myListings.length}
          href="/home/my-activity/my-listings"
        />
        <Card
          title="My Bids"
          value={myBids.length}
          href="/home/my-activity/my-bids"
        />
        <Card
          title="Active Jobs"
          value={activeJobs.length}
          href="/home/my-activity/assigned-jobs"
        />
        <Card
          title="Completed Jobs"
          value={completedJobs.length}
          href="/home/my-activity/completed-jobs"
        />
        <Card
          title="Reviews"
          value={myReviews.length}
          href="/home/my-activity/reviews"
        />
      </div>

      {/* MAIN GRID */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* LISTINGS */}
        <Section
          title="Recent Listings"
          href="/home/my-activity/my-listings"
          items={recentListings.map((l) => ({
            title: l.name,
            subtitle: l.location,
          }))}
        />

        {/* BIDS */}
        <Section
          title="Recent Bids"
          href="/home/my-activity/my-bids"
          items={recentBids.map((b) => ({
            title: `Listing #${b.listingId}`,
            subtitle: `£${b.amount}`,
          }))}
        />

        {/* ASSIGNMENTS */}
        <Section
          title="Recent Jobs"
          href="/home/my-activity/assigned-jobs"
          items={recentAssignments.map((a) => ({
            title: `Job #${a.listingId}`,
            subtitle: a.status,
          }))}
        />

        {/* REVIEWS */}
        <Section
          title="Recent Reviews"
          href="/home/my-activity/reviews"
          items={recentReviews.map((r) => ({
            title: `Rating: ${r.rating}`,
            subtitle: r.comment ?? "No comment",
          }))}
        />
      </div>

      {/* ACTIVITY SIGNAL (notifications) */}
      <div className="bg-white p-6 rounded-2xl shadow-sm border">
        <h2 className="text-lg font-semibold mb-4">Recent Notifications</h2>

        {myNotifications.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {myNotifications.slice(0, 5).map((n) => (
              <div
                key={n.id}
                className={`p-3 rounded-md border ${
                  n.isRead ? "bg-gray-50" : "bg-blue-50 border-blue-200"
                }`}
              >
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-gray-500">{n.message}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FOOTER */}
      <div className="bg-gray-50 p-4 rounded-xl border text-xs text-gray-500 text-center">
        Personal Activity Stream · Waste X
      </div>
    </div>
  );
}

/* ================= COMPONENTS ================= */

function Card({
  title,
  value,
  href,
}: {
  title: string;
  value: number;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="bg-white p-6 rounded-2xl shadow-sm border hover:shadow-md transition text-center"
    >
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-bold mt-2">{value}</div>
    </Link>
  );
}

function Section({
  title,
  href,
  items,
}: {
  title: string;
  href: string;
  items: { title: string; subtitle: string }[];
}) {
  return (
    <Link href={href} className="block">
      <div className="bg-white p-6 rounded-2xl shadow-sm border hover:shadow-md transition">
        <h2 className="text-lg font-semibold mb-4">{title}</h2>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => (
              <div key={i} className="border-b pb-2">
                <p className="text-sm font-medium">{item.title}</p>
                <p className="text-xs text-gray-500">{item.subtitle}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
