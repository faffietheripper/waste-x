import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  users,
} from "@/db/schema";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function statusLabel(value: string | null) {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : "Not configured";
}

export default async function ThirdPartyFacilitiesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true },
  });
  if (!currentUser?.organisationId) redirect("/home/settings/organisation");

  const organisationId = currentUser.organisationId;
  const query = first(searchParams.q).trim();
  const status = first(searchParams.status) || "active";

  const filters = [
    eq(counterpartySites.organisationId, organisationId),
    eq(counterpartySites.siteType, "third_party_tip"),
    eq(counterpartyRoles.role, "third_party_tip"),
  ];

  if (status === "active") filters.push(eq(counterpartySites.isActive, true));
  if (status === "archived") filters.push(eq(counterpartySites.isActive, false));
  if (query) {
    filters.push(
      or(
        ilike(counterparties.name, `%${query}%`),
        ilike(counterpartySites.name, `%${query}%`),
        ilike(counterpartySites.postcode, `%${query}%`),
        ilike(counterpartySites.authorisationNumber, `%${query}%`),
      )!,
    );
  }

  const facilities = await database
    .select({
      id: counterpartySites.id,
      name: counterpartySites.name,
      postcode: counterpartySites.postcode,
      fullAddress: counterpartySites.fullAddress,
      isActive: counterpartySites.isActive,
      operatorId: counterparties.id,
      operatorName: counterparties.name,
    })
    .from(counterpartySites)
    .innerJoin(counterparties, eq(counterpartySites.counterpartyId, counterparties.id))
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.role, "third_party_tip"),
      ),
    )
    .where(and(...filters))
    .orderBy(desc(counterpartySites.isActive), asc(counterparties.name), asc(counterpartySites.name));

  const enriched = await Promise.all(
    facilities.map(async (facility) => {
      const authorisation = await database.query.counterpartySiteAuthorisations.findFirst({
        where: and(
          eq(counterpartySiteAuthorisations.organisationId, organisationId),
          eq(counterpartySiteAuthorisations.counterpartySiteId, facility.id),
          eq(counterpartySiteAuthorisations.isPrimary, true),
        ),
      });

      const ewcLinks = authorisation
        ? await database
            .select({ ewcCodeId: counterpartySiteEwcCodes.ewcCodeId })
            .from(counterpartySiteEwcCodes)
            .where(
              and(
                eq(counterpartySiteEwcCodes.authorisationId, authorisation.id),
                eq(counterpartySiteEwcCodes.isActive, true),
              ),
            )
        : [];

      return { ...facility, authorisation, permittedEwcCount: ewcLinks.length };
    }),
  );

  const activeCount = enriched.filter((facility) => facility.isActive).length;
  const verifiedCount = enriched.filter((facility) => facility.authorisation?.verifiedAt).length;
  const withEwcCount = enriched.filter((facility) => facility.permittedEwcCount > 0).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Business Data
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Third-Party Facilities</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                External waste facilities your business may send waste to. Store the operator, facility,
                authorisation and permitted EWC codes once for reuse on outgoing and diverted jobs.
              </p>
            </div>
            <Link
              href="/home/tips/new"
              className="inline-flex shrink-0 justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              + New Facility
            </Link>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Active facilities" value={activeCount} />
          <Stat label="Verification recorded" value={verifiedCount} />
          <Stat label="EWC scope configured" value={withEwcCount} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form className="flex flex-col gap-4 lg:flex-row">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search operator, facility, postcode, permit..."
              className="h-12 flex-1 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <select
              name="status"
              defaultValue={status}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm lg:w-48"
            >
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <button type="submit" className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400">
              Search
            </button>
          </form>
        </section>

        {enriched.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold">No third-party facilities found</h2>
            <p className="mt-2 text-sm text-black/45">Add an external transfer station, recycler, treatment site or landfill.</p>
            <Link href="/home/tips/new" className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400">
              + Add Facility
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="divide-y divide-black/5">
              {enriched.map((facility) => (
                <Link
                  key={facility.id}
                  href={`/home/tips/${facility.id}`}
                  className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[1.2fr_0.9fr_0.7fr_0.55fr_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold text-black">{facility.name}</h2>
                      {!facility.isActive && <Badge>Archived</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-black/40">{facility.operatorName}</p>
                  </div>
                  <Mini label="Authorisation" value={facility.authorisation?.authorisationNumber ?? "Not set"} />
                  <Mini label="Status" value={statusLabel(facility.authorisation?.status ?? null)} />
                  <Mini label="EWC Codes" value={String(facility.permittedEwcCount)} />
                  <span className="text-xl text-orange-500">→</span>
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold">{value.toLocaleString()}</p>
    </article>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">{label}</p>
      <p className="mt-1 truncate text-sm text-black/65">{value}</p>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">{children}</span>;
}
