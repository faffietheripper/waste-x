// src/app/home/sites/actions.ts

"use server";
/* WASTE_X_REGULATORY_ACCEPTANCE_ADMIN_V1 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  and,
  eq,
  ne,
} from "drizzle-orm";

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

  type PermitAuthorisationType,
  type PermitRegulator,
  type PermitStatus,
} from "@/db/schema";

/* =========================================================
   TYPES
========================================================= */

type OrganisationAdminContext = {
  userId: string;
  organisationId: string;
};

/* =========================================================
   VALID VALUES
========================================================= */

const VALID_REGULATORS: PermitRegulator[] = [
  "EA",
  "NRW",
  "SEPA",
  "NIEA",
  "other",
];

const VALID_AUTHORISATION_TYPES: PermitAuthorisationType[] = [
  "permit",
  "licence",
  "exemption",
  "other",
];

const VALID_PERMIT_STATUSES: PermitStatus[] = [
  "active",
  "expired",
  "suspended",
  "revoked",
  "unknown",
];


/* =========================================================
   AUTH
========================================================= */

async function requireOrganisationAdmin(): Promise<OrganisationAdminContext> {
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
        isActive: true,
        isSuspended: true,
      },
    });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect(
      "/home?reason=account_unavailable",
    );
  }

  if (
    currentUser.role !==
      "administrator" &&
    currentUser.role !==
      "seniorManagement"
  ) {
    redirect(
      "/home?reason=unauthorised",
    );
  }

  return {
    userId: currentUser.id,
    organisationId:
      currentUser.organisationId,
  };
}

/* =========================================================
   FORM HELPERS
========================================================= */

function cleanString(
  value: FormDataEntryValue | null,
) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function cleanOptionalString(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    cleanString(value);

  return cleaned.length > 0
    ? cleaned
    : null;
}

function parseOptionalDate(
  value: FormDataEntryValue | null,
) {
  const cleaned =
    cleanString(value);

  if (!cleaned) {
    return null;
  }

  const date = new Date(
    `${cleaned}T00:00:00.000Z`,
  );

  if (
    Number.isNaN(date.getTime())
  ) {
    return null;
  }

  return date;
}

