import { auth } from "@/auth";
import { database } from "@/db/database";
import { bids } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type BidStatus = "active" | "accepted" | "rejected" | "withdrawn";

type FilterStatus = "active" | "won" | "lost" | "withdrawn" | "all";

/* =========================================================
   FORMATTERS
========================================================= */

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMode(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getBidStatusLabel(status: BidStatus | string | null | undefined) {
  switch (status) {
    case "active":
      return "Active";
    case "accepted":
      return "Won";
    case "rejected":
      return "Lost";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Unknown";
  }
}

function getBidStatusClass(status: BidStatus | string | null | undefined) {
  switch (status) {
    case "active":
      return "border-orange-300 bg-orange-100 text-orange-700";
    case "accepted":
      return "border-green-300 bg-green-100 text-green-700";
    case "rejected":
      return "border-red-300 bg-red-100 text-red-700";
    case "withdrawn":
      return "border-gray-300 bg-gray-100 text-gray-700";
    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getListingStatusClass(status: string | null | undefined) {
  switch (status) {
    case "open":
      return "border-green-300 bg-green-100 text-green-700";
    case "assigned":
      return "border-orange-300 bg-orange-100 text-orange-700";
    case "in_progress":
      return "border-blue-300 bg-blue-100 text-blue-700";
    case "completed":
      return "border-black bg-black text-white";
    case "cancelled":
      return "border-red-300 bg-red-100 text-red-700";
    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getWorkflowMessage(bid: any) {
  const listing = bid.listing;

  if (bid.status === "accepted") {
    return "This bid was accepted. The listing has moved into the assignment workflow and is waiting for operational progression.";
  }

  if (bid.status === "rejected") {
    return "This bid was not selected. Another organisation was assigned or the listing moved forward without this bid.";
  }

  if (bid.status === "withdrawn") {
    return "This bid was withdrawn and is no longer active.";
  }

  if (bid.status === "active" && listing?.status === "open") {
    return "This bid is still active while the listing remains open.";
  }

  if (bid.status === "active" && listing?.status === "assigned") {
    return "This listing has been assigned. If this bid was not marked accepted, it may need status cleanup.";
  }

  if (listing?.status === "completed") {
    return "The linked listing has completed its operational workflow.";
  }

  return "Bid record is available for review.";
}

/* =========================================================
   PAGE
========================================================= */

export default async function MyBidsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-8 text-sm text-red-700">
          Unauthorized. You must belong to an organisation to view bids.
        </div>
      </main>
    );
  }

  const orgId = session.user.organisationId;
  const status = (searchParams?.status || "active") as FilterStatus;

  /* =========================================================
     FETCH BIDS

     Current schema truth:
     - bids.status = active / accepted / rejected / withdrawn
     - wasteListings.winnerBidId identifies winning bid on listing
     - wasteListings.status tracks listing lifecycle

     Old fields like listing.winningOrganisationId and bid.cancelledJob
     are not in your current schema, so this page does not rely on them.
  ========================================================= */

  const allBids = await database.query.bids.findMany({
    where: eq(bids.organisationId, orgId),
    with: {
      listing: true,
    },
    orderBy: desc(bids.timestamp),
  });

  /* =========================================================
     FILTER LOGIC
  ========================================================= */

  let filtered = allBids as any[];

  if (status === "active") {
    filtered = allBids.filter((bid: any) => bid.status === "active");
  }

  if (status === "won") {
    filtered = allBids.filter((bid: any) => bid.status === "accepted");
  }

  if (status === "lost") {
    filtered = allBids.filter((bid: any) => bid.status === "rejected");
  }

  if (status === "withdrawn") {
    filtered = allBids.filter((bid: any) => bid.status === "withdrawn");
  }

  if (status === "all") {
    filtered = allBids as any[];
  }

  /* =========================================================
     METRICS
  ========================================================= */

  const metrics = {
    total: allBids.length,
    active: allBids.filter((bid: any) => bid.status === "active").length,
    won: allBids.filter((bid: any) => bid.status === "accepted").length,
    lost: allBids.filter((bid: any) => bid.status === "rejected").length,
    withdrawn: allBids.filter((bid: any) => bid.status === "withdrawn").length,
  };

  const totalBidValue = allBids.reduce(
    (sum: number, bid: any) => sum + (bid.amount ?? 0),
    0,
  );

  const activeBidValue = allBids
    .filter((bid: any) => bid.status === "active")
    .reduce((sum: number, bid: any) => sum + (bid.amount ?? 0), 0);

  const wonBidValue = allBids
    .filter((bid: any) => bid.status === "accepted")
    .reduce((sum: number, bid: any) => sum + (bid.amount ?? 0), 0);

  /* =========================================================
     UI
  ========================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Marketplace
              </p>

              <h1 className="mt-3 text-3xl font-semibold">My Bids</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Track bids placed by your organisation across marketplace
                listings. Accepted bids move into the manager-led assignment
                workflow, while rejected and withdrawn bids remain available for
                audit and commercial history.
              </p>
            </div>

            <Link
              href="/home/marketplace/browse"
              className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              Browse Listings →
            </Link>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
              Active filter: {formatMode(status)}
            </span>

            <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
              Showing {filtered.length} bid{filtered.length === 1 ? "" : "s"}
            </span>
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-5">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard label="Active" value={metrics.active} />
          <MetricCard label="Won" value={metrics.won} />
          <MetricCard label="Lost" value={metrics.lost} />
          <MetricCard label="Withdrawn" value={metrics.withdrawn} />
        </section>

        {/* VALUE SNAPSHOT */}
        <section className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <ValueCard
            label="Total Bid Value"
            value={formatCurrency(totalBidValue)}
            text="Total value of all bids placed by your organisation."
          />

          <ValueCard
            label="Active Bid Value"
            value={formatCurrency(activeBidValue)}
            text="Value currently exposed in open marketplace bids."
          />

          <ValueCard
            label="Won Bid Value"
            value={formatCurrency(wonBidValue)}
            text="Value of accepted bids that moved into assignment workflow."
          />
        </section>

        {/* FILTERS */}
        <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <FilterLink
              href="/home/marketplace/bids"
              active={status === "active"}
            >
              Active
            </FilterLink>

            <FilterLink
              href="/home/marketplace/bids?status=won"
              active={status === "won"}
            >
              Won
            </FilterLink>

            <FilterLink
              href="/home/marketplace/bids?status=lost"
              active={status === "lost"}
            >
              Lost
            </FilterLink>

            <FilterLink
              href="/home/marketplace/bids?status=withdrawn"
              active={status === "withdrawn"}
            >
              Withdrawn
            </FilterLink>

            <FilterLink
              href="/home/marketplace/bids?status=all"
              active={status === "all"}
            >
              All
            </FilterLink>
          </div>
        </section>

        {/* BID GRID */}
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Bid Records
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-black">
                Organisation Bids
              </h2>
              <p className="mt-2 text-sm text-black/45">
                Showing {filtered.length} bid
                {filtered.length === 1 ? "" : "s"} for the selected filter.
              </p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              title="No bids found"
              text="There are no bid records matching this filter for your organisation."
            />
          ) : (
            <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
              {filtered.map((bid: any) => (
                <BidCard key={bid.id} bid={bid} orgId={orgId} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   BID CARD
========================================================= */

function BidCard({ bid, orgId }: { bid: any; orgId: string }) {
  const listing = bid.listing;
  const workflowMessage = getWorkflowMessage(bid);

  const isWinningBid =
    bid.status === "accepted" ||
    (listing?.winnerBidId && listing.winnerBidId === bid.id);

  const listingHref = listing?.id
    ? `/home/marketplace/browse/${listing.id}`
    : "/home/marketplace/bids";

  return (
    <article className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
            Bid Record
          </p>

          <h3 className="mt-3 line-clamp-2 text-lg font-semibold text-black">
            {listing?.name || "Unknown Listing"}
          </h3>

          <p className="mt-2 text-sm text-black/50">
            {listing?.location || "Unknown location"}
          </p>
        </div>

        <span
          className={`shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${getBidStatusClass(
            bid.status,
          )}`}
        >
          {getBidStatusLabel(bid.status)}
        </span>
      </div>

      <div className="mt-5 rounded-2xl border border-orange-100 bg-orange-50 p-4 text-sm leading-6 text-orange-800">
        {workflowMessage}
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <MiniStat label="Your Bid" value={formatCurrency(bid.amount)} />

        <MiniStat label="Bid Placed" value={formatDate(bid.timestamp)} />

        <MiniStat
          label="Listing Status"
          value={formatMode(listing?.status)}
          badgeClass={getListingStatusClass(listing?.status)}
        />

        <MiniStat
          label="Winner Bid"
          value={
            listing?.winnerBidId
              ? listing.winnerBidId === bid.id
                ? "This bid"
                : `#${listing.winnerBidId}`
              : "Not selected"
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3">
        <WideDetail label="Bid ID" value={String(bid.id)} />
        <WideDetail label="Organisation ID" value={orgId} />
      </div>

      {isWinningBid && (
        <div className="mt-5 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm font-medium text-green-700">
          This bid was selected and should now be represented in the assignment
          workflow.
        </div>
      )}

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/5 pt-5">
        <span className="text-xs text-black/35">
          Listing ID: {listing?.id ?? "Unknown"}
        </span>

        <Link
          href={listingHref}
          className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
        >
          View Listing →
        </Link>
      </div>
    </article>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs uppercase tracking-widest text-black/40">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function ValueCard({
  label,
  value,
  text,
}: {
  label: string;
  value: string;
  text: string;
}) {
  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold text-black">{value}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-black text-orange-400"
          : "bg-[#fbfaf7] text-black/55 hover:bg-orange-100 hover:text-orange-700"
      }`}
    >
      {children}
    </Link>
  );
}

function MiniStat({
  label,
  value,
  badgeClass,
}: {
  label: string;
  value: string;
  badgeClass?: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>

      {badgeClass ? (
        <span
          className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${badgeClass}`}
        >
          {value}
        </span>
      ) : (
        <p className="mt-2 truncate text-sm font-semibold text-black">
          {value}
        </p>
      )}
    </div>
  );
}

function WideDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] uppercase tracking-widest text-black/35">
        {label}
      </p>
      <p className="mt-2 break-all font-mono text-xs font-medium text-black">
        {value}
      </p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
      <p className="text-base font-semibold text-black">{title}</p>
      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>
    </div>
  );
}
