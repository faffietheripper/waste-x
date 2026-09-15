import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  ewcCodes,
  permitEwcCodes,
  regulatoryAcceptanceAuthorities,
  regulatoryAcceptanceRules,
  sitePermits,
  siteRegulatoryAuthorities,
  siteRegulatoryAuthorityRules,
} from "@/db/schema";

type PermitDb = Pick<typeof database, "select">;

export type RegulatoryAuthoritySummary = {
  activationId: string;
  authorityId: string;
  code: string;
  name: string;
  authorityType: string;
  ruleType: string;
  regulator: string;
  jurisdiction: string;
  reference: string;
  ruleId: string;
  ruleKey: string;
  ruleScope: string | null;
  qualifyingAuthorisationRef: string | null;
};

export type PermitEwcAcceptance =
  | {
      allowed: true;
      matchType: "exact";
      permitId: string;
      actualEwcCodeId: string;
      actualEwcCode: string;
      permittedEwcCodeId: string;
      permittedEwcCode: string;
      activationId: null;
      equivalenceId: null;
      basis: null;
      reference: null;
      authority: null;
      underlyingAuthorisation: {
        type: "environmental_permit";
        permitEwcCodeId: string;
        permitEwcCode: string;
      };
    }
  | {
      allowed: true;
      matchType: "regulatory_authority";
      permitId: string;
      actualEwcCodeId: string;
      actualEwcCode: string;
      permittedEwcCodeId: string | null;
      permittedEwcCode: string;
      activationId: string;
      equivalenceId: string;
      basis: string;
      reference: string;
      authority: RegulatoryAuthoritySummary;
      underlyingAuthorisation: {
        type: "environmental_permit" | "activity_authority";
        permitEwcCodeId: string | null;
        permitEwcCode: string;
      };
    }
  | {
      allowed: false;
      matchType: "none";
      reason:
        | "permit_unavailable"
        | "ewc_not_classification_usable"
        | "ewc_not_authorised";
    };

type RegulatoryListItem = {
  acceptedEwcCodeId: string;
  permittedEwcCodeId: string | null;
  permittedEwcCode: string;
  activationId: string;
  equivalenceId: string;
  basis: string;
  reference: string;
  authority: RegulatoryAuthoritySummary;
};

export type PermitEwcAcceptanceList = {
  exactEwcCodeIds: string[];
  regulatory: RegulatoryListItem[];
  equivalent: RegulatoryListItem[];
};

function insideWindow(
  at: Date,
  from: Date | null | undefined,
  until: Date | null | undefined,
) {
  if (from && at.getTime() < from.getTime()) return false;
  if (until && at.getTime() > until.getTime()) return false;
  return true;
}

