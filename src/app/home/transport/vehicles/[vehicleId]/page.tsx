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
  archiveVehicleAction,
  restoreVehicleAction,
  updateVehicleAction,
} from "../../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function message(key: string, type: "success" | "error") {
  const success: Record<string, string> = {
    created: "Vehicle created.",
    updated: "Vehicle updated.",
    archived: "Vehicle archived.",
    restored: "Vehicle restored.",
  };

  const errors: Record<string, string> = {
    registration_required: "Enter the vehicle registration.",
    invalid_tare: "Tare weight must be a valid number of kilograms.",
    invalid_haulier: "Choose a valid active haulier.",
    duplicate_registration: "That registration is already stored in Waste X.",
  };

  return type === "success" ? success[key] ?? "Changes saved." : errors[key] ?? "Something went wrong.";
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: { vehicleId: string };
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
  const vehicle = await database.query.vehicles.findFirst({
    where: and(eq(vehicles.id, params.vehicleId), eq(vehicles.organisationId, organisationId)),
  });
  if (!vehicle) notFound();

  const [hauliers, usualDrivers] = await Promise.all([
    database
      .select({ id: counterparties.id, name: counterparties.name })
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
          eq(counterparties.organisationId, organisationId),
          eq(counterparties.isActive, true),
        ),
      )
      .orderBy(asc(counterparties.name)),
    database
      .select({ id: drivers.id, name: drivers.name, isActive: drivers.isActive })
      .from(drivers)
      .where(
        and(
          eq(drivers.organisationId, organisationId),
          eq(drivers.defaultVehicleId, vehicle.id),
        ),
      )
      .orderBy(asc(drivers.name)),
  ]);

  const haulierName = vehicle.haulierCounterpartyId
    ? hauliers.find((item) => item.id === vehicle.haulierCounterpartyId)?.name ?? "Archived / unavailable haulier"
    : "Own / unassigned";

  const success = firstParam(searchParams.success);
  const error = firstParam(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link href="/home/transport?view=vehicles" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">← Drivers & Vehicles</Link>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <h1 className="font-mono text-4xl font-semibold">{vehicle.registrationNumber}</h1>
            {!vehicle.isActive && <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-semibold uppercase text-white/60">Archived</span>}
          </div>
          <p className="mt-3 text-sm text-white/50">{vehicle.vehicleType ?? "Vehicle type not set"}</p>
        </section>

        {success && <Notice type="success">{message(success, "success")}</Notice>}
        {error && <Notice type="error">{message(error, "error")}</Notice>}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat label="Haulier" value={haulierName} />
          <Stat label="Stored tare" value={vehicle.tareWeightKg ? `${Number(vehicle.tareWeightKg).toLocaleString()} kg` : "Not set"} />
          <Stat label="Default for drivers" value={String(usualDrivers.filter((item) => item.isActive).length)} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <h2 className="text-xl font-semibold">Vehicle Details</h2>
          <form action={updateVehicleAction} className="mt-6 grid gap-5 md:grid-cols-2">
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <Field label="Registration" name="registrationNumber" defaultValue={vehicle.registrationNumber} required />
            <Field label="Vehicle type" name="vehicleType" defaultValue={vehicle.vehicleType ?? ""} />
            <Select label="Haulier" name="haulierCounterpartyId" defaultValue={vehicle.haulierCounterpartyId ?? ""}>
              <option value="">Own / unassigned</option>
              {hauliers.map((haulier) => <option key={haulier.id} value={haulier.id}>{haulier.name}</option>)}
            </Select>
            <Field label="Stored tare (kg)" name="tareWeightKg" type="number" min="0" step="0.001" defaultValue={vehicle.tareWeightKg ?? ""} />
            <div className="md:col-span-2">
              <Field label="Internal notes" name="notes" defaultValue={vehicle.notes ?? ""} />
            </div>
            {vehicle.isActive && (
              <div className="md:col-span-2">
                <button type="submit" className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400">Save Vehicle</button>
              </div>
            )}
          </form>
        </section>

        {usualDrivers.length > 0 && (
          <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm">
            <div className="p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Usual assignment</p>
              <h2 className="mt-1 text-xl font-semibold">Drivers using this as their default vehicle</h2>
            </div>
            <div className="divide-y divide-black/5 border-t border-black/10">
              {usualDrivers.map((driver) => (
                <Link key={driver.id} href={`/home/transport/drivers/${driver.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-orange-50/40">
                  <span className="font-semibold">{driver.name}</span>
                  <span className={driver.isActive ? "text-xs font-semibold text-green-700" : "text-xs text-black/35"}>{driver.isActive ? "Active" : "Archived"}</span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="flex gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          {vehicle.isActive ? (
            <form action={archiveVehicleAction}>
              <input type="hidden" name="vehicleId" value={vehicle.id} />
              <button className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700">Archive Vehicle</button>
            </form>
          ) : (
            <form action={restoreVehicleAction}>
              <input type="hidden" name="vehicleId" value={vehicle.id} />
              <button className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700">Restore Vehicle</button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

const inputClass = "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Field({ label, name, defaultValue, type = "text", required = false, min, step }: { label: string; name: string; defaultValue?: string; type?: string; required?: boolean; min?: string; step?: string }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><input name={name} type={type} defaultValue={defaultValue} required={required} min={min} step={step} className={inputClass} /></label>;
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue: string; children: React.ReactNode }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><select name={name} defaultValue={defaultValue} className={inputClass}>{children}</select></label>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p><p className="mt-3 truncate text-sm font-semibold text-black/70">{value}</p></article>;
}

function Notice({ type, children }: { type: "success" | "error"; children: React.ReactNode }) {
  return <div className={type === "success" ? "rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800" : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"}>{children}</div>;
}
