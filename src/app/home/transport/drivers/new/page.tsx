import Link from "next/link";
/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  users,
  vehicles,
} from "@/db/schema";
import OwnCarrierDwtFields from "@/modules/digital-waste-tracking/components/OwnCarrierDwtFields";
import {
  canManageOwnCarrierDwtSettings,
} from "@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings";
import { getWasteTrackingOrganisationSettings } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingOrganisationSettings";
import { createDriverAction } from "../../actions";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function errorMessage(key: string) {
  const messages: Record<string, string> = {
    name_required: "Enter the driver's name.",
    invalid_haulier: "Choose a valid active haulier.",
    invalid_vehicle: "Choose a valid active vehicle.",
    vehicle_haulier_mismatch: "The default vehicle belongs to a different haulier.",
    own_carrier_invalid_reason: "Choose a valid reason for having no carrier registration.",
    own_carrier_invalid_means: "Choose a valid means of transport.",
    create_failed: "Waste X could not create the driver.",
  };
  return messages[key] ?? "Something went wrong.";
}

export default async function NewDriverPage({
  searchParams,
}: {
  searchParams: { haulierId?: string | string[]; error?: string | string[] };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true, role: true },
  });
  if (!currentUser?.organisationId) redirect("/home");

  const organisationId = currentUser.organisationId;
  const selectedHaulierId = firstParam(searchParams.haulierId);
  const error = firstParam(searchParams.error);

  const dwtSettings = await getWasteTrackingOrganisationSettings({
    organisationId,
  });
  const canEditOwnCarrierDwt = canManageOwnCarrierDwtSettings(
    currentUser.role,
  );

  const [hauliers, vehicleRows] = await Promise.all([
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
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
        haulierId: vehicles.haulierCounterpartyId,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.organisationId, organisationId),
          eq(vehicles.isActive, true),
        ),
      )
      .orderBy(asc(vehicles.registrationNumber)),
  ]);

  const haulierName = new Map(hauliers.map((item) => [item.id, item.name]));

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-5xl space-y-7">
        <section className="rounded-[2rem] bg-black p-8 text-white">
          <Link href="/home/transport?view=drivers" className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">← Drivers & Vehicles</Link>
          <h1 className="mt-5 text-4xl font-semibold">New Driver</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">Attach the driver to the haulier they normally work for and optionally store their usual vehicle.</p>
        </section>

        {error && <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800">{errorMessage(error)}</div>}

        <form action={createDriverAction} className="space-y-7">
          <Card title="Driver Details">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="Driver name" name="name" placeholder="John Smith" required />
              <Select label="Haulier" name="haulierCounterpartyId" defaultValue={selectedHaulierId}>
                <option value="">Own / unassigned</option>
                {hauliers.map((haulier) => <option key={haulier.id} value={haulier.id}>{haulier.name}</option>)}
              </Select>
              <Field label="Telephone" name="telephone" placeholder="07..." />
              <Field label="Email" name="email" type="email" placeholder="driver@example.co.uk" />
            </div>
          </Card>

          <Card title="Own Carrier DWT">
            <p className="mb-5 text-sm leading-6 text-black/50">
              When this driver is saved as <span className="font-semibold text-black">Own / unassigned</span>,
              Waste X can also save your organisation&apos;s carrier identity here. This is
              the same organisation-level information used automatically on own-fleet DWT
              submissions; it is not stored separately on each driver.
            </p>
            <OwnCarrierDwtFields
              canEdit={canEditOwnCarrierDwt}
              initial={{
                registrationNumber:
                  dwtSettings?.ownCarrierRegistrationNumber ?? "",
                reasonForNoRegistrationNumber:
                  dwtSettings?.ownCarrierReasonForNoRegistrationNumber ?? "",
                meansOfTransport:
                  dwtSettings?.ownCarrierMeansOfTransport ?? "Road",
              }}
            />
          </Card>

          <Card title="Usual Vehicle">
            <Select label="Default vehicle" name="defaultVehicleId" defaultValue="">
              <option value="">No default vehicle</option>
              {vehicleRows.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registrationNumber} · {vehicle.haulierId ? haulierName.get(vehicle.haulierId) ?? "Haulier" : "Own / unassigned"}
                </option>
              ))}
            </Select>
            <p className="mt-3 text-xs leading-5 text-black/35">Waste X will validate that the selected vehicle belongs to the same haulier where applicable.</p>
          </Card>

          <Card title="Notes">
            <TextArea label="Internal notes" name="notes" placeholder="Usual vehicle, shift notes, contact notes..." />
          </Card>

          <div className="flex justify-end gap-3">
            <Link href="/home/transport?view=drivers" className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold">Cancel</Link>
            <button type="submit" className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black">Create Driver</button>
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

function Field({ label, name, type = "text", placeholder, required = false }: { label: string; name: string; type?: string; placeholder?: string; required?: boolean }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><input type={type} name={name} placeholder={placeholder} required={required} className={inputClass} /></label>;
}

function Select({ label, name, defaultValue, children }: { label: string; name: string; defaultValue: string; children: React.ReactNode }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><select name={name} defaultValue={defaultValue} className={inputClass}>{children}</select></label>;
}

function TextArea({ label, name, placeholder }: { label: string; name: string; placeholder?: string }) {
  return <label><span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">{label}</span><textarea name={name} placeholder={placeholder} rows={4} className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100" /></label>;
}
