import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  drivers,
  materialProfiles,
  sites,
  users,
  vehicles,
} from "@/db/schema";

import OutgoingBookingForm from "./_components/OutgoingBookingForm";

type SearchParams = {
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function todayInLondon() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const errors: Record<string, string> = {
  invalid_job_date: "Choose a valid movement date.",
  destination_required: "Choose a third-party facility.",
  material_required: "Choose the waste/material being moved.",
  transport_mode_required: "Choose own transport or an external haulier.",
  haulier_required: "Choose the external haulier.",
  invalid_load_count: "Loads must be between 1 and 100.",
  own_site_missing: "Your primary receiving site is not configured.",
  own_permit_missing: "Your primary site does not have an active primary permit.",
  invalid_destination: "The selected third-party facility is not available.",
  invalid_haulier: "The selected haulier is not available.",
  invalid_driver: "The selected driver is not available.",
  invalid_vehicle: "The selected vehicle is not available.",
  driver_not_for_haulier: "That driver belongs to another haulier.",
  vehicle_not_for_haulier: "That vehicle belongs to another haulier.",
  driver_not_for_own_transport: "Choose one of your own drivers.",
  vehicle_not_for_own_transport: "Choose one of your own vehicles.",
  invalid_material: "The selected material is not available.",
  material_not_permitted_at_own_site: "That EWC is not configured on your own site's active permit.",
  destination_not_permitted_for_material:
    "That facility does not have an active configured authorisation for the selected EWC.",
};

export default async function NewOutgoingMovementPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.isActive || currentUser.isSuspended) {
    redirect("/home");
  }

  const organisationId = currentUser.organisationId;

  const [ownSite, facilityRows, materialRows, haulierRows, driverRows, vehicleRows] =
    await Promise.all([
      database.query.sites.findFirst({
        where: and(
          eq(sites.organisationId, organisationId),
          eq(sites.status, "active"),
          eq(sites.siteType, "waste_receiving_site"),
          eq(sites.isDefault, true),
        ),
        columns: {
          id: true,
          name: true,
        },
        with: {
          permits: {
            where: (permit, { and: relationAnd, eq: relationEq }) =>
              relationAnd(
                relationEq(permit.status, "active"),
                relationEq(permit.isPrimary, true),
              ),
            columns: { id: true },
            with: {
              permittedEwcCodes: {
                where: (link, { eq: relationEq }) => relationEq(link.isActive, true),
                columns: { ewcCodeId: true },
              },
            },
          },
        },
      }),
      database.query.counterpartySites.findMany({
        where: and(
          eq(counterpartySites.organisationId, organisationId),
          eq(counterpartySites.siteType, "third_party_tip"),
          eq(counterpartySites.isActive, true),
        ),
        columns: {
          id: true,
          name: true,
          postcode: true,
        },
        with: {
          counterparty: {
            columns: {
              name: true,
            },
          },
          authorisations: {
            where: (authorisation, { eq: relationEq }) =>
              relationEq(authorisation.status, "active"),
            columns: {
              id: true,
              authorisationNumber: true,
              isPrimary: true,
            },
            with: {
              permittedEwcCodes: {
                where: (link, { eq: relationEq }) => relationEq(link.isActive, true),
                columns: {
                  ewcCodeId: true,
                },
              },
            },
          },
        },
        orderBy: (site, { asc: relationAsc }) => [relationAsc(site.name)],
      }),
      database.query.materialProfiles.findMany({
        where: and(
          eq(materialProfiles.organisationId, organisationId),
          eq(materialProfiles.isActive, true),
        ),
        columns: {
          id: true,
          name: true,
          ewcCodeId: true,
          wasteDescription: true,
        },
        with: {
          ewcCode: {
            columns: {
              code: true,
            },
          },
        },
        orderBy: (material, { asc: relationAsc }) => [relationAsc(material.name)],
      }),
      database
        .select({
          id: counterparties.id,
          name: counterparties.name,
        })
        .from(counterparties)
        .innerJoin(
          counterpartyRoles,
          and(
            eq(counterpartyRoles.counterpartyId, counterparties.id),
            eq(counterpartyRoles.organisationId, organisationId),
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
          id: drivers.id,
          name: drivers.name,
          haulierCounterpartyId: drivers.haulierCounterpartyId,
        })
        .from(drivers)
        .where(
          and(
            eq(drivers.organisationId, organisationId),
            eq(drivers.isActive, true),
          ),
        )
        .orderBy(asc(drivers.name)),
      database
        .select({
          id: vehicles.id,
          registrationNumber: vehicles.registrationNumber,
          vehicleType: vehicles.vehicleType,
          haulierCounterpartyId: vehicles.haulierCounterpartyId,
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

  if (!ownSite) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
        <div className="mx-auto max-w-3xl rounded-[30px] border border-amber-200 bg-amber-50 p-8">
          <h1 className="text-2xl font-semibold text-black">Receiving site required</h1>
          <p className="mt-3 text-sm leading-6 text-black/55">
            Outgoing movements leave from your own operational site. Configure the primary
            receiving site first.
          </p>
          <Link href="/home/sites" className="mt-5 inline-flex rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400">
            Open Receiving Site & Permit
          </Link>
        </div>
      </main>
    );
  }

  if (ownSite.permits.length === 0) {
    return (
      <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
        <div className="mx-auto max-w-3xl rounded-[30px] border border-amber-200 bg-amber-50 p-8">
          <h1 className="text-2xl font-semibold text-black">Active primary permit required</h1>
          <p className="mt-3 text-sm leading-6 text-black/55">
            Outgoing waste from your own facility should be tied back to the active primary site permit.
          </p>
          <Link href="/home/sites" className="mt-5 inline-flex rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400">
            Open Receiving Site & Permit
          </Link>
        </div>
      </main>
    );
  }

  const facilities = facilityRows
    .map((site) => {
      const primary = site.authorisations.find((item) => item.isPrimary) ?? site.authorisations[0];
      const permittedEwcCodeIds = Array.from(
        new Set(site.authorisations.flatMap((item) => item.permittedEwcCodes.map((link) => link.ewcCodeId))),
      );

      return {
        id: site.id,
        name: site.name,
        operatorName: site.counterparty?.name ?? "External operator",
        postcode: site.postcode,
        authorisationNumber: primary?.authorisationNumber ?? null,
        permittedEwcCodeIds,
      };
    })
    .filter((site) => site.permittedEwcCodeIds.length > 0);

  const primaryPermit = ownSite.permits[0] ?? null;
  const ownPermittedEwcIds = new Set(
    primaryPermit?.permittedEwcCodes.map((link) => link.ewcCodeId) ?? [],
  );

  const materials = materialRows
    .filter((material) => ownPermittedEwcIds.has(material.ewcCodeId))
    .map((material) => ({
      id: material.id,
      name: material.name,
      ewcCodeId: material.ewcCodeId,
      ewcCode: material.ewcCode?.code ?? "—",
      description: material.wasteDescription,
    }));

  const error = firstParam(searchParams?.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative z-10 flex items-end justify-between gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Operations // Outgoing
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Book outgoing movement</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Plan waste leaving {ownSite.name}. Waste X checks the selected EWC against the
                external facility's configured active authorisation before creating the Load.
              </p>
            </div>
            <Link href="/home/movements/outgoing" className="shrink-0 rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/65">
              Back to Outgoing
            </Link>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
            {errors[error] ?? `Unable to book movement: ${error}`}
          </div>
        )}

        {facilities.length === 0 ? (
          <section className="rounded-[28px] border border-amber-200 bg-amber-50 p-7">
            <h2 className="text-xl font-semibold text-black">No usable third-party facility yet</h2>
            <p className="mt-2 text-sm leading-6 text-black/55">
              Add an external facility with an active authorisation and at least one permitted EWC
              before booking outgoing waste.
            </p>
            <Link href="/home/tips" className="mt-5 inline-flex rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-orange-400">
              Open Third-Party Facilities
            </Link>
          </section>
        ) : (
          <OutgoingBookingForm
            ownSiteName={ownSite.name}
            today={todayInLondon()}
            facilities={facilities}
            materials={materials}
            hauliers={haulierRows}
            drivers={driverRows}
            vehicles={vehicleRows}
          />
        )}
      </div>
    </main>
  );
}
