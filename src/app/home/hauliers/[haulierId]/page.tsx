import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  users,
  vehicles,
} from "@/db/schema";
import {
  archiveHaulierAction,
  restoreHaulierAction,
  updateHaulierAction,
} from "../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function successMessage(key: string) {
  const messages: Record<string, string> = {
    haulier_created: "Haulier saved. Add its drivers and vehicles next.",
    haulier_updated: "Haulier updated.",
    haulier_archived: "Haulier archived.",
    haulier_restored: "Haulier restored.",
  };
  return messages[key] ?? "Changes saved.";
}

function errorMessage(key: string) {
  const messages: Record<string, string> = {
    name_required: "Enter the haulier name.",
    duplicate_name: "Another business already uses that name.",
    multi_role_archive_blocked:
      "This business also has another Waste X role, so the whole counterparty cannot be archived from the Hauliers screen.",
  };
  return messages[key] ?? "Something went wrong.";
}

export default async function HaulierDetailPage({
  params,
  searchParams,
}: {
  params: { haulierId: string };
  searchParams: { success?: string | string[]; error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true },
  });

  if (!currentUser?.organisationId) redirect("/home");

  const organisationId = currentUser.organisationId;

  const rows = await database
    .select({
      id: counterparties.id,
      name: counterparties.name,
      carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
      email: counterparties.email,
      telephone: counterparties.telephone,
      fullAddress: counterparties.fullAddress,
      postcode: counterparties.postcode,
      notes: counterparties.notes,
      isActive: counterparties.isActive,
    })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.role, "haulier"),
      ),
    )
    .where(
      and(
        eq(counterparties.id, params.haulierId),
        eq(counterparties.organisationId, organisationId),
      ),
    )
    .limit(1);

  const haulier = rows[0];
  if (!haulier) notFound();

  const [driverRows, vehicleRows] = await Promise.all([
    database
      .select()
      .from(drivers)
      .where(
        and(
          eq(drivers.organisationId, organisationId),
          eq(drivers.haulierCounterpartyId, haulier.id),
        ),
      )
      .orderBy(asc(drivers.name)),
    database
      .select()
      .from(vehicles)
      .where(
        and(
          eq(vehicles.organisationId, organisationId),
          eq(vehicles.haulierCounterpartyId, haulier.id),
        ),
      )
      .orderBy(asc(vehicles.registrationNumber)),
  ]);

  const success = firstParam(searchParams.success);
  const error = firstParam(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative">
            <Link href="/home/hauliers" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
              ← Hauliers
            </Link>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold">{haulier.name}</h1>
              {!haulier.isActive && (
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase text-white/60">
                  Archived
                </span>
              )}
            </div>
            <p className="mt-3 font-mono text-sm text-orange-400">
              {haulier.carrierRegistrationNumber ?? "Carrier registration not set"}
            </p>
          </div>
        </section>

        {success && <Message type="success">{successMessage(success)}</Message>}
        {error && <Message type="error">{errorMessage(error)}</Message>}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Drivers" value={driverRows.filter((item) => item.isActive).length} />
          <Stat label="Vehicles" value={vehicleRows.filter((item) => item.isActive).length} />
          <Stat label="Carrier number" value={haulier.carrierRegistrationNumber ?? "Not set"} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Haulier</p>
          <h2 className="mt-2 text-2xl font-semibold">Company Details</h2>

          <form action={updateHaulierAction} className="mt-7 grid gap-5 md:grid-cols-2">
            <input type="hidden" name="haulierId" value={haulier.id} />
            <Field label="Haulier name" name="name" defaultValue={haulier.name} required />
            <Field label="Waste carrier registration" name="carrierRegistrationNumber" defaultValue={haulier.carrierRegistrationNumber ?? ""} />
            <Field label="Email" name="email" type="email" defaultValue={haulier.email ?? ""} />
            <Field label="Telephone" name="telephone" defaultValue={haulier.telephone ?? ""} />
            <div className="md:col-span-2">
              <Field label="Full address" name="fullAddress" defaultValue={haulier.fullAddress ?? ""} />
            </div>
            <Field label="Postcode" name="postcode" defaultValue={haulier.postcode ?? ""} />
            <Field label="Internal notes" name="notes" defaultValue={haulier.notes ?? ""} />
            <div className="md:col-span-2">
              <button type="submit" className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400">
                Save Haulier
              </button>
            </div>
          </form>
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <TransportCard
            title="Drivers"
            count={driverRows.filter((item) => item.isActive).length}
            createHref={`/home/transport/drivers/new?haulierId=${haulier.id}`}
          >
            {driverRows.length === 0 ? (
              <Empty>No drivers attached yet.</Empty>
            ) : (
              driverRows.map((driver) => (
                <Link
                  key={driver.id}
                  href={`/home/transport/drivers/${driver.id}`}
                  className="flex items-center justify-between border-t border-black/5 px-5 py-4 first:border-t-0 hover:bg-orange-50/40"
                >
                  <div>
                    <p className="font-semibold text-black">{driver.name}</p>
                    <p className="mt-1 text-xs text-black/40">{driver.telephone ?? "No telephone"}</p>
                  </div>
                  <span className={driver.isActive ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-black/35"}>
                    {driver.isActive ? "Active" : "Archived"}
                  </span>
                </Link>
              ))
            )}
          </TransportCard>

          <TransportCard
            title="Vehicles"
            count={vehicleRows.filter((item) => item.isActive).length}
            createHref={`/home/transport/vehicles/new?haulierId=${haulier.id}`}
          >
            {vehicleRows.length === 0 ? (
              <Empty>No vehicles attached yet.</Empty>
            ) : (
              vehicleRows.map((vehicle) => (
                <Link
                  key={vehicle.id}
                  href={`/home/transport/vehicles/${vehicle.id}`}
                  className="flex items-center justify-between border-t border-black/5 px-5 py-4 first:border-t-0 hover:bg-orange-50/40"
                >
                  <div>
                    <p className="font-mono font-semibold text-black">{vehicle.registrationNumber}</p>
                    <p className="mt-1 text-xs text-black/40">{vehicle.vehicleType ?? "Vehicle type not set"}</p>
                  </div>
                  <span className={vehicle.isActive ? "text-xs font-semibold text-green-700" : "text-xs font-semibold text-black/35"}>
                    {vehicle.isActive ? "Active" : "Archived"}
                  </span>
                </Link>
              ))
            )}
          </TransportCard>
        </section>

        <section className="flex flex-wrap gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          {haulier.isActive ? (
            <form action={archiveHaulierAction}>
              <input type="hidden" name="haulierId" value={haulier.id} />
              <button type="submit" className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">
                Archive Haulier
              </button>
            </form>
          ) : (
            <form action={restoreHaulierAction}>
              <input type="hidden" name="haulierId" value={haulier.id} />
              <button type="submit" className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700">
                Restore Haulier
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Field({ label, name, defaultValue, type = "text", required = false }: { label: string; name: string; defaultValue?: string; type?: string; required?: boolean }) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span>
      <input name={name} type={type} defaultValue={defaultValue} required={required} className={inputClass} />
    </label>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className="mt-3 truncate text-xl font-semibold">{typeof value === "number" ? value.toLocaleString() : value}</p>
    </article>
  );
}

function TransportCard({ title, count, createHref, children }: { title: string; count: number; createHref: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
      <div className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Transport</p>
          <h2 className="mt-1 text-xl font-semibold">{title} <span className="text-black/30">({count})</span></h2>
        </div>
        <Link href={createHref} className="rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-orange-400">+ Add</Link>
      </div>
      <div className="border-t border-black/10">{children}</div>
    </section>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-5 py-8 text-center text-sm text-black/40">{children}</div>;
}

function Message({ type, children }: { type: "success" | "error"; children: React.ReactNode }) {
  return (
    <div className={type === "success" ? "rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800" : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"}>
      {children}
    </div>
  );
}
