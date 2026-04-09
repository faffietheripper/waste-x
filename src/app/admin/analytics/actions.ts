"use server";

import { database } from "@/db/database";
import {
  organisations,
  users,
  wasteListings,
  bids,
  carrierAssignments,
  incidents,
  reviews,
  auditEvents,
} from "@/db/schema";

export async function getPlatformAnalytics() {
  const [
    orgs,
    allUsers,
    listings,
    bidsData,
    assignments,
    incidentsData,
    reviewsData,
    events,
  ] = await Promise.all([
    database.select().from(organisations),
    database.select().from(users),
    database.select().from(wasteListings),
    database.select().from(bids),
    database.select().from(carrierAssignments),
    database.select().from(incidents),
    database.select().from(reviews),
    database.select().from(auditEvents),
  ]);

  // =========================
  // 🟢 GROWTH
  // =========================
  const activeOrgs = new Set(listings.map((l) => l.organisationId)).size;

  // =========================
  // 🟢 MARKETPLACE
  // =========================
  const totalValue = bidsData.reduce((sum, b) => sum + b.amount, 0);

  const avgBids = listings.length > 0 ? bidsData.length / listings.length : 0;

  // =========================
  // 🟢 LOGISTICS
  // =========================
  const assigned = listings.filter((l) => l.status === "assigned").length;

  const completed = listings.filter((l) => l.status === "completed").length;

  // =========================
  // 🟢 TRUST
  // =========================
  const avgRating =
    reviewsData.length > 0
      ? reviewsData.reduce((sum, r) => sum + r.rating, 0) / reviewsData.length
      : 0;

  // =========================
  // 🟢 RISK
  // =========================
  const openIncidents = incidentsData.filter(
    (i) => i.status !== "resolved",
  ).length;

  const resolvedIncidents = incidentsData.filter(
    (i) => i.status === "resolved",
  ).length;

  // =========================
  // 🟢 SYSTEM (24H WINDOW)
  // =========================
  const now = new Date();
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const isLast24h = (date: unknown) => {
    if (!date) return false;
    const d = new Date(date as string | number | Date);
    return d >= last24h;
  };

  const events24h = events.filter((e) => isLast24h(e.createdAt)).length;

  const activeUsers24h = new Set(
    events
      .filter((e) => isLast24h(e.createdAt))
      .map((e) => e.userId)
      .filter(Boolean),
  ).size;

  // =========================
  // 📈 LISTINGS OVER TIME (LAST 7 DAYS)
  // =========================

  const days = 7;

  const last7Days = Array.from({ length: days }).map((_, i) => {
    const d = new Date();
    d.setDate(now.getDate() - (days - 1 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const listingsOverTime = last7Days.map((day) => {
    const nextDay = new Date(day);
    nextDay.setDate(day.getDate() + 1);

    const count = listings.filter((l) => {
      if (!l.createdAt) return false;
      const created = new Date(l.createdAt as any);
      return created >= day && created < nextDay;
    }).length;

    return {
      date: day.toLocaleDateString("en-GB", { weekday: "short" }),
      listings: count,
    };
  });

  // =========================
  // 🧾 RETURN
  // =========================
  return {
    growth: {
      organisations: orgs.length,
      users: allUsers.length,
      activeOrgs,
    },

    marketplace: {
      listings: listings.length,
      bids: bidsData.length,
      totalValue,
      avgBids: Number(avgBids.toFixed(1)),
    },

    logistics: {
      assignments: assignments.length,
      assigned,
      completed,
    },

    trust: {
      avgRating,
      totalReviews: reviewsData.length,
    },

    risk: {
      openIncidents,
      resolvedIncidents,
    },

    system: {
      events24h,
      activeUsers24h,
    },
    charts: {
      listingsOverTime,
    },
  };
}