async function loadPermit(params: {
  organisationId: string;
  siteId: string;
  permitId: string;
  db: PermitDb;
}) {
  const rows = await params.db
    .select({
      id: sitePermits.id,
      regulator: sitePermits.regulator,
      validFrom: sitePermits.validFrom,
      expiresAt: sitePermits.expiresAt,
    })
    .from(sitePermits)
    .where(
      and(
        eq(sitePermits.id, params.permitId),
        eq(sitePermits.organisationId, params.organisationId),
        eq(sitePermits.siteId, params.siteId),
        eq(sitePermits.status, "active"),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function loadActualCode(
  ewcCodeId: string,
  db: PermitDb,
) {
  const rows = await db
    .select({
      id: ewcCodes.id,
      code: ewcCodes.code,
      classificationUsable: ewcCodes.classificationUsable,
    })
    .from(ewcCodes)
    .where(eq(ewcCodes.id, ewcCodeId))
    .limit(1);

  return rows[0] ?? null;
}

async function activePermitCodeIds(params: {
  organisationId: string;
  permitId: string;
  db: PermitDb;
}) {
  const rows = await params.db
    .select({
      ewcCodeId: permitEwcCodes.ewcCodeId,
    })
    .from(permitEwcCodes)
    .where(
      and(
        eq(permitEwcCodes.organisationId, params.organisationId),
        eq(permitEwcCodes.permitId, params.permitId),
        eq(permitEwcCodes.isActive, true),
      ),
    );

  return new Set(rows.map((row) => row.ewcCodeId));
}

async function regulatoryCandidates(params: {
  organisationId: string;
  siteId: string;
  permitId: string;
  actualEwcCodeId: string;
  regulator: string;
  at: Date;
  permitCodeIds: Set<string>;
  db: PermitDb;
}) {
  const rows = await params.db
    .select({
      activationId: siteRegulatoryAuthorities.id,
      activationReference: siteRegulatoryAuthorities.reference,
      activationValidFrom: siteRegulatoryAuthorities.validFrom,
      activationValidUntil: siteRegulatoryAuthorities.validUntil,
      conditionsConfirmedAt:
        siteRegulatoryAuthorities.conditionsConfirmedAt,

      authorityId: regulatoryAcceptanceAuthorities.id,
      authorityCode: regulatoryAcceptanceAuthorities.code,

      ruleId: regulatoryAcceptanceRules.id,
      ruleKey: regulatoryAcceptanceRules.ruleKey,
      ruleScope: regulatoryAcceptanceRules.legacyWasteDescription,
      selectedQualifyingAuthorisationRef:
        siteRegulatoryAuthorityRules.qualifyingAuthorisationRef,
      siteRuleConfirmedAt: siteRegulatoryAuthorityRules.confirmedAt,
      authorityName: regulatoryAcceptanceAuthorities.name,
      authorityType: regulatoryAcceptanceAuthorities.authorityType,
      ruleType: regulatoryAcceptanceAuthorities.ruleType,
      authorityRegulator: regulatoryAcceptanceAuthorities.regulator,
      jurisdiction: regulatoryAcceptanceAuthorities.jurisdiction,
      authorityValidFrom: regulatoryAcceptanceAuthorities.validFrom,
      authorityValidUntil: regulatoryAcceptanceAuthorities.validUntil,

      underlyingEwcCodeId:
        regulatoryAcceptanceRules.underlyingAuthorisationEwcCodeId,
      requiresUnderlyingPermitCode:
        regulatoryAcceptanceRules.requiresUnderlyingPermitCode,
      requiresManualConfirmation:
        regulatoryAcceptanceRules.requiresManualConfirmation,
    })
    .from(siteRegulatoryAuthorities)
    .innerJoin(
      regulatoryAcceptanceAuthorities,
      eq(
        regulatoryAcceptanceAuthorities.id,
        siteRegulatoryAuthorities.authorityId,
      ),
    )
    .innerJoin(
      regulatoryAcceptanceRules,
      eq(
        regulatoryAcceptanceRules.authorityId,
        regulatoryAcceptanceAuthorities.id,
      ),
    )
    .innerJoin(
      siteRegulatoryAuthorityRules,
      and(
        eq(
          siteRegulatoryAuthorityRules.activationId,
          siteRegulatoryAuthorities.id,
        ),
        eq(
          siteRegulatoryAuthorityRules.ruleId,
          regulatoryAcceptanceRules.id,
        ),
        eq(siteRegulatoryAuthorityRules.isActive, true),
      ),
    )
    .where(
      and(
        eq(
          siteRegulatoryAuthorities.organisationId,
          params.organisationId,
        ),
        eq(siteRegulatoryAuthorities.siteId, params.siteId),
        eq(siteRegulatoryAuthorities.permitId, params.permitId),
        eq(siteRegulatoryAuthorities.isActive, true),
        eq(regulatoryAcceptanceAuthorities.status, "active"),
        eq(
          regulatoryAcceptanceAuthorities.regulator,
          params.regulator as "EA" | "NRW" | "SEPA" | "NIEA" | "other",
        ),
        eq(regulatoryAcceptanceRules.actualEwcCodeId, params.actualEwcCodeId),
        eq(regulatoryAcceptanceRules.isActive, true),
      ),
    );

  const accepted = [];

  for (const row of rows) {
    if (
      !insideWindow(
        params.at,
        row.activationValidFrom,
        row.activationValidUntil,
      ) ||
      !insideWindow(
        params.at,
        row.authorityValidFrom,
        row.authorityValidUntil,
      )
    ) {
      continue;
    }

    if (
      row.requiresManualConfirmation &&
      (!row.conditionsConfirmedAt || !row.siteRuleConfirmedAt)
    ) {
      continue;
    }

    if (
      row.requiresUnderlyingPermitCode &&
      (!row.underlyingEwcCodeId ||
        !params.permitCodeIds.has(row.underlyingEwcCodeId))
    ) {
      continue;
    }

    accepted.push(row);
  }

  return accepted;
}

export async function resolvePermitEwcAcceptance(
  params: {
    organisationId: string;
    siteId: string;
    permitId: string;
    ewcCodeId: string;
    at?: Date;
  },
  db: PermitDb = database,
): Promise<PermitEwcAcceptance> {
  const at = params.at ?? new Date();

  const permit = await loadPermit({
    organisationId: params.organisationId,
    siteId: params.siteId,
    permitId: params.permitId,
    db,
  });

  if (
    !permit ||
    !insideWindow(at, permit.validFrom, permit.expiresAt)
  ) {
    return {
      allowed: false,
      matchType: "none",
      reason: "permit_unavailable",
    };
  }

  const actual = await loadActualCode(params.ewcCodeId, db);

  if (!actual?.classificationUsable) {
    return {
      allowed: false,
      matchType: "none",
      reason: "ewc_not_classification_usable",
    };
  }

  const permitCodeIds = await activePermitCodeIds({
    organisationId: params.organisationId,
    permitId: params.permitId,
    db,
  });

  if (permitCodeIds.has(actual.id)) {
    return {
      allowed: true,
      matchType: "exact",
      permitId: params.permitId,
      actualEwcCodeId: actual.id,
      actualEwcCode: actual.code,
      permittedEwcCodeId: actual.id,
      permittedEwcCode: actual.code,
      activationId: null,
      equivalenceId: null,
      basis: null,
      reference: null,
      authority: null,
      underlyingAuthorisation: {
        type: "environmental_permit",
        permitEwcCodeId: actual.id,
        permitEwcCode: actual.code,
      },
    };
  }

  const candidates = await regulatoryCandidates({
    organisationId: params.organisationId,
    siteId: params.siteId,
    permitId: params.permitId,
    actualEwcCodeId: actual.id,
    regulator: permit.regulator,
    at,
    permitCodeIds,
    db,
  });

  for (const candidate of candidates) {
    let underlyingCode = "";

    if (candidate.underlyingEwcCodeId) {
      const rows = await db
        .select({ code: ewcCodes.code })
        .from(ewcCodes)
        .where(
          eq(
            ewcCodes.id,
            candidate.underlyingEwcCodeId,
          ),
        )
        .limit(1);

      underlyingCode = rows[0]?.code ?? "";
    }

    const authority: RegulatoryAuthoritySummary = {
      activationId: candidate.activationId,
      authorityId: candidate.authorityId,
      code: candidate.authorityCode,
      name: candidate.authorityName,
      authorityType: candidate.authorityType,
      ruleType: candidate.ruleType,
      regulator: candidate.authorityRegulator,
      jurisdiction: candidate.jurisdiction,
      reference: candidate.activationReference,
      ruleId: candidate.ruleId,
      ruleKey: candidate.ruleKey,
      ruleScope: candidate.ruleScope,
      qualifyingAuthorisationRef:
        candidate.selectedQualifyingAuthorisationRef,
    };

    return {
      allowed: true,
      matchType: "regulatory_authority",
      permitId: params.permitId,
      actualEwcCodeId: actual.id,
      actualEwcCode: actual.code,
      permittedEwcCodeId:
        candidate.underlyingEwcCodeId ?? null,
      permittedEwcCode: underlyingCode,
      activationId: candidate.activationId,
      equivalenceId: candidate.activationId,
      basis: candidate.authorityCode,
      reference: candidate.activationReference,
      authority,
      underlyingAuthorisation: {
        type: candidate.underlyingEwcCodeId
          ? "environmental_permit"
          : "activity_authority",
        permitEwcCodeId:
          candidate.underlyingEwcCodeId ?? null,
        permitEwcCode: underlyingCode,
      },
    };
  }

  return {
    allowed: false,
    matchType: "none",
    reason: "ewc_not_authorised",
  };
}

export async function listPermitEwcAcceptances(
  params: {
    organisationId: string;
    siteId: string;
    permitId: string;
    at?: Date;
  },
  db: PermitDb = database,
): Promise<PermitEwcAcceptanceList> {
  const at = params.at ?? new Date();

  const permit = await loadPermit({
    organisationId: params.organisationId,
    siteId: params.siteId,
    permitId: params.permitId,
    db,
  });

  if (
    !permit ||
    !insideWindow(at, permit.validFrom, permit.expiresAt)
  ) {
    return {
      exactEwcCodeIds: [],
      regulatory: [],
      equivalent: [],
    };
  }

  const permitCodeIds = await activePermitCodeIds({
    organisationId: params.organisationId,
    permitId: params.permitId,
    db,
  });

  const classificationRows = await db
    .select({
      id: ewcCodes.id,
      classificationUsable: ewcCodes.classificationUsable,
    })
    .from(ewcCodes);

  const classificationMap = new Map(
    classificationRows.map((row) => [
      row.id,
      row.classificationUsable,
    ]),
  );

  const exactEwcCodeIds = Array.from(permitCodeIds).filter(
    (id) => classificationMap.get(id) === true,
  );

  const activationRows = await db
    .select({
      activationId: siteRegulatoryAuthorities.id,
      activationReference: siteRegulatoryAuthorities.reference,
      activationValidFrom: siteRegulatoryAuthorities.validFrom,
      activationValidUntil: siteRegulatoryAuthorities.validUntil,
      conditionsConfirmedAt:
        siteRegulatoryAuthorities.conditionsConfirmedAt,

      authorityId: regulatoryAcceptanceAuthorities.id,
      authorityCode: regulatoryAcceptanceAuthorities.code,
      authorityName: regulatoryAcceptanceAuthorities.name,
      ruleId: regulatoryAcceptanceRules.id,
      ruleKey: regulatoryAcceptanceRules.ruleKey,
      ruleScope: regulatoryAcceptanceRules.legacyWasteDescription,
      selectedQualifyingAuthorisationRef:
        siteRegulatoryAuthorityRules.qualifyingAuthorisationRef,
      siteRuleConfirmedAt: siteRegulatoryAuthorityRules.confirmedAt,
      authorityType: regulatoryAcceptanceAuthorities.authorityType,
      ruleType: regulatoryAcceptanceAuthorities.ruleType,
      authorityRegulator: regulatoryAcceptanceAuthorities.regulator,
      jurisdiction: regulatoryAcceptanceAuthorities.jurisdiction,
      authorityValidFrom: regulatoryAcceptanceAuthorities.validFrom,
      authorityValidUntil: regulatoryAcceptanceAuthorities.validUntil,

      actualEwcCodeId: regulatoryAcceptanceRules.actualEwcCodeId,
      underlyingEwcCodeId:
        regulatoryAcceptanceRules.underlyingAuthorisationEwcCodeId,
      requiresUnderlyingPermitCode:
        regulatoryAcceptanceRules.requiresUnderlyingPermitCode,
      requiresManualConfirmation:
        regulatoryAcceptanceRules.requiresManualConfirmation,
    })
    .from(siteRegulatoryAuthorities)
    .innerJoin(
      regulatoryAcceptanceAuthorities,
      eq(
        regulatoryAcceptanceAuthorities.id,
        siteRegulatoryAuthorities.authorityId,
      ),
    )
    .innerJoin(
      regulatoryAcceptanceRules,
      eq(
        regulatoryAcceptanceRules.authorityId,
        regulatoryAcceptanceAuthorities.id,
      ),
    )
    .innerJoin(
      siteRegulatoryAuthorityRules,
      and(
        eq(
          siteRegulatoryAuthorityRules.activationId,
          siteRegulatoryAuthorities.id,
        ),
        eq(
          siteRegulatoryAuthorityRules.ruleId,
          regulatoryAcceptanceRules.id,
        ),
        eq(siteRegulatoryAuthorityRules.isActive, true),
      ),
    )
    .where(
      and(
        eq(
          siteRegulatoryAuthorities.organisationId,
          params.organisationId,
        ),
        eq(siteRegulatoryAuthorities.siteId, params.siteId),
        eq(siteRegulatoryAuthorities.permitId, params.permitId),
        eq(siteRegulatoryAuthorities.isActive, true),
        eq(regulatoryAcceptanceAuthorities.status, "active"),
        eq(
          regulatoryAcceptanceAuthorities.regulator,
          permit.regulator,
        ),
        eq(regulatoryAcceptanceRules.isActive, true),
      ),
    );

  const regulatory: PermitEwcAcceptanceList["regulatory"] = [];

  for (const row of activationRows) {
    if (
      !insideWindow(
        at,
        row.activationValidFrom,
        row.activationValidUntil,
      ) ||
      !insideWindow(
        at,
        row.authorityValidFrom,
        row.authorityValidUntil,
      )
    ) continue;

    if (
      row.requiresManualConfirmation &&
      (!row.conditionsConfirmedAt || !row.siteRuleConfirmedAt)
    ) continue;

    if (
      row.requiresUnderlyingPermitCode &&
      (!row.underlyingEwcCodeId ||
        !permitCodeIds.has(row.underlyingEwcCodeId))
    ) continue;

    const actual = await loadActualCode(row.actualEwcCodeId, db);
    if (!actual?.classificationUsable) continue;

    let underlyingCode = "";
    if (row.underlyingEwcCodeId) {
      const codeRows = await db
        .select({ code: ewcCodes.code })
        .from(ewcCodes)
        .where(eq(ewcCodes.id, row.underlyingEwcCodeId))
        .limit(1);
      underlyingCode = codeRows[0]?.code ?? "";
    }

    regulatory.push({
      acceptedEwcCodeId: row.actualEwcCodeId,
      permittedEwcCodeId: row.underlyingEwcCodeId ?? null,
      permittedEwcCode: underlyingCode,
      activationId: row.activationId,
      equivalenceId: row.activationId,
      basis: row.authorityCode,
      reference: row.activationReference,
      authority: {
        activationId: row.activationId,
        authorityId: row.authorityId,
        code: row.authorityCode,
        name: row.authorityName,
        authorityType: row.authorityType,
        ruleType: row.ruleType,
        regulator: row.authorityRegulator,
        jurisdiction: row.jurisdiction,
        reference: row.activationReference,
        ruleId: row.ruleId,
        ruleKey: row.ruleKey,
        ruleScope: row.ruleScope,
        qualifyingAuthorisationRef:
          row.selectedQualifyingAuthorisationRef,
      },
    });
  }

  return {
    exactEwcCodeIds,
    regulatory,
    equivalent: regulatory,
  };
}
