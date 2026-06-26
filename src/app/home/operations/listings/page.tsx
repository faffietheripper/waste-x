import { database } from "@/db/database";
import { wasteListings } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";

import { requireOperationalPermission } from "@/modules/auth/core/requireOperationalPermission";
import { hasOperationalPermission } from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type StatusFilter =
  | "all"
  | "active"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled"
  | "archived";

/* =========================================================
   STATUS MAPPING
========================================================= */

function mapStatusFilter(status: string) {
  switch (status) {
    case "active":
      return eq(wasteListings.status, "open");

    case "assigned":
      return eq(wasteListings.status, "assigned");

    case "in_progress":
      return eq(wasteListings.status, "in_progress");

    case "completed":
      return eq(wasteListings.status, "completed");

    case "cancelled":
      return eq(wasteListings.status, "cancelled");

    case "archived":
      return eq(wasteListings.archived, true);

    default:
      return undefined;
  }
}

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not set";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCurrency(value: number | null | undefined) {
  if (value === null || value === undefined) return "£0";

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMode(value: string | null | undefined) {
  if (!value) return "Not set";

  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "open":
      return "Open";
    case "assigned":
      return "Assigned";
    case "in_progress":
      return "In Progress";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Unknown";
  }
}

function getStatusClass(status: string | null | undefined) {
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

/* =========================================================
   PAGE
========================================================= */

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { status?: string };
}) {
  /* =========================================================
     PAGE PERMISSION GUARD

     Only departments with listing:view can access this page.

     Under the updated matrix:
     - generator can access
     - manager cannot access
     - carrier cannot access
     - compliance cannot access
  ========================================================= */

  const context = await requireOperationalPermission("listing:view");

  const organisationId = context.user.organisationId!;

  const canCreateListings = hasOperationalPermission({
    capabilities: context.capabilities,
    departmentType: context.departmentType,
    permission: "listing:create",
  });

  const status = (searchParams.status || "all") as StatusFilter;

  const filters = [eq(wasteListings.organisationId, organisationId)];

  const statusFilter = mapStatusFilter(status);

  if (statusFilter) {
    filters.push(statusFilter);
  }

  const listings = await database.query.wasteListings.findMany({
    where: and(...filters),
    orderBy: (listings, { desc }) => [desc(listings.createdAt)],
  });

  const allOrgListings = await database.query.wasteListings.findMany({
    where: eq(wasteListings.organisationId, organisationId),
  });

  const metrics = {
    total: allOrgListings.length,
    open: allOrgListings.filter((listing) => listing.status === "open").length,
    assigned: allOrgListings.filter((listing) => listing.status === "assigned")
      .length,
    inProgress: allOrgListings.filter(
      (listing) => listing.status === "in_progress",
    ).length,
    completed: allOrgListings.filter(
      (listing) => listing.status === "completed",
    ).length,
    archived: allOrgListings.filter((listing) => listing.archived).length,
  };

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-10 py-32">
      <div className="space-y-8">
        {/* HEADER */}
        <section className="rounded-3xl border border-black/10 bg-black p-8 text-white shadow-sm">
          <div className="flex items-start justify-between gap-8">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
                Waste X Operations
              </p>

              <h1 className="mt-3 text-3xl font-semibold">Waste Listings</h1>

              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Manage waste listings created by your organisation. This area is
                restricted to generator departments because waste listing
                creation is a generator-side responsibility.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <span className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white/70">
                  Department: {context.department.name}
                </span>

                <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-2 text-xs font-medium text-orange-300">
                  Current filter: {formatMode(status)}
                </span>
              </div>
            </div>

            {canCreateListings && (
              <Link
                href="/home/operations/listings/create"
                className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + Create Listing
              </Link>
            )}
          </div>
        </section>

        {/* METRICS */}
        <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-6">
          <MetricCard label="Total" value={metrics.total} />
          <MetricCard label="Open" value={metrics.open} />
          <MetricCard label="Assigned" value={metrics.assigned} />
          <MetricCard label="In Progress" value={metrics.inProgress} />
          <MetricCard label="Completed" value={metrics.completed} />
          <MetricCard label="Archived" value={metrics.archived} />
        </section>

        {/* FILTERS */}
        <section className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center gap-3">
            <FilterLink
              href="/home/operations/listings"
              active={status === "all"}
            >
              All
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=active"
              active={status === "active"}
            >
              Open
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=assigned"
              active={status === "assigned"}
            >
              Assigned
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=in_progress"
              active={status === "in_progress"}
            >
              In Progress
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=completed"
              active={status === "completed"}
            >
              Completed
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=cancelled"
              active={status === "cancelled"}
            >
              Cancelled
            </FilterLink>

            <FilterLink
              href="/home/operations/listings?status=archived"
              active={status === "archived"}
            >
              Archived
            </FilterLink>
          </div>
        </section>

        {/* LISTINGS */}
        <section className="space-y-4">
          {listings.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-black/20 bg-white p-10 text-center shadow-sm">
              <p className="text-sm font-medium text-black">
                No listings found.
              </p>
              <p className="mt-2 text-sm text-black/45">
                There are no waste listings matching this filter.
              </p>

              {canCreateListings && (
                <Link
                  href="/home/operations/listings/create"
                  className="mt-6 inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
                >
                  Create your first listing →
                </Link>
              )}
            </div>
          ) : (
            listings.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   LISTING CARD
========================================================= */

function ListingCard({
  listing,
}: {
  listing: typeof wasteListings.$inferSelect;
}) {
  const isAssigned = Boolean(
    listing.assignedCarrierOrganisationId ||
      listing.assignedCarrierDepartmentId ||
      listing.assignedByOrganisationId ||
      listing.assignedAt ||
      listing.winnerBidId ||
      listing.status === "assigned" ||
      listing.status === "in_progress" ||
      listing.status === "completed",
  );

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-md">
      <div className="flex items-start justify-between gap-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl font-semibold text-black">{listing.name}</h2>

            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getStatusClass(
                listing.status,
              )}`}
            >
              {getStatusLabel(listing.status)}
            </span>

            {isAssigned && (
              <span className="rounded-full border border-orange-300 bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700">
                Assignment Locked
              </span>
            )}

            {listing.archived && (
              <span className="rounded-full border border-gray-300 bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
                Archived
              </span>
            )}
          </div>

          <p className="mt-2 text-sm text-black/50">{listing.location}</p>

          <div className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <DetailBlock
              label="Listing Type"
              value={formatMode(listing.listingType)}
            />

            <DetailBlock
              label="Participation"
              value={formatMode(listing.participationMode)}
            />

            <DetailBlock
              label="Market Mode"
              value={formatMode(listing.marketMode)}
            />

            <DetailBlock
              label="Visibility"
              value={formatMode(listing.visibility)}
            />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
            <DetailBlock
              label="Starting Price"
              value={formatCurrency(listing.startingPrice)}
            />

            <DetailBlock
              label="Current Bid"
              value={formatCurrency(listing.currentBid)}
            />

            <DetailBlock label="End Date" value={formatDate(listing.endDate)} />

            <DetailBlock
              label="Created"
              value={formatDate(listing.createdAt)}
            />
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 text-sm md:grid-cols-3">
            <DetailBlock
              label="Assignment Method"
              value={formatMode(listing.assignmentMethod)}
            />

            <DetailBlock
              label="Assigned Organisation"
              value={listing.assignedCarrierOrganisationId ?? "Not assigned"}
              mono
            />

            <DetailBlock
              label="Assigned At"
              value={formatDate(listing.assignedAt)}
            />
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-3">
          <Link
            href={`/home/marketplace/browse/${listing.id}`}
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
          >
            View Listing →
          </Link>

          <span className="text-xs text-black/35">ID: {listing.id}</span>
        </div>
      </div>
    </div>
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

function DetailBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-xs uppercase tracking-widest text-black/35">{label}</p>
      <p
        className={`mt-2 text-sm font-medium text-black ${
          mono ? "break-all font-mono text-xs" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}