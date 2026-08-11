// src/app/home/operations/jobs/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  sites,
  users,
  type OrganisationOperatingMode,
} from "@/db/schema";
import { getDefaultSiteForOrganisation } from "@/modules/sites/data-access/getDefaultSiteForOrganisation";
import { getSiteTypeLabel } from "@/modules/sites/core/siteTypes";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

import { createExternalCarrierJobAction } from "../actions";

type PageProps = {
  searchParams?: {
    error?: string;
  };
};

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

const ERROR_MESSAGES: Record<string, string> = {
  customer_required: "Customer name is required.",
  pickup_required: "Pickup address is required.",
  waste_required: "Waste description is required.",
  site_required: "A valid operating site is required.",
};

export default async function NewCarrierJobPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
    columns: {
      id: true,
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.organisation ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home");
  }

  const organisationContext = {
    operatingMode:
      currentUser.organisation.operatingMode as OrganisationOperatingMode | null,
    capabilities:
      (currentUser.organisation.capabilities as OrganisationCapability[] | null) ??
      [],
  };

  if (!shouldShowExternalJobs(organisationContext)) {
    redirect("/home");
  }

  await getDefaultSiteForOrganisation({
    organisationId: currentUser.organisationId,
    createIfMissing: true,
  });

  const activeSites = await database
    .select({
      id: sites.id,
      name: sites.name,
      siteType: sites.siteType,
      isDefault: sites.isDefault,
    })
    .from(sites)
    .where(
      and(
        eq(sites.organisationId, currentUser.organisationId),
        eq(sites.status, "active"),
      ),
    )
    .orderBy(desc(sites.isDefault), asc(sites.name));

  const errorMessage = searchParams?.error
    ? ERROR_MESSAGES[searchParams.error] ?? "Could not create external job."
    : null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[16vh]">
      <div className="mx-auto max-w-5xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                External carrier job
              </p>

              <h1 className="mt-2 text-2xl font-semibold text-black">
                Add external job
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
                Capture a private carrier job that did not come through the
                Waste X marketplace. Waste X will create a private job record
                behind the scenes so it can still be tracked, reported and
                linked to receipts.
              </p>
            </div>

            <Link
              href="/home/operations/jobs"
              className="inline-flex rounded-full border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
            >
              Back to jobs
            </Link>
          </div>

          {errorMessage && (
            <div className="mt-6 rounded-3xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
              {errorMessage}
            </div>
          )}
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-[#f7f3ed]">
          <form action={createExternalCarrierJobAction} className="space-y-8">
            <FormSection
              eyebrow="Customer"
              title="Customer details"
              description="Who requested the collection or carrier movement?"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Customer name" required>
                  <input
                    name="externalCustomerName"
                    required
                    placeholder="Example: ACME Construction Ltd"
                    className={inputClass}
                  />
                </Field>

                <Field label="Customer reference">
                  <input
                    name="externalReference"
                    placeholder="Example: PO-1049"
                    className={inputClass}
                  />
                </Field>

                <Field label="Customer email">
                  <input
                    name="externalCustomerEmail"
                    type="email"
                    placeholder="customer@example.com"
                    className={inputClass}
                  />
                </Field>

                <Field label="Customer phone">
                  <input
                    name="externalCustomerPhone"
                    placeholder="Telephone number"
                    className={inputClass}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Movement"
              title="Pickup and destination"
              description="Record where the waste will be collected from and where it is going."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Pickup address" required>
                  <input
                    name="externalPickupAddress"
                    required
                    placeholder="Collection address"
                    className={inputClass}
                  />
                </Field>

                <Field label="Pickup postcode">
                  <input
                    name="externalPickupPostcode"
                    placeholder="Postcode"
                    className={inputClass}
                  />
                </Field>

                <Field label="Destination / receiver name">
                  <input
                    name="externalDestinationName"
                    placeholder="Example: Transfer Station"
                    className={inputClass}
                  />
                </Field>

                <Field label="Destination postcode">
                  <input
                    name="externalDestinationPostcode"
                    placeholder="Postcode"
                    className={inputClass}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Destination address">
                    <input
                      name="externalDestinationAddress"
                      placeholder="Destination address"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Waste"
              title="Waste details"
              description="Add the core waste details needed for the job record."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <Field label="Waste description" required>
                    <textarea
                      name="externalWasteDescription"
                      required
                      rows={4}
                      placeholder="Describe the waste being collected"
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="EWC code">
                  <input
                    name="externalEwcCode"
                    placeholder="Example: 17 09 04"
                    className={inputClass}
                  />
                </Field>

                <Field label="Estimated weight">
                  <input
                    name="externalEstimatedWeight"
                    inputMode="decimal"
                    placeholder="Example: 2.5"
                    className={inputClass}
                  />
                </Field>

                <Field label="Collection date">
                  <input
                    name="externalCollectionDate"
                    type="date"
                    className={inputClass}
                  />
                </Field>

                <Field label="Operating site">
                  <select name="siteId" className={inputClass}>
                    {activeSites.map((site) => (
                      <option key={site.id} value={site.id}>
                        {site.name}
                        {site.isDefault ? " — Default" : ""}
                        {" · "}
                        {getSiteTypeLabel(site.siteType)}
                      </option>
                    ))}
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Notes">
                    <textarea
                      name="externalNotes"
                      rows={4}
                      placeholder="Anything the team needs to know"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <div className="flex flex-col gap-3 border-t border-black/10 bg-white px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-black/45">
                This will create a private Waste X job record and immediately
                place it into your carrier jobs queue.
              </p>

              <button
                type="submit"
                className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Create external job
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}

function FormSection({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
          {eyebrow}
        </p>

        <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
          {description}
        </p>
      </div>

      {children}
    </section>
  );
}

function Field({
  label,
  required = false,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}
    </label>
  );
}