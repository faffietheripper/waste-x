import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  drivers,
  users,
  vehicles,
} from "@/db/schema";

type SearchParams = {
  view?: string | string[];
  q?: string | string[];
  status?: string | string[];
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function TransportPage({
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
  const view = firstParam(searchParams.view) === "vehicles" ? "vehicles" : "drivers";
  const query = firstParam(searchParams.q).trim();
  const status = firstParam(searchParams.status) || "active";
  const error = firstParam(searchParams.error);

  const driverFilters = [eq(drivers.organisationId, organisationId)];
  const vehicleFilters = [eq(vehicles.organisationId, organisationId)];

  if (status === "active") {
    driverFilters.push(eq(drivers.isActive, true));
    vehicleFilters.push(eq(vehicles.isActive, true));
  }

  if (status === "archived") {
    driverFilters.push(eq(drivers.isActive, false));
    vehicleFilters.push(eq(vehicles.isActive, false));
  }

  if (query) {
    driverFilters.push(
      or(
        ilike(drivers.name, `%${query}%`),
        ilike(drivers.telephone, `%${query}%`),
        ilike(drivers.email, `%${query}%`),
        ilike(counterparties.name, `%${query}%`),
      )!,
    );

    const normalisedReg = query.toUpperCase().replace(/\s+/g, "");
    vehicleFilters.push(
      or(
        ilike(vehicles.registrationNumber, `%${normalisedReg}%`),
        ilike(vehicles.vehicleType, `%${query}%`),
        ilike(counterparties.name, `%${query}%`),
      )!,
    );
  }

  const [driverRows, vehicleRows, allDrivers, allVehicles] = await Promise.all([
    database
      .select({
        id: drivers.id,
        name: drivers.name,
        telephone: drivers.telephone,
        email: drivers.email,
        defaultVehicleId: drivers.defaultVehicleId,
        isActive: drivers.isActive,
        haulierId: drivers.haulierCounterpartyId,
        haulierName: counterparties.name,
      })
      .from(drivers)
      .leftJoin(counterparties, eq(drivers.haulierCounterpartyId, counterparties.id))
      .where(and(...driverFilters))
      .orderBy(desc(drivers.isActive), asc(drivers.name)),

    database
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        tareWeightKg: vehicles.tareWeightKg,
        isActive: vehicles.isActive,
        haulierId: vehicles.haulierCounterpartyId,
        haulierName: counterparties.name,
      })
      .from(vehicles)
      .leftJoin(counterparties, eq(vehicles.haulierCounterpartyId, counterparties.id))
      .where(and(...vehicleFilters))
      .orderBy(desc(vehicles.isActive), asc(vehicles.registrationNumber)),

    database.select({ isActive: drivers.isActive }).from(drivers).where(eq(drivers.organisationId, organisationId)),
    database.select({ isActive: vehicles.isActive }).from(vehicles).where(eq(vehicles.organisationId, organisationId)),
  ]);

  const vehicleMap = new Map(
    vehicleRows.map((vehicle) => [vehicle.id, vehicle.registrationNumber]),
  );

  const activeDriverCount = allDrivers.filter((item) => item.isActive).length;
  const activeVehicleCount = allVehicles.filter((item) => item.isActive).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">Business Data</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Drivers & Vehicles</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Keep the transport records used repeatedly on booked jobs and actual movements.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/home/transport/drivers/new" className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black">+ Driver</Link>
              <Link href="/home/transport/vehicles/new" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white">+ Vehicle</Link>
            </div>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">
            Waste X could not find that transport record.
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Active drivers" value={activeDriverCount} />
          <Stat label="Active vehicles" value={activeVehicleCount} />
          <Stat label="Transport records" value={activeDriverCount + activeVehicleCount} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <Tab href="/home/transport?view=drivers" active={view === "drivers"}>Drivers</Tab>
            <Tab href="/home/transport?view=vehicles" active={view === "vehicles"}>Vehicles</Tab>
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <form className="flex flex-col gap-4 lg:flex-row">
            <input type="hidden" name="view" value={view} />
            <input
              name="q"
              defaultValue={query}
              placeholder={view === "drivers" ? "Search driver or haulier..." : "Search registration, vehicle type or haulier..."}
              className="h-12 flex-1 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            />
            <select name="status" defaultValue={status} className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm lg:w-48">
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="all">All</option>
            </select>
            <button type="submit" className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400">Search</button>
          </form>
        </section>

        {view === "drivers" ? (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            {driverRows.length === 0 ? (
              <Empty title="No drivers found" href="/home/transport/drivers/new" label="+ Add Driver" />
            ) : (
              <div className="divide-y divide-black/5">
                {driverRows.map((driver) => (
                  <Link
                    key={driver.id}
                    href={`/home/transport/drivers/${driver.id}`}
                    className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[1fr_1fr_0.7fr_auto] lg:items-center"
                  >
                    <div>
                      <p className="font-semibold text-black">{driver.name}</p>
                      <p className="mt-1 text-xs text-black/40">{driver.telephone ?? driver.email ?? "No contact details"}</p>
                    </div>
                    <Mini label="Haulier" value={driver.haulierName ?? "Own / unassigned"} />
                    <Mini label="Default vehicle" value={driver.defaultVehicleId ? vehicleMap.get(driver.defaultVehicleId) ?? "Assigned" : "Not set"} />
                    <span className={driver.isActive ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-black/35"}>{driver.isActive ? "Active" : "Archived"}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        ) : (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            {vehicleRows.length === 0 ? (
              <Empty title="No vehicles found" href="/home/transport/vehicles/new" label="+ Add Vehicle" />
            ) : (
              <div className="divide-y divide-black/5">
                {vehicleRows.map((vehicle) => (
                  <Link
                    key={vehicle.id}
                    href={`/home/transport/vehicles/${vehicle.id}`}
                    className="grid gap-5 px-6 py-5 transition hover:bg-orange-50/40 lg:grid-cols-[0.8fr_1fr_0.8fr_auto] lg:items-center"
                  >
                    <div>
                      <p className="font-mono text-lg font-semibold text-black">{vehicle.registrationNumber}</p>
                      <p className="mt-1 text-xs text-black/40">{vehicle.vehicleType ?? "Type not set"}</p>
                    </div>
                    <Mini label="Haulier" value={vehicle.haulierName ?? "Own / unassigned"} />
                    <Mini label="Stored tare" value={vehicle.tareWeightKg ? `${Number(vehicle.tareWeightKg).toLocaleString()} kg` : "Not set"} />
                    <span className={vehicle.isActive ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-black/35"}>{vehicle.isActive ? "Active" : "Archived"}</span>
                  </Link>
                ))}
              </div>
            )}
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

function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} className={active ? "rounded-2xl bg-black px-5 py-3 text-center text-sm font-semibold text-orange-400" : "rounded-2xl px-5 py-3 text-center text-sm font-semibold text-black/45 hover:bg-black/5"}>
      {children}
    </Link>
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

function Empty({ title, href, label }: { title: string; href: string; label: string }) {
  return (
    <div className="p-12 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Link href={href} className="mt-5 inline-flex rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400">{label}</Link>
    </div>
  );
}