function normaliseRegulator(
  value: FormDataEntryValue | null,
): PermitRegulator {
  const cleaned =
    cleanString(
      value,
    ) as PermitRegulator;

  if (
    VALID_REGULATORS.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "EA";
}

function normaliseAuthorisationType(
  value: FormDataEntryValue | null,
): PermitAuthorisationType {
  const cleaned =
    cleanString(
      value,
    ) as PermitAuthorisationType;

  if (
    VALID_AUTHORISATION_TYPES.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "permit";
}

function normalisePermitStatus(
  value: FormDataEntryValue | null,
): PermitStatus {
  const cleaned =
    cleanString(
      value,
    ) as PermitStatus;

  if (
    VALID_PERMIT_STATUSES.includes(
      cleaned,
    )
  ) {
    return cleaned;
  }

  return "active";
}

/* =========================================================
   REDIRECT HELPERS
========================================================= */

function redirectSiteError(
  siteId: string,
  error: string,
): never {
  redirect(
    `/home/sites/${siteId}?error=${encodeURIComponent(
      error,
    )}`,
  );
}

function redirectSiteSuccess(
  siteId: string,
  success: string,
): never {
  redirect(
    `/home/sites/${siteId}?success=${encodeURIComponent(
      success,
    )}`,
  );
}

/* =========================================================
   CREATE RECEIVING SITE
========================================================= */

export async function createReceivingSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const name = cleanString(
    formData.get("name"),
  );

  const fullAddress =
    cleanOptionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    cleanOptionalString(
      formData.get("postcode"),
    );

  if (!name) {
    redirect(
      "/home/sites?error=site_name_required",
    );
  }

  /*
    Solo Workspace currently works around one primary receiving
    site.

    If the organisation already has a default site, configure
    that one instead of creating another destination.
  */

  const existingDefault =
    await database.query.sites.findFirst(
      {
        where: and(
          eq(
            sites.organisationId,
            context.organisationId,
          ),
          eq(
            sites.isDefault,
            true,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (existingDefault) {
    redirect(
      `/home/sites/${existingDefault.id}?error=receiving_site_already_exists`,
    );
  }

  const duplicate =
    await database.query.sites.findFirst(
      {
        where: and(
          eq(
            sites.organisationId,
            context.organisationId,
          ),
          eq(
            sites.name,
            name,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (duplicate) {
    redirect(
      `/home/sites/${duplicate.id}?error=duplicate_site_name`,
    );
  }

  const [createdSite] =
    await database
      .insert(sites)
      .values({
        organisationId:
          context.organisationId,

        name,

        siteType:
          "waste_receiving_site",

        fullAddress,
        postcode,

        isDefault: true,
        status: "active",

        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({
        id: sites.id,
      });

  if (!createdSite) {
    redirect(
      "/home/sites?error=site_create_failed",
    );
  }

  revalidatePath("/home/sites");

  redirect(
    `/home/sites/${createdSite.id}?success=receiving_site_created`,
  );
}

/* =========================================================
   UPDATE RECEIVING SITE
========================================================= */

export async function updateReceivingSiteAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const siteId = cleanString(
    formData.get("siteId"),
  );

  const name = cleanString(
    formData.get("name"),
  );

  const fullAddress =
    cleanOptionalString(
      formData.get(
        "fullAddress",
      ),
    );

  const postcode =
    cleanOptionalString(
      formData.get("postcode"),
    );

  if (!siteId) {
    redirect(
      "/home/sites?error=missing_site_id",
    );
  }

  if (!name) {
    redirectSiteError(
      siteId,
      "site_name_required",
    );
  }

  const site =
    await database.query.sites.findFirst(
      {
        where: and(
          eq(
            sites.id,
            siteId,
          ),
          eq(
            sites.organisationId,
            context.organisationId,
          ),
        ),
      },
    );

  if (!site) {
    redirect(
      "/home/sites?error=site_not_found",
    );
  }

  const duplicate =
    await database.query.sites.findFirst(
      {
        where: and(
          eq(
            sites.organisationId,
            context.organisationId,
          ),
          eq(
            sites.name,
            name,
          ),
          ne(
            sites.id,
            siteId,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (duplicate) {
    redirectSiteError(
      siteId,
      "duplicate_site_name",
    );
  }

  /*
    Make this the organisation's primary receiving site.

    Backend support for additional sites stays intact, but Solo
    should not force the operator to repeatedly select their own
    normal destination.
  */

  await database.transaction(
    async (tx) => {
      await tx
        .update(sites)
        .set({
          isDefault: false,
          updatedAt: new Date(),
        })
        .where(
          eq(
            sites.organisationId,
            context.organisationId,
          ),
        );

      await tx
        .update(sites)
        .set({
          name,

          siteType:
            "waste_receiving_site",

          fullAddress,
          postcode,

          isDefault: true,
          status: "active",

          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sites.id,
              siteId,
            ),
            eq(
              sites.organisationId,
              context.organisationId,
            ),
          ),
        );
    },
  );

  revalidatePath("/home/sites");
  revalidatePath(
    `/home/sites/${siteId}`,
  );

  redirectSiteSuccess(
    siteId,
    "receiving_site_updated",
  );
}

/* =========================================================
   CREATE PRIMARY PERMIT
========================================================= */

export async function createSitePermitAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const siteId = cleanString(
    formData.get("siteId"),
  );

  const permitNumber =
    cleanString(
      formData.get(
        "permitNumber",
      ),
    );

  const regulator =
    normaliseRegulator(
      formData.get("regulator"),
    );

  const authorisationType =
    normaliseAuthorisationType(
      formData.get(
        "authorisationType",
      ),
    );

  const validFrom =
    parseOptionalDate(
      formData.get("validFrom"),
    );

  const expiresAt =
    parseOptionalDate(
      formData.get("expiresAt"),
    );

  const notes =
    cleanOptionalString(
      formData.get("notes"),
    );

  if (!siteId) {
    redirect(
      "/home/sites?error=missing_site_id",
    );
  }

  if (!permitNumber) {
    redirectSiteError(
      siteId,
      "permit_number_required",
    );
  }

  const site =
    await database.query.sites.findFirst(
      {
        where: and(
          eq(
            sites.id,
            siteId,
          ),
          eq(
            sites.organisationId,
            context.organisationId,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (!site) {
    redirect(
      "/home/sites?error=site_not_found",
    );
  }

  const duplicatePermit =
    await database.query.sitePermits.findFirst(
      {
        where: and(
          eq(
            sitePermits.siteId,
            siteId,
          ),
          eq(
            sitePermits.permitNumber,
            permitNumber,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (duplicatePermit) {
    redirectSiteError(
      siteId,
      "duplicate_permit",
    );
  }

  await database.transaction(
    async (tx) => {
      /*
        Only one permit is treated as the active primary
        authorisation by the current Solo UI.
      */

      await tx
        .update(sitePermits)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sitePermits.organisationId,
              context.organisationId,
            ),
            eq(
              sitePermits.siteId,
              siteId,
            ),
          ),
        );

      await tx
        .insert(sitePermits)
        .values({
          organisationId:
            context.organisationId,

          siteId,

          permitNumber,

          regulator,

          authorisationType,

          status: "active",

          isPrimary: true,

          validFrom,
          expiresAt,

          notes,

          createdByUserId:
            context.userId,

          createdAt: new Date(),
          updatedAt: new Date(),
        });

      /*
        Keep the old sites.permitNumber field mirrored for
        compatibility with legacy pages while V2 is being built.
      */

      await tx
        .update(sites)
        .set({
          permitNumber,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sites.id,
              siteId,
            ),
            eq(
              sites.organisationId,
              context.organisationId,
            ),
          ),
        );
    },
  );

  revalidatePath(
    `/home/sites/${siteId}`,
  );

  revalidatePath("/home/sites");

  redirectSiteSuccess(
    siteId,
    "permit_created",
  );
}

/* =========================================================
   UPDATE PRIMARY PERMIT
========================================================= */

export async function updateSitePermitAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const siteId = cleanString(
    formData.get("siteId"),
  );

  const permitId = cleanString(
    formData.get("permitId"),
  );

  const permitNumber =
    cleanString(
      formData.get(
        "permitNumber",
      ),
    );

  const regulator =
    normaliseRegulator(
      formData.get("regulator"),
    );

  const authorisationType =
    normaliseAuthorisationType(
      formData.get(
        "authorisationType",
      ),
    );

  const status =
    normalisePermitStatus(
      formData.get("status"),
    );

  const validFrom =
    parseOptionalDate(
      formData.get("validFrom"),
    );

  const expiresAt =
    parseOptionalDate(
      formData.get("expiresAt"),
    );

  const notes =
    cleanOptionalString(
      formData.get("notes"),
    );

  if (
    !siteId ||
    !permitId
  ) {
    redirect(
      "/home/sites?error=missing_permit_context",
    );
  }

  if (!permitNumber) {
    redirectSiteError(
      siteId,
      "permit_number_required",
    );
  }

  const permit =
    await database.query.sitePermits.findFirst(
      {
        where: and(
          eq(
            sitePermits.id,
            permitId,
          ),
          eq(
            sitePermits.siteId,
            siteId,
          ),
          eq(
            sitePermits.organisationId,
            context.organisationId,
          ),
        ),
      },
    );

  if (!permit) {
    redirectSiteError(
      siteId,
      "permit_not_found",
    );
  }

  const duplicate =
    await database.query.sitePermits.findFirst(
      {
        where: and(
          eq(
            sitePermits.siteId,
            siteId,
          ),
          eq(
            sitePermits.permitNumber,
            permitNumber,
          ),
          ne(
            sitePermits.id,
            permitId,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (duplicate) {
    redirectSiteError(
      siteId,
      "duplicate_permit",
    );
  }

  await database.transaction(
    async (tx) => {
      await tx
        .update(sitePermits)
        .set({
          isPrimary: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sitePermits.organisationId,
              context.organisationId,
            ),
            eq(
              sitePermits.siteId,
              siteId,
            ),
          ),
        );

      await tx
        .update(sitePermits)
        .set({
          permitNumber,

          regulator,

          authorisationType,

          status,

          isPrimary: true,

          validFrom,
          expiresAt,

          notes,

          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sitePermits.id,
              permitId,
            ),
            eq(
              sitePermits.organisationId,
              context.organisationId,
            ),
          ),
        );

      await tx
        .update(sites)
        .set({
          permitNumber,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(
              sites.id,
              siteId,
            ),
            eq(
              sites.organisationId,
              context.organisationId,
            ),
          ),
        );
    },
  );

  revalidatePath(
    `/home/sites/${siteId}`,
  );

  revalidatePath("/home/sites");

  redirectSiteSuccess(
    siteId,
    "permit_updated",
  );
}

/* =========================================================
   ADD EWC TO PERMIT
========================================================= */

export async function addPermitEwcCodeAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const siteId = cleanString(
    formData.get("siteId"),
  );

  const permitId = cleanString(
    formData.get("permitId"),
  );

  const ewcCodeId = cleanString(
    formData.get("ewcCodeId"),
  );

  const query = cleanString(
    formData.get("query"),
  );

  if (
    !siteId ||
    !permitId ||
    !ewcCodeId
  ) {
    redirectSiteError(
      siteId || "unknown",
      "missing_ewc_context",
    );
  }

  const permit =
    await database.query.sitePermits.findFirst(
      {
        where: and(
          eq(
            sitePermits.id,
            permitId,
          ),
          eq(
            sitePermits.siteId,
            siteId,
          ),
          eq(
            sitePermits.organisationId,
            context.organisationId,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (!permit) {
    redirectSiteError(
      siteId,
      "permit_not_found",
    );
  }

  const ewcCode =
    await database.query.ewcCodes.findFirst(
      {
        where: and(
          eq(
            ewcCodes.id,
            ewcCodeId,
          ),
          eq(
            ewcCodes.authorisationUsable,
            true,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (!ewcCode) {
    redirectSiteError(
      siteId,
      "ewc_not_found",
    );
  }

  await database
    .insert(permitEwcCodes)
    .values({
      organisationId:
        context.organisationId,

      permitId,

      ewcCodeId,

      isActive: true,

      configuredByUserId:
        context.userId,

      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        permitEwcCodes.permitId,
        permitEwcCodes.ewcCodeId,
      ],

      set: {
        isActive: true,

        configuredByUserId:
          context.userId,
      },
    });

  revalidatePath(
    `/home/sites/${siteId}`,
  );

  const search = query
    ? `&q=${encodeURIComponent(
        query,
      )}`
    : "";

  redirect(
    `/home/sites/${siteId}?success=ewc_added${search}#accepted-ewc`,
  );
}

/* =========================================================
   REMOVE EWC FROM PERMIT
========================================================= */

export async function removePermitEwcCodeAction(
  formData: FormData,
) {
  const context =
    await requireOrganisationAdmin();

  const siteId = cleanString(
    formData.get("siteId"),
  );

  const permitId = cleanString(
    formData.get("permitId"),
  );

  const ewcCodeId = cleanString(
    formData.get("ewcCodeId"),
  );

  if (
    !siteId ||
    !permitId ||
    !ewcCodeId
  ) {
    redirect(
      "/home/sites?error=missing_ewc_context",
    );
  }

  const permit =
    await database.query.sitePermits.findFirst(
      {
        where: and(
          eq(
            sitePermits.id,
            permitId,
          ),
          eq(
            sitePermits.siteId,
            siteId,
          ),
          eq(
            sitePermits.organisationId,
            context.organisationId,
          ),
        ),

        columns: {
          id: true,
        },
      },
    );

  if (!permit) {
    redirectSiteError(
      siteId,
      "permit_not_found",
    );
  }

  await database
    .update(permitEwcCodes)
    .set({
      isActive: false,

      configuredByUserId:
        context.userId,
    })
    .where(
      and(
        eq(
          permitEwcCodes.organisationId,
          context.organisationId,
        ),
        eq(
          permitEwcCodes.permitId,
          permitId,
        ),
        eq(
          permitEwcCodes.ewcCodeId,
          ewcCodeId,
        ),
      ),
    );

  revalidatePath(
    `/home/sites/${siteId}`,
  );

  redirect(
    `/home/sites/${siteId}?success=ewc_removed#accepted-ewc`,
  );
}

/* =========================================================
   ADDITIONAL WASTE ACCEPTANCE AUTHORITIES
========================================================= */

export async function activateSiteRegulatoryAuthorityAction(
  formData: FormData,
) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));
  const permitId = cleanString(formData.get("permitId"));
  const authorityId = cleanString(formData.get("authorityId"));
  const reference = cleanString(formData.get("reference"));
  const notes = cleanOptionalString(formData.get("notes"));
  const validFrom = parseOptionalDate(formData.get("validFrom"));
  const validUntil = parseOptionalDate(formData.get("validUntil"));
  const conditionsConfirmed =
    cleanString(formData.get("conditionsConfirmed")) === "yes";

  if (!siteId || !permitId || !authorityId) {
    redirectSiteError(
      siteId || "unknown",
      "missing_regulatory_authority_context",
    );
  }

  if (!reference) {
    redirectSiteError(siteId, "regulatory_authority_reference_required");
  }

  if (!conditionsConfirmed) {
    redirectSiteError(
      siteId,
      "regulatory_authority_conditions_confirmation_required",
    );
  }

  if (
    validFrom &&
    validUntil &&
    validUntil.getTime() < validFrom.getTime()
  ) {
    redirectSiteError(siteId, "invalid_regulatory_authority_dates");
  }

  const permit = await database.query.sitePermits.findFirst({
    where: and(
      eq(sitePermits.id, permitId),
      eq(sitePermits.siteId, siteId),
      eq(sitePermits.organisationId, context.organisationId),
    ),
    columns: {
      id: true,
      regulator: true,
    },
  });

  if (!permit) {
    redirectSiteError(siteId, "permit_not_found");
  }

  const authorityRows = await database
    .select({
      id: regulatoryAcceptanceAuthorities.id,
      regulator: regulatoryAcceptanceAuthorities.regulator,
      status: regulatoryAcceptanceAuthorities.status,
    })
    .from(regulatoryAcceptanceAuthorities)
    .where(eq(regulatoryAcceptanceAuthorities.id, authorityId))
    .limit(1);

  const authority = authorityRows[0];

  if (!authority || authority.status !== "active") {
    redirectSiteError(siteId, "regulatory_authority_not_available");
  }

  if (authority.regulator !== permit.regulator) {
    redirectSiteError(siteId, "regulatory_authority_wrong_regulator");
  }

  const existingRows = await database
    .select({ id: siteRegulatoryAuthorities.id })
    .from(siteRegulatoryAuthorities)
    .where(
      and(
        eq(
          siteRegulatoryAuthorities.organisationId,
          context.organisationId,
        ),
        eq(siteRegulatoryAuthorities.siteId, siteId),
        eq(siteRegulatoryAuthorities.permitId, permitId),
        eq(siteRegulatoryAuthorities.authorityId, authorityId),
      ),
    )
    .limit(1);

  const now = new Date();
  const existing = existingRows[0];

  if (existing) {
    await database
      .update(siteRegulatoryAuthorities)
      .set({
        reference,
        notes,
        validFrom,
        validUntil,
        conditionsConfirmedAt: now,
        conditionsConfirmedByUserId: context.userId,
        isActive: true,
        createdByUserId: context.userId,
        updatedAt: now,
      })
      .where(eq(siteRegulatoryAuthorities.id, existing.id));
  } else {
    await database.insert(siteRegulatoryAuthorities).values({
      organisationId: context.organisationId,
      siteId,
      permitId,
      authorityId,
      reference,
      notes,
      validFrom,
      validUntil,
      conditionsConfirmedAt: now,
      conditionsConfirmedByUserId: context.userId,
      isActive: true,
      createdByUserId: context.userId,
      createdAt: now,
      updatedAt: now,
    });
  }

  revalidatePath(`/home/sites/${siteId}`);

  redirect(
    `/home/sites/${siteId}?success=regulatory_authority_saved#additional-acceptance-authorities`,
  );
}


export async function activateSiteRegulatoryRuleAction(
  formData: FormData,
) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));
  const permitId = cleanString(formData.get("permitId"));
  const activationId = cleanString(formData.get("activationId"));
  const ruleId = cleanString(formData.get("ruleId"));

  const qualifyingAuthorisationRef = cleanOptionalString(
    formData.get("qualifyingAuthorisationRef"),
  );

  const evidenceNote = cleanOptionalString(
    formData.get("evidenceNote"),
  );

  const ruleConditionsConfirmed =
    cleanString(formData.get("ruleConditionsConfirmed")) === "yes";

  if (!siteId || !permitId || !activationId || !ruleId) {
    redirectSiteError(
      siteId || "unknown",
      "missing_regulatory_rule_context",
    );
  }

  if (!ruleConditionsConfirmed) {
    redirectSiteError(
      siteId,
      "regulatory_rule_confirmation_required",
    );
  }

  const activationRows = await database
    .select({
      id: siteRegulatoryAuthorities.id,
      authorityId: siteRegulatoryAuthorities.authorityId,
    })
    .from(siteRegulatoryAuthorities)
    .where(
      and(
        eq(siteRegulatoryAuthorities.id, activationId),
        eq(
          siteRegulatoryAuthorities.organisationId,
          context.organisationId,
        ),
        eq(siteRegulatoryAuthorities.siteId, siteId),
        eq(siteRegulatoryAuthorities.permitId, permitId),
        eq(siteRegulatoryAuthorities.isActive, true),
      ),
    )
    .limit(1);

  const activation = activationRows[0];

  if (!activation) {
    redirectSiteError(siteId, "regulatory_authority_not_available");
  }

  const ruleRows = await database
    .select({
      id: regulatoryAcceptanceRules.id,
      authorityId: regulatoryAcceptanceRules.authorityId,
      underlyingEwcCodeId:
        regulatoryAcceptanceRules.underlyingAuthorisationEwcCodeId,
      requiresUnderlyingPermitCode:
        regulatoryAcceptanceRules.requiresUnderlyingPermitCode,
      qualifyingAuthorisationRefs:
        regulatoryAcceptanceRules.qualifyingAuthorisationRefs,
      isActive: regulatoryAcceptanceRules.isActive,
    })
    .from(regulatoryAcceptanceRules)
    .where(eq(regulatoryAcceptanceRules.id, ruleId))
    .limit(1);

  const rule = ruleRows[0];

  if (
    !rule ||
    !rule.isActive ||
    rule.authorityId !== activation.authorityId
  ) {
    redirectSiteError(siteId, "regulatory_rule_not_available");
  }

  const allowedRefs = rule.qualifyingAuthorisationRefs ?? [];

  if (
    allowedRefs.length > 0 &&
    (!qualifyingAuthorisationRef ||
      !allowedRefs.includes(qualifyingAuthorisationRef))
  ) {
    redirectSiteError(
      siteId,
      "invalid_regulatory_rule_authorisation_reference",
    );
  }

  if (
    rule.requiresUnderlyingPermitCode &&
    rule.underlyingEwcCodeId
  ) {
    const permitCodeRows = await database
      .select({ ewcCodeId: permitEwcCodes.ewcCodeId })
      .from(permitEwcCodes)
      .where(
        and(
          eq(
            permitEwcCodes.organisationId,
            context.organisationId,
          ),
          eq(permitEwcCodes.permitId, permitId),
          eq(
            permitEwcCodes.ewcCodeId,
            rule.underlyingEwcCodeId,
          ),
          eq(permitEwcCodes.isActive, true),
        ),
      )
      .limit(1);

    if (!permitCodeRows[0]) {
      redirectSiteError(
        siteId,
        "regulatory_rule_underlying_code_missing",
      );
    }
  }

  const existingRows = await database
    .select({ id: siteRegulatoryAuthorityRules.id })
    .from(siteRegulatoryAuthorityRules)
    .where(
      and(
        eq(
          siteRegulatoryAuthorityRules.activationId,
          activationId,
        ),
        eq(siteRegulatoryAuthorityRules.ruleId, ruleId),
      ),
    )
    .limit(1);

  const now = new Date();
  const existing = existingRows[0];

  if (existing) {
    await database
      .update(siteRegulatoryAuthorityRules)
      .set({
        qualifyingAuthorisationRef,
        evidenceNote,
        confirmedAt: now,
        confirmedByUserId: context.userId,
        isActive: true,
        updatedAt: now,
      })
      .where(eq(siteRegulatoryAuthorityRules.id, existing.id));
  } else {
    await database.insert(siteRegulatoryAuthorityRules).values({
      organisationId: context.organisationId,
      siteId,
      permitId,
      activationId,
      ruleId,
      qualifyingAuthorisationRef,
      evidenceNote,
      confirmedAt: now,
      confirmedByUserId: context.userId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  revalidatePath(`/home/sites/${siteId}`);

  redirect(
    `/home/sites/${siteId}?success=regulatory_rule_saved#additional-acceptance-authorities`,
  );
}

export async function deactivateSiteRegulatoryRuleAction(
  formData: FormData,
) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));
  const permitId = cleanString(formData.get("permitId"));
  const selectionId = cleanString(formData.get("selectionId"));

  if (!siteId || !permitId || !selectionId) {
    redirectSiteError(
      siteId || "unknown",
      "missing_regulatory_rule_context",
    );
  }

  await database
    .update(siteRegulatoryAuthorityRules)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(siteRegulatoryAuthorityRules.id, selectionId),
        eq(
          siteRegulatoryAuthorityRules.organisationId,
          context.organisationId,
        ),
        eq(siteRegulatoryAuthorityRules.siteId, siteId),
        eq(siteRegulatoryAuthorityRules.permitId, permitId),
      ),
    );

  revalidatePath(`/home/sites/${siteId}`);

  redirect(
    `/home/sites/${siteId}?success=regulatory_rule_removed#additional-acceptance-authorities`,
  );
}

export async function deactivateSiteRegulatoryAuthorityAction(
  formData: FormData,
) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));
  const permitId = cleanString(formData.get("permitId"));
  const activationId = cleanString(formData.get("activationId"));

  if (!siteId || !permitId || !activationId) {
    redirect("/home/sites?error=missing_regulatory_authority_context");
  }

  await database
    .update(siteRegulatoryAuthorities)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(siteRegulatoryAuthorities.id, activationId),
        eq(
          siteRegulatoryAuthorities.organisationId,
          context.organisationId,
        ),
        eq(siteRegulatoryAuthorities.siteId, siteId),
        eq(siteRegulatoryAuthorities.permitId, permitId),
      ),
    );

  revalidatePath(`/home/sites/${siteId}`);

  redirect(
    `/home/sites/${siteId}?success=regulatory_authority_removed#additional-acceptance-authorities`,
  );
}
