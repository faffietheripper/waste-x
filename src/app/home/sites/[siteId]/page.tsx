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
  regulatoryAcceptanceAuthorities,
  regulatoryAcceptanceRules,
  siteRegulatoryAuthorities,
  siteRegulatoryAuthorityRules,
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
  activateSiteRegulatoryAuthorityAction,
  activateSiteRegulatoryRuleAction,
  createSitePermitAction,
  deactivateSiteRegulatoryAuthorityAction,
  deactivateSiteRegulatoryRuleAction,
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


    missing_regulatory_authority_context:
      "Waste X could not determine which acceptance authority to update.",

    regulatory_authority_reference_required:
      "Enter the reference/evidence you are relying on for this authority.",

    regulatory_authority_conditions_confirmation_required:
      "Confirm that this site and activity meet the conditions of the selected regulatory authority.",

    invalid_regulatory_authority_dates:
      "The authority end date cannot be earlier than its start date.",

    regulatory_authority_not_available:
      "That regulatory authority is not active in the Waste X library.",

    regulatory_authority_wrong_regulator:
      "That regulatory authority does not apply to this permit regulator.",

    missing_regulatory_rule_context:
      "Waste X could not determine which regulatory acceptance rule to update.",

    regulatory_rule_confirmation_required:
      "Confirm that the selected rule applies to this site and waste scope.",

    regulatory_rule_not_available:
      "That regulatory acceptance rule is not available for the selected authority.",

    invalid_regulatory_rule_authorisation_reference:
      "Select one of the qualifying permit, standard rules or exemption references defined by this regulatory rule.",

    regulatory_rule_underlying_code_missing:
      "This rule cannot be enabled because its required underlying EWC is not active on the site authorisation.",

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

    regulatory_authority_saved:
      "Additional waste acceptance authority activated.",

    regulatory_authority_removed:
      "Additional waste acceptance authority deactivated.",

    regulatory_rule_saved:
      "Specific regulatory acceptance rule enabled for this site.",

    regulatory_rule_removed:
      "Specific regulatory acceptance rule disabled for this site.",
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
              ewcCodes.authorisationUsable,
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


  const availableRegulatoryAuthorities = permit
    ? await database
        .select({
          id: regulatoryAcceptanceAuthorities.id,
          code: regulatoryAcceptanceAuthorities.code,
          name: regulatoryAcceptanceAuthorities.name,
          authorityType: regulatoryAcceptanceAuthorities.authorityType,
          ruleType: regulatoryAcceptanceAuthorities.ruleType,
          jurisdiction: regulatoryAcceptanceAuthorities.jurisdiction,
          sourceUrl: regulatoryAcceptanceAuthorities.sourceUrl,
          reviewAt: regulatoryAcceptanceAuthorities.reviewAt,
          conditionsSummary:
            regulatoryAcceptanceAuthorities.conditionsSummary,
        })
        .from(regulatoryAcceptanceAuthorities)
        .where(
          and(
            eq(
              regulatoryAcceptanceAuthorities.regulator,
              permit.regulator,
            ),
            eq(
              regulatoryAcceptanceAuthorities.status,
              "active",
            ),
          ),
        )
        .orderBy(asc(regulatoryAcceptanceAuthorities.code))
    : [];

  const regulatoryAuthorityActivations = permit
    ? await database
        .select({
          id: siteRegulatoryAuthorities.id,
          authorityId: siteRegulatoryAuthorities.authorityId,
          reference: siteRegulatoryAuthorities.reference,
          validFrom: siteRegulatoryAuthorities.validFrom,
          validUntil: siteRegulatoryAuthorities.validUntil,
          conditionsConfirmedAt:
            siteRegulatoryAuthorities.conditionsConfirmedAt,
          code: regulatoryAcceptanceAuthorities.code,
          name: regulatoryAcceptanceAuthorities.name,
          authorityType:
            regulatoryAcceptanceAuthorities.authorityType,
          ruleType: regulatoryAcceptanceAuthorities.ruleType,
        })
        .from(siteRegulatoryAuthorities)
        .innerJoin(
          regulatoryAcceptanceAuthorities,
          eq(
            regulatoryAcceptanceAuthorities.id,
            siteRegulatoryAuthorities.authorityId,
          ),
        )
        .where(
          and(
            eq(
              siteRegulatoryAuthorities.organisationId,
              organisationId,
            ),
            eq(siteRegulatoryAuthorities.siteId, site.id),
            eq(siteRegulatoryAuthorities.permitId, permit.id),
            eq(siteRegulatoryAuthorities.isActive, true),
          ),
        )
        .orderBy(asc(regulatoryAcceptanceAuthorities.code))
    : [];


  const regulatoryAcceptanceRuleRows = permit
    ? await database
        .select({
          id: regulatoryAcceptanceRules.id,
          authorityId: regulatoryAcceptanceRules.authorityId,
          ruleKey: regulatoryAcceptanceRules.ruleKey,
          legacyWasteDescription:
            regulatoryAcceptanceRules.legacyWasteDescription,
          actualWasteDescription:
            regulatoryAcceptanceRules.actualWasteDescription,
          qualifyingAuthorisationRefs:
            regulatoryAcceptanceRules.qualifyingAuthorisationRefs,
          originSubChapterCode:
            regulatoryAcceptanceRules.originSubChapterCode,
          specialConditions:
            regulatoryAcceptanceRules.specialConditions,
          actualEwcCodeId:
            regulatoryAcceptanceRules.actualEwcCodeId,
          underlyingEwcCodeId:
            regulatoryAcceptanceRules.underlyingAuthorisationEwcCodeId,
          requiresUnderlyingPermitCode:
            regulatoryAcceptanceRules.requiresUnderlyingPermitCode,
        })
        .from(regulatoryAcceptanceRules)
        .where(eq(regulatoryAcceptanceRules.isActive, true))
        .orderBy(asc(regulatoryAcceptanceRules.ruleKey))
    : [];

  const regulatoryRuleSelections = permit
    ? await database
        .select({
          id: siteRegulatoryAuthorityRules.id,
          activationId: siteRegulatoryAuthorityRules.activationId,
          ruleId: siteRegulatoryAuthorityRules.ruleId,
          qualifyingAuthorisationRef:
            siteRegulatoryAuthorityRules.qualifyingAuthorisationRef,
          evidenceNote: siteRegulatoryAuthorityRules.evidenceNote,
          confirmedAt: siteRegulatoryAuthorityRules.confirmedAt,
        })
        .from(siteRegulatoryAuthorityRules)
        .where(
          and(
            eq(
              siteRegulatoryAuthorityRules.organisationId,
              organisationId,
            ),
            eq(siteRegulatoryAuthorityRules.siteId, site.id),
            eq(siteRegulatoryAuthorityRules.permitId, permit.id),
            eq(siteRegulatoryAuthorityRules.isActive, true),
          ),
        )
    : [];

  const regulatoryCodeRows = permit
    ? await database
        .select({
          id: ewcCodes.id,
          code: ewcCodes.code,
        })
        .from(ewcCodes)
    : [];

  const regulatoryCodeById = new Map(
    regulatoryCodeRows.map((row) => [row.id, row.code]),
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
            ADDITIONAL WASTE ACCEPTANCE AUTHORITIES
        ================================================= */}

        <section
          id="additional-acceptance-authorities"
          className="rounded-[2rem] border border-amber-200 bg-amber-50 p-7 shadow-sm"
        >
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
            <SectionTitle
              eyebrow="Regulatory authority"
              title="Additional Waste Acceptance Authorities"
              description="Activate a recognised regulatory authority for this site. Waste X keeps factual waste classification separate from literal permit scope and only applies rules held in the regulatory library."
            />

            {permit && (
              <span className="shrink-0 rounded-full bg-amber-900 px-4 py-2 text-xs font-semibold text-amber-100">
                {regulatoryAuthorityActivations.length} active
              </span>
            )}
          </div>

          {!permit ? (
            <EmptyState>
              Add the environmental authorisation before activating additional acceptance authorities.
            </EmptyState>
          ) : (
            <>
              <div className="mt-5 space-y-3">
                {regulatoryAuthorityActivations.map((activation) => (
                  <div
                    key={activation.id}
                    className="rounded-2xl border border-amber-200 bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-amber-900">
                            {activation.code.replaceAll("_", " ")}
                          </span>
                          <span className="text-xs font-semibold text-black/45">
                            {activation.ruleType.replaceAll("_", " ")}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-black">
                          {activation.name}
                        </p>
                        <p className="mt-1 text-xs text-black/50">
                          Reference: {activation.reference}
                        </p>
                      </div>

                      {canEdit && (
                        <form action={deactivateSiteRegulatoryAuthorityAction}>
                          <input type="hidden" name="siteId" value={site.id} />
                          <input type="hidden" name="permitId" value={permit.id} />
                          <input
                            type="hidden"
                            name="activationId"
                            value={activation.id}
                          />
                          <button
                            type="submit"
                            className="rounded-lg border border-black/10 px-3 py-2 text-xs font-semibold text-black/55 hover:border-red-200 hover:bg-red-50 hover:text-red-700"
                          >
                            Deactivate
                          </button>
                        </form>
                      )}
                    </div>

                    <div className="mt-5 border-t border-amber-100 pt-4">
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/40">
                        Specific Acceptance Rules
                      </p>

                      <div className="mt-3 space-y-2">
                        {regulatoryRuleSelections
                          .filter(
                            (selection) =>
                              selection.activationId === activation.id,
                          )
                          .map((selection) => {
                            const rule = regulatoryAcceptanceRuleRows.find(
                              (candidate) => candidate.id === selection.ruleId,
                            );

                            if (!rule) return null;

                            const actualCode =
                              regulatoryCodeById.get(
                                rule.actualEwcCodeId,
                              ) ?? "Unknown";

                            const underlyingCode =
                              rule.underlyingEwcCodeId
                                ? regulatoryCodeById.get(
                                    rule.underlyingEwcCodeId,
                                  ) ?? "Unknown"
                                : null;

                            return (
                              <div
                                key={selection.id}
                                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3"
                              >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-xs font-bold text-emerald-950">
                                      {underlyingCode
                                        ? `${underlyingCode} → ${actualCode}`
                                        : `Additional code ${actualCode}`}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-emerald-950/65">
                                      {rule.legacyWasteDescription ??
                                        rule.actualWasteDescription ??
                                        rule.ruleKey}
                                    </p>
                                    {selection.qualifyingAuthorisationRef && (
                                      <p className="mt-1 text-[11px] text-emerald-900/55">
                                        Qualifying authority:{" "}
                                        {selection.qualifyingAuthorisationRef}
                                      </p>
                                    )}
                                  </div>

                                  {canEdit && (
                                    <form
                                      action={
                                        deactivateSiteRegulatoryRuleAction
                                      }
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
                                      <input
                                        type="hidden"
                                        name="selectionId"
                                        value={selection.id}
                                      />
                                      <button
                                        type="submit"
                                        className="rounded-lg border border-emerald-300 px-3 py-2 text-[11px] font-semibold text-emerald-900"
                                      >
                                        Disable rule
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </div>
                            );
                          })}

                        {regulatoryRuleSelections.filter(
                          (selection) =>
                            selection.activationId === activation.id,
                        ).length === 0 && (
                          <p className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-3 text-xs text-amber-900/60">
                            No specific rule is enabled. This authority currently permits nothing.
                          </p>
                        )}
                      </div>

                      {canEdit && (
                        <div className="mt-4 space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-black/40">
                            Available library rules
                          </p>

                          {regulatoryAcceptanceRuleRows
                            .filter(
                              (rule) =>
                                rule.authorityId === activation.authorityId &&
                                !regulatoryRuleSelections.some(
                                  (selection) =>
                                    selection.activationId === activation.id &&
                                    selection.ruleId === rule.id,
                                ),
                            )
                            .map((rule) => {
                              const actualCode =
                                regulatoryCodeById.get(
                                  rule.actualEwcCodeId,
                                ) ?? "Unknown";

                              const underlyingCode =
                                rule.underlyingEwcCodeId
                                  ? regulatoryCodeById.get(
                                      rule.underlyingEwcCodeId,
                                    ) ?? "Unknown"
                                  : null;

                              const underlyingPresent =
                                !rule.requiresUnderlyingPermitCode ||
                                (rule.underlyingEwcCodeId
                                  ? acceptedIds.has(
                                      rule.underlyingEwcCodeId,
                                    )
                                  : false);

                              return (
                                <form
                                  key={rule.id}
                                  action={activateSiteRegulatoryRuleAction}
                                  className="rounded-xl border border-black/10 bg-white p-4"
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
                                  <input
                                    type="hidden"
                                    name="activationId"
                                    value={activation.id}
                                  />
                                  <input
                                    type="hidden"
                                    name="ruleId"
                                    value={rule.id}
                                  />

                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-black px-2 py-1 text-[10px] font-bold text-white">
                                      {underlyingCode
                                        ? `${underlyingCode} → ${actualCode}`
                                        : actualCode}
                                    </span>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-black/40">
                                      {rule.ruleKey}
                                    </span>
                                  </div>

                                  <p className="mt-2 text-xs leading-5 text-black/65">
                                    {rule.legacyWasteDescription ??
                                      rule.actualWasteDescription ??
                                      "Regulatory acceptance rule"}
                                  </p>

                                  {rule.actualWasteDescription && (
                                    <p className="mt-1 text-xs leading-5 text-black/45">
                                      Actual waste:{" "}
                                      {rule.actualWasteDescription}
                                    </p>
                                  )}

                                  {rule.specialConditions && (
                                    <p className="mt-2 rounded-lg bg-amber-50 p-2 text-[11px] leading-4 text-amber-950/65">
                                      {rule.specialConditions}
                                    </p>
                                  )}

                                  {!underlyingPresent && (
                                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3">
                                      <p className="text-[11px] font-semibold leading-5 text-red-800">
                                        This rule cannot be enabled yet.
                                      </p>
                                      <p className="mt-1 text-[11px] leading-5 text-red-700/80">
                                        Your active permit must first contain EWC{" "}
                                        <span className="font-bold">
                                          {underlyingCode ?? "required by this rule"}
                                        </span>
                                        . Add that code to the permit above, then return here to review and enable this rule.
                                      </p>
                                      <button
                                        type="button"
                                        disabled
                                        className="mt-3 cursor-not-allowed rounded-lg bg-black/10 px-4 py-2 text-xs font-bold text-black/35"
                                      >
                                        Cannot enable yet · permit code missing
                                      </button>
                                    </div>
                                  )}

                                  {underlyingPresent && (
                                    <>
                                      {(rule.qualifyingAuthorisationRefs ??
                                        []).length > 0 && (
                                        <label className="mt-3 block">
                                          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                            Qualifying permit / exemption
                                          </span>
                                          <select
                                            name="qualifyingAuthorisationRef"
                                            required
                                            className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-3 text-xs"
                                          >
                                            <option value="">
                                              Choose applicable authority
                                            </option>
                                            {(
                                              rule.qualifyingAuthorisationRefs ??
                                              []
                                            ).map((reference) => (
                                              <option
                                                key={reference}
                                                value={reference}
                                              >
                                                {reference}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                      )}

                                      <label className="mt-3 block">
                                        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-black/40">
                                          Evidence note
                                        </span>
                                        <input
                                          name="evidenceNote"
                                          placeholder="Why this specific rule applies to this site"
                                          className="mt-1 h-10 w-full rounded-lg border border-black/10 px-3 text-xs"
                                        />
                                      </label>

                                      <label className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3">
                                        <input
                                          type="checkbox"
                                          name="ruleConditionsConfirmed"
                                          value="yes"
                                          required
                                          className="mt-0.5"
                                        />
                                        <span className="text-[11px] leading-4 text-amber-950/70">
                                          I confirm this exact regulatory rule,
                                          waste scope and qualifying
                                          authorisation apply to this site.
                                        </span>
                                      </label>

                                      <button
                                        type="submit"
                                        className="mt-3 rounded-lg bg-black px-4 py-2 text-xs font-bold text-white"
                                      >
                                        Enable this rule
                                      </button>
                                    </>
                                  )}
                                </form>
                              );
                            })}
                        </div>
                      )}
                    </div>
                  </div>
                ))}

                {regulatoryAuthorityActivations.length === 0 && (
                  <p className="rounded-2xl border border-dashed border-amber-300 bg-white/50 p-4 text-xs leading-5 text-amber-900/60">
                    No additional authority is active. Only exact permit-code matching will be accepted.
                  </p>
                )}
              </div>

              {canEdit && (
                <form
                  action={activateSiteRegulatoryAuthorityAction}
                  className="mt-6 grid gap-4 rounded-2xl border border-amber-200 bg-white p-5 lg:grid-cols-2"
                >
                  <input type="hidden" name="siteId" value={site.id} />
                  <input type="hidden" name="permitId" value={permit.id} />

                  <label className="lg:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Waste X regulatory library
                    </span>
                    <select
                      name="authorityId"
                      required
                      className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                    >
                      <option value="">Choose authority</option>
                      {availableRegulatoryAuthorities
                        .filter(
                          (authority) =>
                            !regulatoryAuthorityActivations.some(
                              (activation) =>
                                activation.authorityId === authority.id,
                            ),
                        )
                        .map((authority) => (
                          <option key={authority.id} value={authority.id}>
                            {authority.code.replaceAll("_", " ")} · {authority.name}
                          </option>
                        ))}
                    </select>
                  </label>

                  <label className="lg:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Site reference / evidence
                    </span>
                    <input
                      name="reference"
                      required
                      placeholder="e.g. RPS 241; permit variation ref; regulator approval ref"
                      className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>

                  <label>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Site validity from
                    </span>
                    <input
                      type="date"
                      name="validFrom"
                      className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>

                  <label>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Site validity until
                    </span>
                    <input
                      type="date"
                      name="validUntil"
                      className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="lg:col-span-2">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/40">
                      Notes
                    </span>
                    <input
                      name="notes"
                      placeholder="Site-specific scope or evidence note"
                      className="mt-1 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                    />
                  </label>

                  <label className="lg:col-span-2 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <input
                      type="checkbox"
                      name="conditionsConfirmed"
                      value="yes"
                      required
                      className="mt-1"
                    />
                    <span className="text-xs leading-5 text-amber-950/75">
                      I confirm that this site, permit/exemption and activity meet the conditions of the selected regulatory authority.
                    </span>
                  </label>

                  <div className="lg:col-span-2">
                    <button
                      type="submit"
                      className="rounded-xl bg-amber-500 px-5 py-3 text-sm font-bold text-black"
                    >
                      Activate authority
                    </button>
                  </div>
                </form>
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
