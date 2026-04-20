import { auth } from "@/auth";
import { database } from "@/db/database";
import { organisations, users, wasteListings, bids } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   PAGE
========================================================= */

export default async function OrganisationPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return <div className="p-10">Unauthorized</div>;
  }

  /* =========================================================
     FETCH USER + ORG
  ========================================================= */

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!user?.organisationId) {
    return <div className="p-10">No organisation found</div>;
  }

  const orgId = user.organisationId;

  const [organisation] = await database
    .select()
    .from(organisations)
    .where(eq(organisations.id, orgId));

  /* =========================================================
     FETCH DATA (LIGHT METRICS)
  ========================================================= */

  const orgUsers = await database
    .select()
    .from(users)
    .where(eq(users.organisationId, orgId));

  const listings = await database
    .select()
    .from(wasteListings)
    .where(eq(wasteListings.organisationId, orgId));

  const orgBids = await database
    .select()
    .from(bids)
    .where(eq(bids.organisationId, orgId));

  /* =========================================================
     METRICS
  ========================================================= */

  const totalMembers = orgUsers.length;
  const totalListings = listings.length;
  const activeListings = listings.filter(
    (l: any) => l.status === "open",
  ).length;

  const totalBids = orgBids.length;

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-10 pt-56 flex flex-col gap-10">
      {/* HEADER */}
      <div className=" flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {organisation?.teamName || "Organisation"}
          </h1>
          <p className="text-sm text-gray-500">
            Overview of your organisation activity and structure
          </p>
        </div>
      </div>

      {/* ================= KPI GRID ================= */}
      <div className=" grid grid-cols-2 md:grid-cols-4 gap-6">
        <Stat title="Members" value={totalMembers} />
        <Stat title="Listings" value={totalListings} />
        <Stat title="Active Listings" value={activeListings} />
        <Stat title="Bids" value={totalBids} />
      </div>

      {/* ================= MAIN GRID ================= */}
      <div className=" grid grid-cols-3 gap-6">
        {/* ORG DETAILS */}
        <div className="col-span-2 border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Organisation Details</h2>

          <Info label="Industry" value={organisation?.industry} />
          <Info label="Email" value={organisation?.emailAddress} />
          <Info label="Phone" value={organisation?.telephone} />

          <Info label="Country" value={organisation?.country} />
          <Info label="City" value={organisation?.city} />

          <Info
            label="Capabilities"
            value={organisation?.capabilities?.join(", ")}
          />
        </div>

        {/* STATUS CARD */}
        <div className="col-span-1 border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Status</h2>

          <p className="text-sm text-gray-500">
            Organisation approval & compliance state
          </p>

          <div className="mt-2">
            <span className="text-xs px-3 py-1 rounded-full bg-gray-100">
              {organisation?.status || "PENDING"}
            </span>
          </div>
        </div>
      </div>

      {/* ================= ACTIVITY GRID ================= */}
      <div className=" grid grid-cols-2 gap-6">
        {/* RECENT LISTINGS */}
        <div className="border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Recent Listings</h2>

          {listings.slice(0, 5).map((l: any) => (
            <div key={l.id} className="text-sm flex justify-between">
              <span>{l.name}</span>
              <span className="text-gray-400">{l.status}</span>
            </div>
          ))}

          {listings.length === 0 && (
            <p className="text-sm text-gray-500">No listings yet.</p>
          )}
        </div>

        {/* TEAM SNAPSHOT */}
        <div className="border border-gray-200 rounded-xl p-6 flex flex-col gap-4">
          <h2 className="font-semibold text-lg">Team Snapshot</h2>

          {orgUsers.slice(0, 5).map((u: any) => (
            <div key={u.id} className="text-sm flex justify-between">
              <span>{u.name}</span>
              <span className="text-gray-400">{u.role}</span>
            </div>
          ))}

          {orgUsers.length === 0 && (
            <p className="text-sm text-gray-500">No members found.</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <p className="text-sm text-gray-500">{title}</p>
      <p className="text-xl font-semibold mt-1">{value}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-sm text-gray-800">{value || "—"}</p>
    </div>
  );
}
