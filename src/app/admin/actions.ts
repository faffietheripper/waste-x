"use server";

import { database } from "@/db/database";
import {
  organisations,
  users,
  wasteListings,
  incidents,
  bids,
  carrierAssignments,
  reviews,
  auditEvents,
} from "@/db/schema";
import { count, eq, gte, sql, desc } from "drizzle-orm";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";

export async function getPlatformDashboardStats() {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [
    orgCount,
    userCount,
    activeListings,
    openIncidents,
    listingsThisMonth,
    bidsThisMonth,
    pendingAssignments,
    acceptedAssignments,
    completedAssignments,
    underReviewIncidents,
    suspendedUsers,
    archivedListings,
    avgRatingResult,
    reviewsThisWeek,
  ] = await Promise.all([
    database.select({ value: count() }).from(organisations),
    database.select({ value: count() }).from(users),
    database
      .select({ value: count() })
      .from(wasteListings)
      .where(eq(wasteListings.archived, false)),
    database
      .select({ value: count() })
      .from(incidents)
      .where(eq(incidents.status, "open")),
    database
      .select({ value: count() })
      .from(wasteListings)
      .where(gte(wasteListings.createdAt, startOfMonth)),
    database
      .select({ value: count() })
      .from(bids)
      .where(gte(bids.timestamp, startOfMonth)),
    database
      .select({ value: count() })
      .from(carrierAssignments)
      .where(eq(carrierAssignments.status, "pending")),
    database
      .select({ value: count() })
      .from(carrierAssignments)
      .where(eq(carrierAssignments.status, "accepted")),
    database
      .select({ value: count() })
      .from(carrierAssignments)
      .where(eq(carrierAssignments.status, "completed")),
    database
      .select({ value: count() })
      .from(incidents)
      .where(eq(incidents.status, "under_review")),
    database
      .select({ value: count() })
      .from(users)
      .where(eq(users.isSuspended, true)),
    database
      .select({ value: count() })
      .from(wasteListings)
      .where(eq(wasteListings.archived, true)),
    database
      .select({ value: sql<number>`avg(${reviews.rating})` })
      .from(reviews),
    database
      .select({ value: count() })
      .from(reviews)
      .where(gte(reviews.createdAt, startOfWeek)),
  ]);

  const listingsMonthCount = listingsThisMonth[0]?.value ?? 0;
  const bidsMonthCount = bidsThisMonth[0]?.value ?? 0;

  return {
    totals: {
      organisations: orgCount[0]?.value ?? 0,
      users: userCount[0]?.value ?? 0,
      activeListings: activeListings[0]?.value ?? 0,
      openIncidents: openIncidents[0]?.value ?? 0,
    },
    marketplace: {
      listingsThisMonth: listingsMonthCount,
      bidsThisMonth: bidsMonthCount,
      avgBidsPerListing:
        listingsMonthCount === 0 ? 0 : bidsMonthCount / listingsMonthCount,
      assignments: {
        pending: pendingAssignments[0]?.value ?? 0,
        accepted: acceptedAssignments[0]?.value ?? 0,
        completed: completedAssignments[0]?.value ?? 0,
      },
    },
    risk: {
      underReview: underReviewIncidents[0]?.value ?? 0,
      suspendedUsers: suspendedUsers[0]?.value ?? 0,
      archivedListings: archivedListings[0]?.value ?? 0,
    },
    reviews: {
      averageRating: avgRatingResult[0]?.value ?? 0,
      reviewsThisWeek: reviewsThisWeek[0]?.value ?? 0,
    },
  };
}

export async function getRecentAuditEvents() {
  await requirePlatformAdmin();

  return database
    .select()
    .from(auditEvents)
    .orderBy(desc(auditEvents.createdAt))
    .limit(100);
}
