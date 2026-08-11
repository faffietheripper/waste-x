// src/app/home/settings/sites/page.tsx

import { asc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { sites, users, type SiteStatus, type SiteType } from "@/db/schema";
import {
  getSiteStatusLabel,
  getSiteTypeLabel,
} from "@/modules/sites/core/siteTypes";

import {
  archiveSiteAction,
  createSiteAction,
  setDefaultSiteAction,
  updateSiteAction,
} from "./actions";

type PageProps = {
  searchParams?: {
    success?: string;
    error?: string;
  };
};

const SITE_TYPE_OPTIONS: Array<{
  value: SiteType;
  label: string;
}> = [
  { value: "main_site", label: "Main Site" },
  { value: "transfer_station", label: "Transfer Station" },
  { value: "depot", label: "Depot" },
  { value: "recycling_yard", label: "Recycling Yard" },
  { value: "construction_site", label: "Construction Site" },
  { value: "customer_site", label: "Customer Site" },
  { value: "other", label: "Other" },
];

const SITE_STATUS_OPTIONS: Array<{
  value: SiteStatus;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
];

const SUCCESS_MESSAGES: Record<string, string> = {
  site_created: "Site created successfully.",
  site_updated: "Site updated successfully.",
  default_site_updated: "Default site updated successfully.",
  site_archived: "Site archived successfully.",
};

const ERROR_MESSAGES: Record<string, string> = {
  account: "Your account is not linked to an active organisation.",
  permission: "Only administrators and senior management can manage sites.",
  site_name_required: "Site name is required.",
  duplicate_site_name: "A site with this name already exists.",
  missing_site_id: "Site ID was missing.",
  site_not_found: "Site not found.",
  default_site_must_stay_active: "The default site must stay active.",
  archived_site_cannot_be_default: "Archived sites cannot be made the default.",
  cannot_archive_default_site: "You cannot archive the default site.",
};

export default async function SitesSettingsPage({ searchParams }: PageProps) {
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
      role: true,
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

  const canManageSites =
    currentUser.role === "administrator" ||
    currentUser.role === "seniorManagement";

  const organisationSites = await database
    .select()
    .from(sites)
    .where(eq(sites.organisationId, currentUser.organisationId))
    .orderBy(asc(sites.isDefault), asc(sites.name));

  const activeSites = organisationSites.filter(
    (site) => site.status === "active",
  );

  const archivedSites = organisationSites.filter(
    (site) => site.status === "archived",
  );

  const successMessage = searchParams?.success
    ? SUCCESS_MESSAGES[searchParams.success]
    : null;

  const errorMessage = searchParams?.error
    ? ERROR_MESSAGES[searchParams.error]
    : null;

  return (
    <main className="space-y-8">
      <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Organisation sites
            </p>

            <h1 className="mt-2 text-2xl font-semibold text-black">
              Sites
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
              Manage the sites, depots, yards or customer locations used by your
              organisation. Small businesses can keep one Main Site, while
              larger operators can add multiple sites for reporting and
              filtering.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-black/10 bg-[#f7f3ed] p-5 sm:grid-cols-3 lg:min-w-[420px]">
            <Stat label="Total sites" value={organisationSites.length} />
            <Stat label="Active" value={activeSites.length} />
            <Stat label="Archived" value={archivedSites.length} />
          </div>
        </div>

        {(successMessage || errorMessage) && (
          <div
            className={`mt-6 rounded-3xl border px-5 py-4 text-sm font-medium ${
              successMessage
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-700"
            }`}
          >
            {successMessage ?? errorMessage}
          </div>
        )}

        {!canManageSites && (
          <div className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm leading-6 text-orange-800">
            You can view organisation sites, but only administrators and senior
            management can add, edit, archive or set default sites.
          </div>
        )}
      </section>

      {canManageSites && (
        <section className="rounded-[2rem] border border-black/10 bg-[#f7f3ed] p-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Add site
            </p>

            <h2 className="mt-2 text-xl font-semibold text-black">
              Add another site
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              Use this for additional depots, transfer stations, recycling
              yards, construction sites or customer sites.
            </p>
          </div>

          <form action={createSiteAction} className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label="Site name" required>
              <input
                name="name"
                required
                placeholder="Example: Ipswich Depot"
                className={inputClass}
              />
            </Field>

            <Field label="Site type" required>
              <select name="siteType" defaultValue="depot" className={inputClass}>
                {SITE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Full address">
              <input
                name="fullAddress"
                placeholder="Full site address"
                className={inputClass}
              />
            </Field>

            <Field label="Postcode">
              <input
                name="postcode"
                placeholder="Postcode"
                className={inputClass}
              />
            </Field>

            <Field label="Permit, licence or authorisation number">
              <input
                name="permitNumber"
                placeholder="Optional"
                className={inputClass}
              />
            </Field>

            <div className="flex items-end">
              <button
                type="submit"
                className="w-full rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Add site
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="space-y-5">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Existing sites
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Manage organisation sites
          </h2>
        </div>

        {organisationSites.length === 0 && (
          <EmptyState
            title="No sites found"
            text="No sites exist for this organisation yet. Add a Main Site to start using site-level records."
          />
        )}

        {organisationSites.map((site) => {
          const isArchived = site.status === "archived";

          return (
            <article
              key={site.id}
              className={`rounded-[2rem] border p-6 shadow-sm ${
                isArchived
                  ? "border-black/10 bg-black/5 opacity-70"
                  : "border-black/10 bg-white"
              }`}
            >
              <div className="flex flex-col gap-4 border-b border-black/10 pb-5 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-lg font-semibold text-black">
                      {site.name}
                    </h3>

                    {site.isDefault && (
                      <span className="rounded-full bg-black px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-orange-400">
                        Default
                      </span>
                    )}

                    <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/50">
                      {getSiteStatusLabel(site.status)}
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-black/45">
                    {getSiteTypeLabel(site.siteType)}
                  </p>

                  <p className="mt-2 max-w-2xl text-sm leading-6 text-black/55">
                    {[site.fullAddress, site.postcode]
                      .filter(Boolean)
                      .join(", ") || "No address added yet."}
                  </p>

                  {site.permitNumber && (
                    <p className="mt-2 text-sm text-black/55">
                      Permit / authorisation:{" "}
                      <span className="font-semibold text-black">
                        {site.permitNumber}
                      </span>
                    </p>
                  )}
                </div>

                {canManageSites && !isArchived && (
                  <div className="flex flex-wrap gap-2">
                    {!site.isDefault && (
                      <form action={setDefaultSiteAction}>
                        <input type="hidden" name="siteId" value={site.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-black/60 transition hover:border-orange-300 hover:text-orange-600"
                        >
                          Set default
                        </button>
                      </form>
                    )}

                    {!site.isDefault && (
                      <form action={archiveSiteAction}>
                        <input type="hidden" name="siteId" value={site.id} />
                        <button
                          type="submit"
                          className="rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        >
                          Archive
                        </button>
                      </form>
                    )}
                  </div>
                )}
              </div>

              {canManageSites && !isArchived && (
                <form
                  action={updateSiteAction}
                  className="mt-5 grid gap-4 md:grid-cols-2"
                >
                  <input type="hidden" name="siteId" value={site.id} />

                  <Field label="Site name" required>
                    <input
                      name="name"
                      required
                      defaultValue={site.name}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Site type" required>
                    <select
                      name="siteType"
                      defaultValue={site.siteType}
                      className={inputClass}
                    >
                      {SITE_TYPE_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <Field label="Full address">
                    <input
                      name="fullAddress"
                      defaultValue={site.fullAddress ?? ""}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Postcode">
                    <input
                      name="postcode"
                      defaultValue={site.postcode ?? ""}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Permit, licence or authorisation number">
                    <input
                      name="permitNumber"
                      defaultValue={site.permitNumber ?? ""}
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Status">
                    <select
                      name="status"
                      defaultValue={site.status === "archived" ? "inactive" : site.status}
                      disabled={site.isDefault}
                      className={`${inputClass} ${
                        site.isDefault ? "cursor-not-allowed bg-black/5" : ""
                      }`}
                    >
                      {SITE_STATUS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2">
                    <button
                      type="submit"
                      className="rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/80"
                    >
                      Save site changes
                    </button>
                  </div>
                </form>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

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

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>

      <p className="mt-2 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-black/15 bg-white p-8 text-center">
      <h3 className="text-lg font-semibold text-black">{title}</h3>

      <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
        {text}
      </p>
    </div>
  );
}