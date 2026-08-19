// src/app/home/sites/[siteId]/page.tsx

import Link from "next/link";

import {
  and,
  asc,
  desc,
  eq,
  ilike,
  or,
} from "drizzle-orm";

import {
  notFound,
  redirect,
} from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  ewcCodes,
  permitEwcCodes,
  sitePermits,
  sites,
  users,
} from "@/db/schema";

import {
  formatEwcCode,
  normaliseEwcCode,
} from "@/lib/ewc";

import {
  addPermitEwcCodeAction,
  createSitePermitAction,
  removePermitEwcCodeAction,
  updateReceivingSiteAction,
  updateSitePermitAction,
} from "../actions";

/* =========================================================
   TYPES
========================================================= */

type SearchParams = {
  q?: string | string[];
  error?: string | string[];
  success?: string | string[];
};

/* =========================================================
   HELPERS
========================================================= */

function firstParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function dateInputValue(
  value: Date | null,
) {
  if (!value) {
    return "";
  }

  return value
    .toISOString()
    .slice(0, 10);
}

function regulatorLabel(
  regulator: string,
) {
  const labels: Record<string, string> = {
    EA: "Environment Agency",
    NRW: "Natural Resources Wales",
    SEPA: "Scottish Environment Protection Agency",
    NIEA: "Northern Ireland Environment Agency",
    other: "Other",
  };

  return labels[regulator] ?? regulator;
}

function errorMessage(
  key: string,
) {
  const messages: Record<string, string> = {
    site_name_required:
      "Enter a receiving-site name.",

    duplicate_site_name:
      "A site with that name already exists.",

    permit_number_required:
      "Enter the permit or authorisation number.",

    duplicate_permit:
      "That authorisation is already stored for this site.",

    permit_not_found:
      "The permit could not be found.",

    ewc_not_found:
      "The selected EWC code could not be found.",

    missing_ewc_context:
      "Waste X could not determine which permit or EWC code to update.",

    receiving_site_already_exists:
      "This organisation already has a primary receiving site.",
  };

  return (
    messages[key] ??
    "Something went wrong."
  );
}

