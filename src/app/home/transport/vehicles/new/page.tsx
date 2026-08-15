import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  users,
} from "@/db/schema";
import { createVehicleAction } from "../../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(key: string) {
  const messages: Record<string, string> = {
    registration_required: "Enter the vehicle registration.",
    invalid_tare: "Tare weight must be a valid number of kilograms.",
    invalid_haulier: "Choose a valid active haulier.",
    duplicate_registration: "That registration is already stored in Waste X.",
    create_failed: "Waste X could not create the vehicle.",
  };
  return messages[key] ?? "Something went wrong.";
}

export default async function NewVehiclePage({
  searchParams,
}: {
  searchParams: { haulierId?: string | string[]; error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true },
  });
  if (!currentUser?.organisationId) redirect("/home");

  const organisationId = currentUser.organisationId;
  const selectedHaulierId = firstParam(searchParams.haulierId);
  const error = firstParam(searchParams.error);

  const hauliers = await database
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
    .orderBy(asc(counterparties.name));

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link href="/home/transport?view=vehicles" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">← Drivers & Vehicles</Link>
          <h1 className="mt-5 text-4xl font-semibold">New Vehicle</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Store the vehicle registration once, attach it to its haulier and keep a tare weight where that is operationally useful.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">{errorMessage(error)}</div>}

        <form action={createVehicleAction} className="space-y-7">
          <Card title="Vehicle Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Registration" name="registrationNumber" placeholder="AB12 CDE" required />
              <Field label="Vehicle type" name="vehicleType" placeholder="8-wheel tipper" />
              <Select label="Haulier" name="haulierCounterpartyId" defaultValue={selectedHaulierId}>
                <option value="">Own / unassigned</option>
                {hauliers.map((haulier) => <option key={haulier.id} value={haulier.id}>{haulier.name}</option>)}
              </Select>
              <Field label="Stored tare (kg)" name="tareWeightKg" type="number" min="0" step="0.001" placeholder="12500" />
            </div>
          </Card>

          <Card title="Notes">
            <TextArea label="Internal notes" name="notes" placeholder="Trailer/body details, usual route, operational notes..." />
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/home/transport?view=vehicles" className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold">Cancel</Link>
            <button type="submit" className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black">Create Vehicle</button>
          </div>
        </form>
      </div>
    </main>
  );
}

const inputClass = "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm"><h2 className="text-xl font-semibold">{title}</h2><div className="mt-6">{children}</div></section>;
}

function Field({ label, name, type = "text", placeholder, required = false, min, step }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean; min?: string; step?: string }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><input type={type} name={name} placeholder={placeholder} required={required} min={min} step={step} className={inputClass} /></label>;
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue: string; children: React.ReactNode }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><select name={name} defaultValue={defaultValue} className={inputClass}>{children}</select></label>;
}

function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><textarea name={name} placeholder={placeholder} rows={4} className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></label>;
}
