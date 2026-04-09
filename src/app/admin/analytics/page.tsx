import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { getPlatformAnalytics } from "./actions";
import Link from "next/link";

import { ListingsOverTimeChart, CompletionFunnelChart } from "./Charts";

export default async function AdminAnalyticsPage() {
  await requirePlatformAdmin();

  const data = await getPlatformAnalytics();

  const conversionRate =
    data.marketplace.listings > 0
      ? Math.round((data.logistics.completed / data.marketplace.listings) * 100)
      : 0;

  const listingsOverTime = data.charts.listingsOverTime;

  const funnelData = [
    { stage: "Created", value: data.marketplace.listings },
    { stage: "Assigned", value: data.logistics.assigned },
    { stage: "Completed", value: data.logistics.completed },
  ];

  return (
    <div className="space-y-10">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-bold">Platform Analytics</h1>
        <p className="text-sm text-gray-500">
          Business intelligence & performance metrics
        </p>
      </div>

      {/* CHARTS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ListingsOverTimeChart data={listingsOverTime} />
        <CompletionFunnelChart data={funnelData} />
      </div>

      {/* GROWTH */}
      <Section title="Growth">
        <Kpi label="Organisations" value={data.growth.organisations} />
        <Kpi label="Users" value={data.growth.users} />
        <Kpi label="Active Orgs" value={data.growth.activeOrgs} />
        <LinkCard href="/admin/organisations" label="View Organisations" />
      </Section>

      {/* MARKETPLACE */}
      <Section title="Marketplace">
        <Kpi label="Total Listings" value={data.marketplace.listings} />
        <Kpi label="Total Bids" value={data.marketplace.bids} />
        <Kpi
          label="Marketplace Value"
          value={`£${data.marketplace.totalValue}`}
        />
        <Kpi label="Avg Bids / Listing" value={data.marketplace.avgBids} />
        <LinkCard href="/admin/listings" label="Listing Insights" />
      </Section>

      {/* FUNNEL */}
      <Section title="Lifecycle Funnel">
        <Kpi label="Created" value={data.marketplace.listings} />
        <Kpi label="Assigned" value={data.logistics.assigned} />
        <Kpi label="Completed" value={data.logistics.completed} />
        <Kpi label="Conversion Rate" value={`${conversionRate}%`} />
      </Section>

      {/* LOGISTICS */}
      <Section title="Logistics">
        <Kpi label="Assignments" value={data.logistics.assignments} />
        <Kpi label="Completed Jobs" value={data.logistics.completed} />
        <Kpi label="Completion Rate" value={`${conversionRate}%`} />
        <LinkCard href="/admin/incidents" label="Operational Risk" />
      </Section>

      {/* TRUST */}
      <Section title="Trust & Reputation">
        <Kpi
          label="Average Rating"
          value={Number(data.trust.avgRating).toFixed(2)}
        />
        <Kpi label="Total Reviews" value={data.trust.totalReviews} />
        <LinkCard href="/admin/reviews" label="Review Monitoring" />
      </Section>

      {/* RISK */}
      <Section title="Risk">
        <Kpi label="Open Incidents" value={data.risk.openIncidents} />
        <Kpi label="Resolved Incidents" value={data.risk.resolvedIncidents} />
        <LinkCard href="/admin/incidents" label="Incident Management" />
      </Section>

      {/* SYSTEM */}
      <Section title="System Activity">
        <Kpi label="Events (24h)" value={data.system.events24h} />
        <Kpi label="Active Users (24h)" value={data.system.activeUsers24h} />
        <LinkCard href="/admin/audit/live" label="View Live Activity" />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white p-6 rounded-lg shadow space-y-4">
      <h2 className="font-semibold">{title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">{children}</div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: any }) {
  return (
    <div>
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}

function LinkCard({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="block p-4 border rounded hover:bg-gray-50 text-sm"
    >
      {label}
    </Link>
  );
}