function successMessage(
  key: string,
) {
  const messages: Record<string, string> = {
    receiving_site_created:
      "Receiving site created.",

    receiving_site_updated:
      "Receiving site updated.",

    permit_created:
      "Environmental authorisation created.",

    permit_updated:
      "Environmental authorisation updated.",

    ewc_added:
      "EWC code added to the permit.",

    ewc_removed:
      "EWC code removed from the permit.",
  };

  return (
    messages[key] ??
    "Changes saved."
  );
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingSiteDetailPage({
  params,
  searchParams,
}: {
  params: {
    siteId: string;
  };

  searchParams: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser =
    await database.query.users.findFirst({
      where: eq(
        users.id,
        session.user.id,
      ),

      columns: {
        id: true,
        organisationId: true,
        role: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect(
      "/home/settings/organisation?reason=no-organisation",
    );
  }

  const organisationId =
    currentUser.organisationId;

  const siteId =
    params.siteId;

  const query = firstParam(
    searchParams.q,
  ).trim();

  const error = firstParam(
    searchParams.error,
  );

  const success = firstParam(
    searchParams.success,
  );

  const canEdit =
    currentUser.role ===
      "administrator" ||
    currentUser.role ===
      "seniorManagement";

  /* =======================================================
     SITE
  ======================================================= */

  const site =
    await database.query.sites.findFirst({
      where: and(
        eq(
          sites.id,
          siteId,
        ),

        eq(
          sites.organisationId,
          organisationId,
        ),
      ),
    });

  if (!site) {
    notFound();
  }

  /* =======================================================
     PRIMARY PERMIT
  ======================================================= */

  const permitRows =
    await database
      .select()
      .from(sitePermits)
      .where(
        and(
          eq(
            sitePermits.organisationId,
            organisationId,
          ),

          eq(
            sitePermits.siteId,
            site.id,
          ),
        ),
      )
      .orderBy(
        desc(
          sitePermits.isPrimary,
        ),

        desc(
          sitePermits.createdAt,
        ),
      )
      .limit(1);

  const permit =
    permitRows[0] ?? null;

  /* =======================================================
     ACCEPTED EWC CODES
  ======================================================= */

  const acceptedEwcCodes =
    permit
      ? await database
          .select({
            id: ewcCodes.id,
            code: ewcCodes.code,
            description:
              ewcCodes.description,
            isHazardous:
              ewcCodes.isHazardous,
            entryType:
              ewcCodes.entryType,
          })
          .from(permitEwcCodes)
          .innerJoin(
            ewcCodes,
            eq(
              permitEwcCodes.ewcCodeId,
              ewcCodes.id,
            ),
          )
          .where(
            and(
              eq(
                permitEwcCodes.permitId,
                permit.id,
              ),

              eq(
                permitEwcCodes.isActive,
                true,
              ),
            ),
          )
          .orderBy(
            asc(ewcCodes.code),
          )
      : [];

  const acceptedIds =
    new Set(
      acceptedEwcCodes.map(
        (record) => record.id,
      ),
    );

  /* =======================================================
     EWC SEARCH
  ======================================================= */

  let ewcSearchResults: Array<{
    id: string;
    code: string;
    description: string;
    isHazardous:
      | boolean
      | null;
    entryType:
      | string
      | null;
  }> = [];

  if (
    permit &&
    query.length > 0
  ) {
    const normalisedCode =
      normaliseEwcCode(query);

    /*
     * IMPORTANT:
     *
     * Text searches such as "soil" contain no EWC digits.
     *
     * normaliseEwcCode("soil") returns "".
     *
     * We therefore MUST NOT generate:
     *
     *   ILIKE '%%'
     *
     * against ewcCodes.code, because that would match every
     * EWC record.
     */
    const searchConditions = [
      ilike(
        ewcCodes.description,
        `%${query}%`,
      ),

      ilike(
        ewcCodes.chapterDescription,
        `%${query}%`,
      ),

      ilike(
        ewcCodes.subChapterDescription,
        `%${query}%`,
      ),

      ilike(
        ewcCodes.entryType,
        `%${query}%`,
      ),
    ];

    /*
     * Only search the canonical six-digit code column when
     * the user's search actually contains numeric EWC data.
     *
     * Examples:
     *
     * 17 05 04   -> 170504
     * 17-05-04   -> 170504
     * 17 05 03*  -> 170503
     */
    if (normalisedCode.length > 0) {
      searchConditions.unshift(
        ilike(
          ewcCodes.code,
          `%${normalisedCode}%`,
        ),
      );
    }

    ewcSearchResults =
      await database
        .select({
          id: ewcCodes.id,
          code: ewcCodes.code,
          description:
            ewcCodes.description,
          isHazardous:
            ewcCodes.isHazardous,
          entryType:
            ewcCodes.entryType,
        })
        .from(ewcCodes)
        .where(
          and(
            eq(
              ewcCodes.isActive,
              true,
            ),

            or(
              ...searchConditions,
            ),
          ),
        )
        .orderBy(
          asc(
            ewcCodes.code,
          ),
        )
        .limit(40);
  }

  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">

        {/* =================================================
            HEADER
        ================================================= */}

        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative">
            <Link
              href="/home/sites"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400 transition hover:text-orange-300"
            >
              ← Receiving Site
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold tracking-tight">
                {site.name}
              </h1>

              {site.isDefault && (
                <span className="rounded-full border border-orange-400/30 bg-orange-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-orange-300">
                  Primary destination
                </span>
              )}
            </div>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Manage the receiving
              destination, environmental
              authorisation and the EWC
              codes Waste X should allow
              against this permit.
            </p>
          </div>
        </section>

        {/* =================================================
            MESSAGES
        ================================================= */}

        {error && (
          <Message
            type="error"
          >
            {errorMessage(error)}
          </Message>
        )}

        {success && (
          <Message
            type="success"
          >
            {successMessage(
              success,
            )}
          </Message>
        )}

        {/* =================================================
            RECEIVING SITE
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Destination"
            title="Receiving Site"
            description="This is the normal destination Waste X will reuse automatically for incoming work."
          />

          <form
            action={
              updateReceivingSiteAction
            }
            className="mt-7 grid gap-5 lg:grid-cols-2"
          >
            <input
              type="hidden"
              name="siteId"
              value={site.id}
            />

            <Field
              label="Site name"
              name="name"
              defaultValue={
                site.name
              }
              required
              disabled={!canEdit}
            />

            <Field
              label="Postcode"
              name="postcode"
              defaultValue={
                site.postcode ?? ""
              }
              disabled={!canEdit}
            />

            <div className="lg:col-span-2">
              <Field
                label="Full address"
                name="fullAddress"
                defaultValue={
                  site.fullAddress ??
                  ""
                }
                disabled={!canEdit}
              />
            </div>

            <div className="lg:col-span-2 rounded-2xl bg-[#faf8f4] p-5">
              <div className="grid gap-4 md:grid-cols-3">
                <ReadOnlyDetail
                  label="Destination behaviour"
                  value="Automatic for normal incoming jobs"
                />

                <ReadOnlyDetail
                  label="Site type"
                  value="Waste receiving site"
                />

                <ReadOnlyDetail
                  label="Status"
                  value="Active"
                />
              </div>
            </div>

            {canEdit && (
              <div className="lg:col-span-2">
                <button
                  type="submit"
                  className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                >
                  Save Receiving Site
                </button>
              </div>
            )}
          </form>
        </section>

        {/* =================================================
            PERMIT
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Compliance"
            title="Environmental Authorisation"
            description="Store the permit, licence or exemption that authorises this site to receive waste."
          />

          {!permit ? (
            canEdit ? (
              <form
                action={
                  createSitePermitAction
                }
                className="mt-7 grid gap-5 lg:grid-cols-2"
              >
                <input
                  type="hidden"
                  name="siteId"
                  value={site.id}
                />

                <Field
                  label="Permit / authorisation number"
                  name="permitNumber"
                  placeholder="EPR/AB1234CD"
                  required
                />

                <SelectField
                  label="Regulator"
                  name="regulator"
                  defaultValue="EA"
                  options={[
                    {
                      value: "EA",
                      label:
                        "Environment Agency",
                    },
                    {
                      value: "NRW",
                      label:
                        "Natural Resources Wales",
                    },
                    {
                      value: "SEPA",
                      label:
                        "SEPA",
                    },
                    {
                      value: "NIEA",
                      label:
                        "NIEA",
                    },
                    {
                      value: "other",
                      label:
                        "Other",
                    },
                  ]}
                />

                <SelectField
                  label="Authorisation type"
                  name="authorisationType"
                  defaultValue="permit"
                  options={[
                    {
                      value:
                        "permit",
                      label:
                        "Permit",
                    },
                    {
                      value:
                        "licence",
                      label:
                        "Licence",
                    },
                    {
                      value:
                        "exemption",
                      label:
                        "Exemption",
                    },
                    {
                      value:
                        "other",
                      label:
                        "Other",
                    },
                  ]}
                />

                <Field
                  label="Valid from"
                  name="validFrom"
                  type="date"
                />

                <Field
                  label="Expiry date"
                  name="expiresAt"
                  type="date"
                />

                <div className="lg:col-span-2">
                  <TextArea
                    label="Notes"
                    name="notes"
                    placeholder="Optional internal notes..."
                  />
                </div>

                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                  >
                    Save Authorisation
                  </button>
                </div>
              </form>
            ) : (
              <EmptyState>
                An administrator needs
                to configure the site's
                environmental
                authorisation.
              </EmptyState>
            )
          ) : (
            <form
              action={
                updateSitePermitAction
              }
              className="mt-7 grid gap-5 lg:grid-cols-2"
            >
              <input
                type="hidden"
                name="siteId"
                value={site.id}
              />

              <input
                type="hidden"
                name="permitId"
                value={permit.id}
              />

              <Field
                label="Permit / authorisation number"
                name="permitNumber"
                defaultValue={
                  permit.permitNumber
                }
                required
                disabled={!canEdit}
              />

              <SelectField
                label="Regulator"
                name="regulator"
                defaultValue={
                  permit.regulator
                }
                disabled={!canEdit}
                options={[
                  {
                    value: "EA",
                    label:
                      "Environment Agency",
                  },
                  {
                    value: "NRW",
                    label:
                      "Natural Resources Wales",
                  },
                  {
                    value: "SEPA",
                    label:
                      "SEPA",
                  },
                  {
                    value: "NIEA",
                    label:
                      "NIEA",
                  },
                  {
                    value: "other",
                    label:
                      "Other",
                  },
                ]}
              />

              <SelectField
                label="Authorisation type"
                name="authorisationType"
                defaultValue={
                  permit.authorisationType
                }
                disabled={!canEdit}
                options={[
                  {
                    value:
                      "permit",
                    label: "Permit",
                  },
                  {
                    value:
                      "licence",
                    label:
                      "Licence",
                  },
                  {
                    value:
                      "exemption",
                    label:
                      "Exemption",
                  },
                  {
                    value: "other",
                    label: "Other",
                  },
                ]}
              />

              <SelectField
                label="Status"
                name="status"
                defaultValue={
                  permit.status
                }
                disabled={!canEdit}
                options={[
                  {
                    value:
                      "active",
                    label: "Active",
                  },
                  {
                    value:
                      "expired",
                    label:
                      "Expired",
                  },
                  {
                    value:
                      "suspended",
                    label:
                      "Suspended",
                  },
                  {
                    value:
                      "revoked",
                    label:
                      "Revoked",
                  },
                  {
                    value:
                      "unknown",
                    label:
                      "Unknown",
                  },
                ]}
              />

              <Field
                label="Valid from"
                name="validFrom"
                type="date"
                defaultValue={dateInputValue(
                  permit.validFrom,
                )}
                disabled={!canEdit}
              />

              <Field
                label="Expiry date"
                name="expiresAt"
                type="date"
                defaultValue={dateInputValue(
                  permit.expiresAt,
                )}
                disabled={!canEdit}
              />

              <div className="lg:col-span-2">
                <TextArea
                  label="Notes"
                  name="notes"
                  defaultValue={
                    permit.notes ?? ""
                  }
                  disabled={!canEdit}
                />
              </div>

              <div className="lg:col-span-2 rounded-2xl bg-[#faf8f4] p-5">
                <ReadOnlyDetail
                  label="Regulatory authority"
                  value={regulatorLabel(
                    permit.regulator,
                  )}
                />
              </div>

              {canEdit && (
                <div className="lg:col-span-2">
                  <button
                    type="submit"
                    className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400 transition hover:bg-black/85"
                  >
                    Update Authorisation
                  </button>
                </div>
              )}
            </form>
          )}
        </section>

        {/* =================================================
            PERMITTED EWC CODES
        ================================================= */}

        <section
          id="accepted-ewc"
          className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm"
        >
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <SectionTitle
              eyebrow="Permit scope"
              title="Accepted EWC Codes"
              description="These are the EWC codes Waste X should treat as configured against this receiving site's primary authorisation."
            />

            {permit && (
              <span className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400">
                {
                  acceptedEwcCodes.length
                }{" "}
                accepted
              </span>
            )}
          </div>

          {!permit ? (
            <EmptyState>
              Add the site's
              environmental
              authorisation before
              configuring accepted EWC
              codes.
            </EmptyState>
          ) : (
            <>
              {/* ===========================================
                  CURRENT ACCEPTED CODES
              =========================================== */}

              {acceptedEwcCodes.length ===
              0 ? (
                <EmptyState>
                  No EWC codes have been
                  configured against this
                  permit yet.
                </EmptyState>
              ) : (
                <div className="mt-7 overflow-hidden rounded-2xl border border-black/10">
                  <div className="divide-y divide-black/5">
                    {acceptedEwcCodes.map(
                      (record) => (
                        <div
                          key={
                            record.id
                          }
                          className="grid gap-4 bg-white px-5 py-4 md:grid-cols-[130px_1fr_auto] md:items-center"
                        >
                          <div>
                            <span className="font-mono text-base font-semibold text-black">
                              {formatEwcCode(
                                record.code,
                                record.isHazardous ===
                                  true,
                              )}
                            </span>
                          </div>

                          <div>
                            <p className="text-sm font-medium leading-6 text-black/70">
                              {
                                record.description
                              }
                            </p>

                            {record.entryType && (
                              <p className="mt-1 text-[11px] text-black/35">
                                {
                                  record.entryType
                                }
                              </p>
                            )}
                          </div>

                          {canEdit && (
                            <form
                              action={
                                removePermitEwcCodeAction
                              }
                            >
                              <input
                                type="hidden"
                                name="siteId"
                                value={
                                  site.id
                                }
                              />

                              <input
                                type="hidden"
                                name="permitId"
                                value={
                                  permit.id
                                }
                              />

                              <input
                                type="hidden"
                                name="ewcCodeId"
                                value={
                                  record.id
                                }
                              />

                              <button
                                type="submit"
                                className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                              >
                                Remove
                              </button>
                            </form>
                          )}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

              {/* ===========================================
                  SEARCH CATALOGUE
              =========================================== */}

              {canEdit && (
                <div className="mt-9 border-t border-black/10 pt-7">
                  <h3 className="text-lg font-semibold text-black">
                    Add EWC codes
                  </h3>

                  <p className="mt-2 text-sm text-black/45">
                    Search the Waste X
                    EWC reference catalogue.
                  </p>

                  <form
                    method="GET"
                    className="mt-5 flex gap-3"
                  >
                    <input
                      name="q"
                      defaultValue={
                        query
                      }
                      placeholder="Search 17 09 04, concrete, soil..."
                      className="h-12 flex-1 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
                    />

                    <button
                      type="submit"
                      className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400"
                    >
                      Search
                    </button>

                    {query && (
                      <Link
                        href={`/home/sites/${site.id}#accepted-ewc`}
                        className="grid h-12 place-items-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/50"
                      >
                        Clear
                      </Link>
                    )}
                  </form>

                  {query && (
                    <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
                      {ewcSearchResults.length ===
                      0 ? (
                        <div className="p-8 text-center text-sm text-black/45">
                          No matching EWC
                          codes found.
                        </div>
                      ) : (
                        <div className="divide-y divide-black/5">
                          {ewcSearchResults.map(
                            (
                              record,
                            ) => {
                              const alreadyAccepted =
                                acceptedIds.has(
                                  record.id,
                                );

                              return (
                                <div
                                  key={
                                    record.id
                                  }
                                  className="grid gap-4 px-5 py-4 md:grid-cols-[130px_1fr_auto] md:items-center"
                                >
                                  <div>
                                    <span className="font-mono font-semibold text-black">
                                      {formatEwcCode(
                                        record.code,
                                        record.isHazardous ===
                                          true,
                                      )}
                                    </span>
                                  </div>

                                  <div>
                                    <p className="text-sm leading-6 text-black/65">
                                      {
                                        record.description
                                      }
                                    </p>

                                    {record.isHazardous && (
                                      <span className="mt-2 inline-flex rounded-full bg-red-50 px-2.5 py-1 text-[10px] font-semibold uppercase text-red-700">
                                        Hazardous
                                      </span>
                                    )}
                                  </div>

                                  {alreadyAccepted ? (
                                    <span className="rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                                      Added
                                    </span>
                                  ) : (
                                    <form
                                      action={
                                        addPermitEwcCodeAction
                                      }
                                    >
                                      <input
                                        type="hidden"
                                        name="siteId"
                                        value={
                                          site.id
                                        }
                                      />

                                      <input
                                        type="hidden"
                                        name="permitId"
                                        value={
                                          permit.id
                                        }
                                      />

                                      <input
                                        type="hidden"
                                        name="ewcCodeId"
                                        value={
                                          record.id
                                        }
                                      />

                                      <input
                                        type="hidden"
                                        name="query"
                                        value={
                                          query
                                        }
                                      />

                                      <button
                                        type="submit"
                                        className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
                                      >
                                        + Add
                                      </button>
                                    </form>
                                  )}
                                </div>
                              );
                            },
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>

        {/* =================================================
            LOGIC SUMMARY
        ================================================= */}

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
            Waste X will use this
          </p>

          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <LogicCard
              number="01"
              title="Job"
              text="Normal incoming jobs use this receiving site automatically."
            />

            <LogicCard
              number="02"
              title="Material"
              text="A Material Profile's EWC can be checked against this permit."
            />

            <LogicCard
              number="03"
              title="DWT"
              text="Site address, authorisation and permitted EWC information can flow into DWT validation."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
        {eyebrow}
      </p>

      <h2 className="mt-2 text-2xl font-semibold text-black">
        {title}
      </h2>

      <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
        {description}
      </p>
    </div>
  );
}

function Field({
  label,
  name,
  defaultValue,
  placeholder,
  required = false,
  disabled = false,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>

      <input
        type={type}
        name={name}
        defaultValue={
          defaultValue
        }
        placeholder={
          placeholder
        }
        required={required}
        disabled={disabled}
        className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function TextArea({
  label,
  name,
  defaultValue,
  placeholder,
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>

      <textarea
        name={name}
        defaultValue={
          defaultValue
        }
        placeholder={
          placeholder
        }
        disabled={disabled}
        rows={4}
        className="w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
      />
    </label>
  );
}

function SelectField({
  label,
  name,
  defaultValue,
  options,
  disabled = false,
}: {
  label: string;
  name: string;
  defaultValue: string;

  options: Array<{
    value: string;
    label: string;
  }>;

  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.16em] text-black/40">
        {label}
      </span>

      <select
        name={name}
        defaultValue={
          defaultValue
        }
        disabled={disabled}
        className="h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none focus:border-orange-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {options.map(
          (option) => (
            <option
              key={
                option.value
              }
              value={
                option.value
              }
            >
              {option.label}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function ReadOnlyDetail({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.15em] text-black/30">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-black/65">
        {value}
      </p>
    </div>
  );
}

function EmptyState({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mt-7 rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] px-6 py-10 text-center text-sm leading-6 text-black/45">
      {children}
    </div>
  );
}

function Message({
  type,
  children,
}: {
  type: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        type === "success"
          ? "rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm font-medium text-green-800"
          : "rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-800"
      }
    >
      {children}
    </div>
  );
}

function LogicCard({
  number,
  title,
  text,
}: {
  number: string;
  title: string;
  text: string;
}) {
  return (
    <article className="rounded-2xl bg-white p-5">
      <span className="font-mono text-xs font-semibold text-orange-600">
        {number}
      </span>

      <h3 className="mt-3 font-semibold text-black">
        {title}
      </h3>

      <p className="mt-2 text-sm leading-6 text-black/45">
        {text}
      </p>
    </article>
  );
}