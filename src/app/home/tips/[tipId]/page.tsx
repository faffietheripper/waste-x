import Link from "next/link";
import {
  notFound,
  redirect,
} from "next/navigation";

import {
  and,
  asc,
  eq,
  ilike,
  or,
} from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  counterparties,
  counterpartySites,
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  ewcCodes,
  users,
} from "@/db/schema";

import {
  formatEwcCode,
  normaliseEwcCode,
} from "@/lib/ewc";

import {
  addExternalFacilityEwcCodeAction,
  archiveExternalFacilityAction,
  removeExternalFacilityEwcCodeAction,
  restoreExternalFacilityAction,
  updateExternalFacilityAction,
  updateExternalFacilityAuthorisationAction,
} from "../actions";

/* =========================================================
   HELPERS
========================================================= */

function first(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function dateInput(
  value: Date | null,
) {
  return value
    ? value.toISOString().slice(0, 10)
    : "";
}

function successMessage(
  value: string,
) {
  const map: Record<string, string> = {
    created:
      "Third-party facility created. Configure its permitted EWC codes below.",

    facility_updated:
      "Facility details updated.",

    authorisation_updated:
      "Environmental authorisation updated.",

    ewc_added:
      "EWC code added to this facility's authorisation.",

    ewc_removed:
      "EWC code removed from this facility's authorisation.",

    archived:
      "Facility archived.",

    restored:
      "Facility restored.",
  };

  return (
    map[value] ??
    "Changes saved."
  );
}

function errorMessage(
  value: string,
) {
  const map: Record<string, string> = {
    operator_required:
      "Enter the facility operator/company name.",

    facility_required:
      "Enter the facility/site name.",

    duplicate_facility:
      "That operator already has a facility with this name.",

    authorisation_required:
      "Enter the permit, licence or exemption number.",

    authorisation_not_found:
      "The environmental authorisation could not be found.",

    ewc_not_found:
      "The selected EWC code could not be found.",
  };

  return (
    map[value] ??
    "Something went wrong."
  );
}

function regulatorLabel(
  value: string,
) {
  const map: Record<string, string> = {
    EA: "Environment Agency",
    NRW: "Natural Resources Wales",
    SEPA: "SEPA",
    NIEA: "NIEA",
    other: "Other",
  };

  return map[value] ?? value;
}

/* =========================================================
   PAGE
========================================================= */

export default async function ThirdPartyFacilityDetailPage({
  params,
  searchParams,
}: {
  params: {
    tipId: string;
  };

  searchParams: {
    q?: string | string[];
    success?: string | string[];
    error?: string | string[];
  };
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
        organisationId: true,
      },
    });

  if (!currentUser?.organisationId) {
    redirect("/home");
  }

  const organisationId =
    currentUser.organisationId;

  /* =======================================================
     FACILITY
  ======================================================= */

  const facilityRows =
    await database
      .select({
        id: counterpartySites.id,
        operatorId:
          counterparties.id,
        operatorName:
          counterparties.name,
        name:
          counterpartySites.name,
        fullAddress:
          counterpartySites.fullAddress,
        postcode:
          counterpartySites.postcode,
        contactName:
          counterpartySites.contactName,
        contactEmail:
          counterpartySites.contactEmail,
        contactTelephone:
          counterpartySites.contactTelephone,
        notes:
          counterpartySites.notes,
        isActive:
          counterpartySites.isActive,
      })
      .from(counterpartySites)
      .innerJoin(
        counterparties,
        eq(
          counterpartySites.counterpartyId,
          counterparties.id,
        ),
      )
      .where(
        and(
          eq(
            counterpartySites.id,
            params.tipId,
          ),

          eq(
            counterpartySites.organisationId,
            organisationId,
          ),

          eq(
            counterpartySites.siteType,
            "third_party_tip",
          ),
        ),
      )
      .limit(1);

  const facility =
    facilityRows[0];

  if (!facility) {
    notFound();
  }

  /* =======================================================
     AUTHORISATION
  ======================================================= */

  const authorisation =
    await database.query.counterpartySiteAuthorisations.findFirst(
      {
        where: and(
          eq(
            counterpartySiteAuthorisations.organisationId,
            organisationId,
          ),

          eq(
            counterpartySiteAuthorisations.counterpartySiteId,
            facility.id,
          ),

          eq(
            counterpartySiteAuthorisations.isPrimary,
            true,
          ),
        ),
      },
    );

  if (!authorisation) {
    throw new Error(
      "Third-party facility is missing its primary authorisation record.",
    );
  }

  /* =======================================================
     ACCEPTED EWC
  ======================================================= */

  const acceptedEwc =
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
      .from(
        counterpartySiteEwcCodes,
      )
      .innerJoin(
        ewcCodes,
        eq(
          counterpartySiteEwcCodes.ewcCodeId,
          ewcCodes.id,
        ),
      )
      .where(
        and(
          eq(
            counterpartySiteEwcCodes.authorisationId,
            authorisation.id,
          ),

          eq(
            counterpartySiteEwcCodes.isActive,
            true,
          ),
        ),
      )
      .orderBy(
        asc(ewcCodes.code),
      );

  const acceptedIds =
    new Set(
      acceptedEwc.map(
        (item) => item.id,
      ),
    );

  /* =======================================================
     SEARCH
  ======================================================= */

  const query =
    first(
      searchParams.q,
    ).trim();

  let searchResults: Array<{
    id: string;
    code: string;
    description: string;
    isHazardous:
      | boolean
      | null;
  }> = [];

  if (query) {
    const normalisedCode =
      normaliseEwcCode(query);

    /*
     * Text searches MUST NOT generate a code ILIKE '%%'.
     *
     * Example:
     *
     * normaliseEwcCode("soil") === ""
     *
     * So code searching is only included when numeric
     * characters exist.
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

    if (
      normalisedCode.length > 0
    ) {
      searchConditions.unshift(
        ilike(
          ewcCodes.code,
          `%${normalisedCode}%`,
        ),
      );
    }

    searchResults =
      await database
        .select({
          id: ewcCodes.id,
          code: ewcCodes.code,
          description:
            ewcCodes.description,
          isHazardous:
            ewcCodes.isHazardous,
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

  const success =
    first(
      searchParams.success,
    );

  const error =
    first(
      searchParams.error,
    );

  const verified =
    Boolean(
      authorisation.verifiedAt &&
        authorisation.verificationSource,
    );

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
              href="/home/tips"
              className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-400"
            >
              ← Third-Party Facilities
            </Link>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <h1 className="text-4xl font-semibold">
                {facility.name}
              </h1>

              {!facility.isActive && (
                <Badge
                  label="Archived"
                  tone="neutral"
                />
              )}

              <Badge
                label={
                  verified
                    ? "Verification recorded"
                    : "Not verified"
                }
                tone={
                  verified
                    ? "good"
                    : "warn"
                }
              />
            </div>

            <p className="mt-3 text-sm text-white/55">
              Operated by{" "}
              {facility.operatorName}
            </p>
          </div>
        </section>

        {/* =================================================
            MESSAGES
        ================================================= */}

        {success && (
          <Message type="success">
            {successMessage(
              success,
            )}
          </Message>
        )}

        {error && (
          <Message type="error">
            {errorMessage(
              error,
            )}
          </Message>
        )}

        {/* =================================================
            STATS
        ================================================= */}

        <section className="grid gap-4 md:grid-cols-3">
          <Stat
            label="Operator"
            value={
              facility.operatorName
            }
          />

          <Stat
            label="Authorisation"
            value={
              authorisation.authorisationNumber
            }
          />

          <Stat
            label="Permitted EWC"
            value={String(
              acceptedEwc.length,
            )}
          />
        </section>

        {/* =================================================
            FACILITY
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Facility"
            title="Operator & Site Details"
            description="This is an external destination operated by another waste business."
          />

          <form
            action={
              updateExternalFacilityAction
            }
            className="mt-7 grid gap-5 md:grid-cols-2"
          >
            <input
              type="hidden"
              name="facilityId"
              value={
                facility.id
              }
            />

            <input
              type="hidden"
              name="operatorId"
              value={
                facility.operatorId
              }
            />

            <Field
              label="Operator / company"
              name="operatorName"
              defaultValue={
                facility.operatorName
              }
              required
            />

            <Field
              label="Facility / site name"
              name="facilityName"
              defaultValue={
                facility.name
              }
              required
            />

            <div className="md:col-span-2">
              <Field
                label="Full address"
                name="fullAddress"
                defaultValue={
                  facility.fullAddress ??
                  ""
                }
              />
            </div>

            <Field
              label="Postcode"
              name="postcode"
              defaultValue={
                facility.postcode ??
                ""
              }
            />

            <Field
              label="Site contact"
              name="contactName"
              defaultValue={
                facility.contactName ??
                ""
              }
            />

            <Field
              label="Contact email"
              name="contactEmail"
              type="email"
              defaultValue={
                facility.contactEmail ??
                ""
              }
            />

            <Field
              label="Contact telephone"
              name="contactTelephone"
              defaultValue={
                facility.contactTelephone ??
                ""
              }
            />

            <div className="md:col-span-2">
              <Field
                label="Internal notes"
                name="notes"
                defaultValue={
                  facility.notes ?? ""
                }
              />
            </div>

            {facility.isActive && (
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
                >
                  Save Facility
                </button>
              </div>
            )}
          </form>
        </section>

        {/* =================================================
            AUTHORISATION
        ================================================= */}

        <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
          <SectionTitle
            eyebrow="Compliance"
            title="Environmental Authorisation"
            description="Record the external facility's permit, licence or exemption and how you checked it."
          />

          <form
            action={
              updateExternalFacilityAuthorisationAction
            }
            className="mt-7 grid gap-5 md:grid-cols-2"
          >
            <input
              type="hidden"
              name="facilityId"
              value={
                facility.id
              }
            />

            <input
              type="hidden"
              name="authorisationId"
              value={
                authorisation.id
              }
            />

            <Field
              label="Authorisation number"
              name="authorisationNumber"
              defaultValue={
                authorisation.authorisationNumber
              }
              required
            />

            <Select
              label="Regulator"
              name="regulator"
              defaultValue={
                authorisation.regulator
              }
              options={[
                [
                  "EA",
                  "Environment Agency",
                ],
                [
                  "NRW",
                  "Natural Resources Wales",
                ],
                [
                  "SEPA",
                  "SEPA",
                ],
                [
                  "NIEA",
                  "NIEA",
                ],
                [
                  "other",
                  "Other",
                ],
              ]}
            />

            <Select
              label="Authorisation type"
              name="authorisationType"
              defaultValue={
                authorisation.authorisationType
              }
              options={[
                [
                  "permit",
                  "Permit",
                ],
                [
                  "licence",
                  "Licence",
                ],
                [
                  "exemption",
                  "Exemption",
                ],
                [
                  "other",
                  "Other",
                ],
              ]}
            />

            <Select
              label="Status"
              name="status"
              defaultValue={
                authorisation.status
              }
              options={[
                [
                  "active",
                  "Active",
                ],
                [
                  "unknown",
                  "Unknown / not checked",
                ],
                [
                  "expired",
                  "Expired",
                ],
                [
                  "suspended",
                  "Suspended",
                ],
                [
                  "revoked",
                  "Revoked",
                ],
              ]}
            />

            <Field
              label="Valid from"
              name="validFrom"
              type="date"
              defaultValue={dateInput(
                authorisation.validFrom,
              )}
            />

            <Field
              label="Expiry date"
              name="expiresAt"
              type="date"
              defaultValue={dateInput(
                authorisation.expiresAt,
              )}
            />

            <Field
              label="Verification source"
              name="verificationSource"
              defaultValue={
                authorisation.verificationSource ??
                ""
              }
              placeholder="EA register / permit PDF / other source"
            />

            <Field
              label="Verified on"
              name="verifiedAt"
              type="date"
              defaultValue={dateInput(
                authorisation.verifiedAt,
              )}
            />

            <div className="md:col-span-2">
              <Field
                label="Authorisation notes"
                name="authorisationNotes"
                defaultValue={
                  authorisation.notes ??
                  ""
                }
              />
            </div>

            <div className="md:col-span-2 rounded-2xl bg-[#faf8f4] p-5">
              <div className="grid gap-5 md:grid-cols-3">
                <Detail
                  label="Regulator"
                  value={regulatorLabel(
                    authorisation.regulator,
                  )}
                />

                <Detail
                  label="Status"
                  value={
                    authorisation.status
                  }
                />

                <Detail
                  label="Verification"
                  value={
                    verified
                      ? `${authorisation.verificationSource} · ${dateInput(
                          authorisation.verifiedAt,
                        )}`
                      : "Not recorded"
                  }
                />
              </div>
            </div>

            {facility.isActive && (
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded-2xl bg-black px-6 py-3 text-sm font-semibold text-orange-400"
                >
                  Save Authorisation
                </button>
              </div>
            )}
          </form>
        </section>

        {/* =================================================
            PERMITTED EWC
        ================================================= */}

        <section
          id="permitted-ewc"
          className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm"
        >
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <SectionTitle
              eyebrow="Permit Scope"
              title="Permitted EWC Codes"
              description="Store the waste codes you have confirmed this external facility is authorised to receive."
            />

            <span className="shrink-0 rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400">
              {acceptedEwc.length}{" "}
              configured
            </span>
          </div>

          {acceptedEwc.length ===
          0 ? (
            <div className="mt-7 rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] p-8 text-center text-sm text-black/45">
              No permitted EWC codes
              configured yet.
            </div>
          ) : (
            <div className="mt-7 overflow-hidden rounded-2xl border border-black/10">
              <div className="divide-y divide-black/5">
                {acceptedEwc.map(
                  (record) => (
                    <div
                      key={
                        record.id
                      }
                      className="grid gap-4 px-5 py-4 md:grid-cols-[130px_1fr_auto] md:items-center"
                    >
                      <span className="font-mono font-semibold">
                        {formatEwcCode(
                          record.code,
                          record.isHazardous ===
                            true,
                        )}
                      </span>

                      <div>
                        <p className="text-sm leading-6 text-black/65">
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

                      {facility.isActive && (
                        <form
                          action={
                            removeExternalFacilityEwcCodeAction
                          }
                        >
                          <input
                            type="hidden"
                            name="facilityId"
                            value={
                              facility.id
                            }
                          />

                          <input
                            type="hidden"
                            name="authorisationId"
                            value={
                              authorisation.id
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
                            className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700"
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

          {/* ===============================================
              SEARCH EWC CATALOGUE
          =============================================== */}

          {facility.isActive && (
            <div className="mt-9 border-t border-black/10 pt-7">
              <h3 className="text-lg font-semibold">
                Add permitted EWC codes
              </h3>

              <p className="mt-2 text-sm text-black/45">
                Search the Waste X EWC
                catalogue, then add only
                codes you have confirmed
                are covered by this
                facility's authorisation.
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
                  placeholder="Search 17 09 04, soil, concrete..."
                  className={
                    inputClass
                  }
                />

                <button
                  type="submit"
                  className="rounded-2xl bg-black px-6 text-sm font-semibold text-orange-400"
                >
                  Search
                </button>

                {query && (
                  <Link
                    href={`/home/tips/${facility.id}#permitted-ewc`}
                    className="grid h-12 place-items-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/50"
                  >
                    Clear
                  </Link>
                )}
              </form>

              {query && (
                <div className="mt-5 overflow-hidden rounded-2xl border border-black/10">
                  {searchResults.length ===
                  0 ? (
                    <div className="p-8 text-center text-sm text-black/45">
                      No matching EWC
                      codes found.
                    </div>
                  ) : (
                    <div className="divide-y divide-black/5">
                      {searchResults.map(
                        (
                          record,
                        ) => {
                          const alreadyAdded =
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
                              <span className="font-mono font-semibold">
                                {formatEwcCode(
                                  record.code,
                                  record.isHazardous ===
                                    true,
                                )}
                              </span>

                              <p className="text-sm leading-6 text-black/65">
                                {
                                  record.description
                                }
                              </p>

                              {alreadyAdded ? (
                                <span className="rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                                  Added
                                </span>
                              ) : (
                                <form
                                  action={
                                    addExternalFacilityEwcCodeAction
                                  }
                                >
                                  <input
                                    type="hidden"
                                    name="facilityId"
                                    value={
                                      facility.id
                                    }
                                  />

                                  <input
                                    type="hidden"
                                    name="authorisationId"
                                    value={
                                      authorisation.id
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
                                    className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-black"
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
        </section>

        {/* =================================================
            OUTGOING LOGIC
        ================================================= */}

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-7">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-700">
            Outgoing check later
          </p>

          <h2 className="mt-3 text-xl font-semibold">
            Outgoing EWC → external
            facility authorisation →
            permitted?
          </h2>

          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/55">
            Stage 4 will use this master
            data to warn when an outgoing
            or diverted load uses an EWC
            code that is not configured
            against the chosen third-party
            facility.
          </p>
        </section>

        {/* =================================================
            ARCHIVE
        ================================================= */}

        <section className="flex gap-3 rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          {facility.isActive ? (
            <form
              action={
                archiveExternalFacilityAction
              }
            >
              <input
                type="hidden"
                name="facilityId"
                value={
                  facility.id
                }
              />

              <button
                type="submit"
                className="rounded-2xl border border-red-200 bg-red-50 px-6 py-3 text-sm font-semibold text-red-700"
              >
                Archive Facility
              </button>
            </form>
          ) : (
            <form
              action={
                restoreExternalFacilityAction
              }
            >
              <input
                type="hidden"
                name="facilityId"
                value={
                  facility.id
                }
              />

              <button
                type="submit"
                className="rounded-2xl border border-green-200 bg-green-50 px-6 py-3 text-sm font-semibold text-green-700"
              >
                Restore Facility
              </button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}

/* =========================================================
   STYLES
========================================================= */

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

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

      <h2 className="mt-2 text-2xl font-semibold">
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
  type = "text",
  required = false,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  placeholder?: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
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
        className={
          inputClass
        }
      />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: Array<
    [string, string]
  >;
}) {
  return (
    <label>
      <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
        {label}
      </span>

      <select
        name={name}
        defaultValue={
          defaultValue
        }
        className={
          inputClass
        }
      >
        {options.map(
          ([
            value,
            optionLabel,
          ]) => (
            <option
              key={value}
              value={value}
            >
              {optionLabel}
            </option>
          ),
        )}
      </select>
    </label>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <article className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>

      <p className="mt-3 truncate text-xl font-semibold">
        {value}
      </p>
    </article>
  );
}

function Detail({
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

function Badge({
  label,
  tone,
}: {
  label: string;
  tone:
    | "good"
    | "warn"
    | "neutral";
}) {
  const className =
    tone === "good"
      ? "bg-green-500/15 text-green-300 border-green-400/20"
      : tone === "warn"
        ? "bg-orange-500/15 text-orange-300 border-orange-400/20"
        : "bg-white/10 text-white/60 border-white/10";

  return (
    <span
      className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase ${className}`}
    >
      {label}
    </span>
  );
}

function Message({
  type,
  children,
}: {
  type:
    | "success"
    | "error";
  children:
    React.ReactNode;
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