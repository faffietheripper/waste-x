import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, inArray, or } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  users,
  vehicles,
} from "@/db/schema";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(key: string) {
  const messages: Record<string, string> = {
    missing_haulier: "Waste X could not determine which haulier to update.",
    haulier_not_found: "The haulier could not be found.",
  };

  return messages[key] ?? "Something went wrong.";
}

export default async function HauliersPage({
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
  const query = firstParam(searchParams.q).trim();
  const status = firstParam(searchParams.status) || "active";
  const error = firstParam(searchParams.error);

  const filters = [
    eq(counterparties.organisationId, organisationId),
    eq(counterpartyRoles.role, "haulier" as const),
  ];

  if (status === "active") filters.push(eq(counterparties.isActive, true));
  if (status === "archived") filters.push(eq(counterparties.isActive, false));

  if (query) {
    filters.push(
      or(
        ilike(counterparties.name, `%${query}%`),
        ilike(counterparties.carrierRegistrationNumber, `%${query}%`),
        ilike(counterparties.email, `%${query}%`),
        ilike(counterparties.postcode, `%${query}%`),
      )!,
    );
  }

  const hauliers = await database
    .select({
      id: counterparties.id,
      name: counterparties.name,
      carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
      email: counterparties.email,
      telephone: counterparties.telephone,
      postcode: counterparties.postcode,
      isActive: counterparties.isActive,
    })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      eq(counterpartyRoles.counterpartyId, counterparties.id),
    )
    .where(and(...filters))
    .orderBy(desc(counterparties.isActive), asc(counterparties.name));

  const ids = hauliers.map((item) => item.id);

  const [driverRows, vehicleRows] = ids.length
    ? await Promise.all([
        database
          .select({
            haulierId: drivers.haulierCounterpartyId,
            active: drivers.isActive,
          })
          .from(drivers)
          .where(
            and(
              eq(drivers.organisationId, organisationId),
              inArray(drivers.haulierCounterpartyId, ids),
            ),
          ),
        database
          .select({
            haulierId: vehicles.haulierCounterpartyId,
            active: vehicles.isActive,
          })
          .from(vehicles)
          .where(
            and(
              eq(vehicles.organisationId, organisationId),
              inArray(vehicles.haulierCounterpartyId, ids),
            ),
          ),
      ])
    : [[], []];

  const counts = new Map<string, { drivers: number; vehicles: number }>();
  for (const id of ids) counts.set(id, { drivers: 0, vehicles: 0 });

  for (const row of driverRows) {
    if (row.haulierId && row.active) {
      const value = counts.get(row.haulierId);
      if (value) value.drivers += 1;
    }
  }

  for (const row of vehicleRows) {
    if (row.haulierId && row.active) {
      const value = counts.get(row.haulierId);
      if (value) value.vehicles += 1;
    }
  }

  const allHaulierRows = await database
    .select({ isActive: counterparties.isActive })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.role, "haulier"),
      ),
    )
    .where(eq(counterparties.organisationId, organisationId));

  const activeCount = allHaulierRows.filter((item) => item.isActive).length;
  const archivedCount = allHaulierRows.filter((item) => !item.isActive).length;
  const activeVehicles = vehicleRows.filter((item) => item.active).length;

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
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Hauliers</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Store transport companies once, including their carrier registration and the drivers and vehicles they normally use.
              </p>
            </div>
            <Link
              href="/home/hauliers/new"
              className="inline-flex shrink-0 justify-center rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
            >
              + New Haulier
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            {errorMessage(error)}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Active hauliers" value={activeCount} />
          <Stat label="Active vehicles" value={activeVehicles} />
          <Stat label="Archived" value={archivedCount} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form className="flex flex-col gap-4 lg:flex-row">
            <input
              name="q"
              defaultValue={query}
              placeholder="Search haulier, carrier number, postcode..."
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

        {hauliers.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-12 text-center">
            <h2 className="text-xl font-semibold">No hauliers found</h2>
            <p className="mt-2 text-sm text-black/45">Add the transport companies you use repeatedly.</p>
            <Link href="/home/hauliers/new" className="mt-6 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400">
              + Add Haulier
            </Link>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="divide-y divide-black/5">
              {hauliers.map((haulier) => {
                const summary = counts.get(haulier.id) ?? { drivers: 0, vehicles: 0 };

                return (
                  <Link
                    key={haulier.id}
                    href={`/home/hauliers/${haulier.id}`}
                    className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[1.35fr_0.8fr_0.5fr_0.5fr_auto] lg:items-center"
                  >
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-semibold text-black">{haulier.name}</h2>
                        {!haulier.isActive && (
                          <span className="rounded-full bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase text-black/45">
                            Archived
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-black/40">{haulier.postcode ?? "No postcode"}</p>
                    </div>

                    <Mini label="Carrier number" value={haulier.carrierRegistrationNumber ?? "Not set"} />
                    <Mini label="Drivers" value={String(summary.drivers)} />
                    <Mini label="Vehicles" value={String(summary.vehicles)} />
                    <span className="text-xl text-orange-500">→</span>
                  </Link>
                );
              })}
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
      <p className="mt-1 truncate text-sm font-semibold text-black/65">{value}</p>
    </div>
  );
}
