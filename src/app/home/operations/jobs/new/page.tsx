// src/app/home/operations/jobs/new/page.tsx

import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  organisations,
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
  searchParams?:
    | Promise<{
        error?: string;
      }>
    | {
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

function buildAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

export default async function NewCarrierJobPage({ searchParams }: PageProps) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const resolvedSearchParams = searchParams ? await searchParams : {};

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
      fullAddress: sites.fullAddress,
      postcode: sites.postcode,
      permitNumber: sites.permitNumber,
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

  const defaultSite = activeSites.find((site) => site.isDefault) ?? activeSites[0];

  const organisation = await database.query.organisations.findFirst({
    where: eq(organisations.id, currentUser.organisationId),
  });

  const receiverAddress =
    defaultSite?.fullAddress ??
    buildAddress([
      organisation?.streetAddress,
      organisation?.city,
      organisation?.region,
      organisation?.country,
    ]);

  const errorMessage = resolvedSearchParams?.error
    ? ERROR_MESSAGES[resolvedSearchParams.error] ?? "Could not create external job."
    : null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pb-10 pl-[22vw] pr-8 pt-[16vh]">
      <div className="mx-auto max-w-6xl space-y-8">
        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
                External job draft builder
              </p>

              <h1 className="mt-2 text-2xl font-semibold text-black">
                Add external job
              </h1>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
                Capture a private job that did not come through the Waste X
                marketplace. Waste X will create the operational job and start a
                draft DWT receipt so missing compliance fields can be completed
                later.
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

        <section className="rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-800">
          <p className="text-sm font-semibold">
            Tell Waste X what you know now.
          </p>

          <p className="mt-2 text-sm leading-6">
            Only customer name, pickup address and waste description are required
            to create the job. The DWT fields below make the draft smarter, but
            missing fields can still be completed later from receiving intake.
          </p>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-[#f7f3ed]">
          <form action={createExternalCarrierJobAction} className="space-y-8">
            <FormSection
              eyebrow="Step 1"
              title="Customer / producer"
              description="Who requested the collection or waste movement?"
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

                <Field
                  label="Customer reference"
                  helper="PO number, weighbridge ticket, customer job number or WTN reference."
                >
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
              eyebrow="Step 2"
              title="Pickup and receiving destination"
              description="Record where the waste starts and where the waste will be received."
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
                    placeholder="Example: Waste X Transfer Station"
                    defaultValue={defaultSite?.name ?? organisation?.teamName ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field label="Destination postcode">
                  <input
                    name="externalDestinationPostcode"
                    placeholder="Postcode"
                    defaultValue={defaultSite?.postcode ?? organisation?.postCode ?? ""}
                    className={inputClass}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Destination address">
                    <input
                      name="externalDestinationAddress"
                      placeholder="Destination address"
                      defaultValue={receiverAddress}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Step 3"
              title="Waste item"
              description="Add the first waste item. You can refine or add more items later in DWT intake."
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

                <Field
                  label="EWC code"
                  helper="Example: 17 09 04 for mixed construction and demolition waste."
                >
                  <input
                    name="externalEwcCode"
                    placeholder="Example: 17 09 04"
                    className={inputClass}
                  />
                </Field>

                <Field label="Physical form">
                  <select name="physicalForm" className={inputClass} defaultValue="">
                    <option value="">Choose if known</option>
                    <option value="Solid">Solid</option>
                    <option value="Liquid">Liquid</option>
                    <option value="Sludge">Sludge</option>
                    <option value="Powder">Powder</option>
                    <option value="Gas">Gas</option>
                    <option value="Mixed">Mixed</option>
                  </select>
                </Field>

                <Field label="Container type">
                  <input
                    name="typeOfContainers"
                    placeholder="Example: skip, bag, drum, loose load"
                    className={inputClass}
                  />
                </Field>

                <Field label="Number of containers">
                  <input
                    name="numberOfContainers"
                    inputMode="numeric"
                    placeholder="Example: 1"
                    className={inputClass}
                  />
                </Field>

                <Field label="Estimated weight amount">
                  <input
                    name="externalEstimatedWeight"
                    inputMode="decimal"
                    placeholder="Example: 2.5"
                    className={inputClass}
                  />
                </Field>

                <Field label="Weight unit">
                  <select
                    name="weightMetric"
                    className={inputClass}
                    defaultValue="Tonnes"
                  >
                    <option value="Tonnes">Tonnes</option>
                    <option value="Kilograms">Kilograms</option>
                    <option value="Grams">Grams</option>
                  </select>
                </Field>

                <Field label="Weight type">
                  <select
                    name="weightIsEstimate"
                    className={inputClass}
                    defaultValue="estimate"
                  >
                    <option value="estimate">Estimated weight</option>
                    <option value="actual">Actual weight</option>
                  </select>
                </Field>

                <Field
                  label="Disposal or recovery code"
                  helper="Optional for now. Example: R5, R13, D15."
                >
                  <input
                    name="disposalOrRecoveryCode"
                    placeholder="Example: R5"
                    className={inputClass}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Step 4"
              title="Hazardous / POPs check"
              description="Keep this simple for the user. If they are not sure, the DWT intake page can finish the details later."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Could this waste be hazardous?">
                  <select
                    name="containsHazardous"
                    className={inputClass}
                    defaultValue="no"
                  >
                    <option value="no">No / not expected</option>
                    <option value="yes">Yes</option>
                    <option value="unknown">Not sure — review later</option>
                  </select>
                </Field>

                <Field label="Could this waste contain POPs?">
                  <select name="containsPops" className={inputClass} defaultValue="no">
                    <option value="no">No / not expected</option>
                    <option value="yes">Yes</option>
                    <option value="unknown">Not sure — review later</option>
                  </select>
                </Field>

                <Field label="Hazardous consignment code">
                  <input
                    name="hazardousWasteConsignmentCode"
                    placeholder="Only if applicable"
                    className={inputClass}
                  />
                </Field>

                <Field label="Reason if no consignment code">
                  <select
                    name="reasonForNoConsignmentCode"
                    className={inputClass}
                    defaultValue=""
                  >
                    <option value="">Choose if applicable</option>
                    <option value="NON_HAZ_WASTE_TRANSFER">
                      Non-hazardous waste transfer
                    </option>
                    <option value="NO_DOC_WITH_WASTE">
                      No document came with the waste
                    </option>
                    <option value="HWRC_RECEIPT">
                      Household waste recycling centre receipt
                    </option>
                  </select>
                </Field>

                <div className="md:col-span-2">
                  <Field label="Special handling requirements">
                    <textarea
                      name="specialHandlingRequirements"
                      rows={3}
                      placeholder="Access notes, contamination concerns, PPE, quarantine instructions, or anything the receiver should know"
                      className={inputClass}
                    />
                  </Field>
                </div>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Step 5"
              title="Carrier and transport"
              description="Who is moving the waste? If your organisation is doing it, Waste X can use your organisation details as the draft."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Carrier organisation name">
                  <input
                    name="carrierOrganisationName"
                    placeholder="Carrier name"
                    defaultValue={organisation?.teamName ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field label="Carrier registration number">
                  <input
                    name="carrierRegistrationNumber"
                    placeholder="Waste carrier registration number"
                    className={inputClass}
                  />
                </Field>

                <Field label="Reason if no carrier registration">
                  <select
                    name="carrierReasonForNoRegistrationNumber"
                    className={inputClass}
                    defaultValue=""
                  >
                    <option value="">Choose if applicable</option>
                    <option value="ON_SITE">Moved on site</option>
                    <option value="HOUSEHOLD">Household waste</option>
                    <option value="ONE_OFF">One-off movement</option>
                    <option value="MARINE">Marine movement</option>
                  </select>
                </Field>

                <Field label="Means of transport">
                  <select
                    name="carrierMeansOfTransport"
                    className={inputClass}
                    defaultValue="Road"
                  >
                    <option value="Road">Road</option>
                    <option value="Rail">Rail</option>
                    <option value="Air">Air</option>
                    <option value="Sea">Sea</option>
                    <option value="Inland Waterway">Inland Waterway</option>
                    <option value="Piped">Piped</option>
                    <option value="Other">Other</option>
                  </select>
                </Field>

                <Field label="Vehicle registration">
                  <input
                    name="carrierVehicleRegistration"
                    placeholder="Example: AB12 CDE"
                    className={inputClass}
                  />
                </Field>

                <Field label="Carrier postcode">
                  <input
                    name="carrierPostcode"
                    placeholder="Postcode"
                    defaultValue={organisation?.postCode ?? ""}
                    className={inputClass}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Carrier full address">
                    <input
                      name="carrierFullAddress"
                      placeholder="Carrier address"
                      defaultValue={buildAddress([
                        organisation?.streetAddress,
                        organisation?.city,
                        organisation?.region,
                        organisation?.country,
                      ])}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Carrier email">
                  <input
                    name="carrierEmailAddress"
                    type="email"
                    placeholder="carrier@example.com"
                    defaultValue={organisation?.emailAddress ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field label="Carrier phone">
                  <input
                    name="carrierPhoneNumber"
                    placeholder="Telephone number"
                    defaultValue={organisation?.telephone ?? ""}
                    className={inputClass}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Step 6"
              title="Receiving site details"
              description="These details are used to start the draft DWT receipt record."
            >
              <div className="grid gap-4 md:grid-cols-2">
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

                <Field label="Receiver site name">
                  <input
                    name="receiverSiteName"
                    placeholder="Receiving site"
                    defaultValue={defaultSite?.name ?? organisation?.teamName ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field
                  label="Receiver permit / authorisation number"
                  helper="This can also come from your site settings."
                >
                  <input
                    name="receiverAuthorisationNumber"
                    placeholder="Permit, exemption or authorisation number"
                    defaultValue={defaultSite?.permitNumber ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field label="Receipt postcode">
                  <input
                    name="receiptPostcode"
                    placeholder="Postcode"
                    defaultValue={defaultSite?.postcode ?? organisation?.postCode ?? ""}
                    className={inputClass}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Receipt full address">
                    <input
                      name="receiptFullAddress"
                      placeholder="Receipt address"
                      defaultValue={receiverAddress}
                      className={inputClass}
                    />
                  </Field>
                </div>

                <Field label="Receiver email">
                  <input
                    name="receiverEmailAddress"
                    type="email"
                    placeholder="receiver@example.com"
                    defaultValue={organisation?.emailAddress ?? ""}
                    className={inputClass}
                  />
                </Field>

                <Field label="Receiver phone">
                  <input
                    name="receiverPhoneNumber"
                    placeholder="Telephone number"
                    defaultValue={organisation?.telephone ?? ""}
                    className={inputClass}
                  />
                </Field>
              </div>
            </FormSection>

            <FormSection
              eyebrow="Step 7"
              title="References and notes"
              description="Optional notes that help the operational and compliance team."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Your unique DWT reference">
                  <input
                    name="yourUniqueReference"
                    placeholder="Example: WX-JOB-001"
                    className={inputClass}
                  />
                </Field>

                <div className="md:col-span-2">
                  <Field label="Internal notes">
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
                This will create a private external job and start a draft DWT
                receipt. Missing fields can be completed later in receiving
                intake.
              </p>

              <button
                type="submit"
                className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Create external job + DWT draft
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
  helper,
  required = false,
  children,
}: {
  label: string;
  helper?: string;
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

      {helper && (
        <span className="mt-2 block text-xs leading-5 text-black/35">
          {helper}
        </span>
      )}
    </label>
  );
}