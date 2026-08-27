import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  returnSiteGeographies,
  type ReturnGeographySubjectType,
} from "@/db/returns-schema";

import {
  normaliseUkPostcode,
  resolvePostcodes,
} from "./geography";
import { backfillReturnSnapshots } from "./snapshot";

export type SiteReturnGeographyResult =
  | {
      ok: true;
      status: "resolved" | "cached" | "manual_preserved";
      postcode: string;
      localAuthorityCode: string | null;
      localAuthorityName: string | null;
      returnAreaLabel: string | null;
    }
  | {
      ok: false;
      status:
        | "missing_postcode"
        | "postcode_not_found"
        | "postcode_service_unavailable";
      postcode: string;
      error?: string;
    };

async function getExisting(params: {
  organisationId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
}) {
  return database.query.returnSiteGeographies.findFirst({
    where: and(
      eq(returnSiteGeographies.organisationId, params.organisationId),
      eq(returnSiteGeographies.subjectType, params.subjectType),
      eq(returnSiteGeographies.subjectId, params.subjectId),
    ),
  });
}

async function saveUnresolvedAutoMapping(params: {
  organisationId: string;
  userId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
  postcode: string;
}) {
  await database
    .insert(returnSiteGeographies)
    .values({
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      postcodeSnapshot: params.postcode,
      localAuthorityCode: null,
      localAuthorityName: null,
      returnAreaLabel: null,
      source: "postcodes_io",
      resolvedAt: null,
      updatedByUserId: params.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        returnSiteGeographies.organisationId,
        returnSiteGeographies.subjectType,
        returnSiteGeographies.subjectId,
      ],
      set: {
        postcodeSnapshot: params.postcode,
        localAuthorityCode: null,
        localAuthorityName: null,
        returnAreaLabel: null,
        source: "postcodes_io",
        resolvedAt: null,
        updatedByUserId: params.userId,
        updatedAt: new Date(),
      },
    });
}

async function enrichHistoricSnapshots(params: {
  organisationId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
}) {
  /*
    Own-site geography is useful for setup/display, but the current EA
    Origin/Destination snapshot fields refer to counterparty source/destination
    sites. Only counterparty-site changes need a targeted snapshot enrichment.
  */
  if (params.subjectType !== "counterparty_site") return;

  await backfillReturnSnapshots({
    organisationId: params.organisationId,
    subjectFilter: {
      subjectType: params.subjectType,
      subjectId: params.subjectId,
    },
  });
}

/*
  Resolve and persist a physical Site's regulatory geography.

  Important product rules:
  - operational Site save must never fail just because the postcode API is down;
  - a deliberate manual geography override is never silently overwritten;
  - cached auto geography is reused if the postcode has not changed;
  - if an auto-resolved postcode changes and the new postcode cannot be resolved,
    the old authority is not falsely reused for the new postcode;
  - after a successful counterparty-site resolution, existing Load snapshots with
    missing geography are enriched without rewriting non-null history.
*/
export async function resolveAndPersistSiteReturnGeography(params: {
  organisationId: string;
  userId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
  postcode: string | null | undefined;
}): Promise<SiteReturnGeographyResult> {
  const postcode = normaliseUkPostcode(params.postcode);
  const existing = await getExisting(params);

  if (!postcode) {
    /*
      Keep a deliberate manual geography: a regulator/admin may intentionally
      know the return area even when an operational postcode is unavailable.
      Auto/imported mappings, however, should not survive after their postcode
      has been removed.
    */
    if (existing && existing.source !== "manual") {
      await database
        .delete(returnSiteGeographies)
        .where(
          and(
            eq(returnSiteGeographies.organisationId, params.organisationId),
            eq(returnSiteGeographies.subjectType, params.subjectType),
            eq(returnSiteGeographies.subjectId, params.subjectId),
          ),
        );
    }

    return {
      ok: false,
      status: "missing_postcode",
      postcode: "",
    };
  }

  if (existing?.source === "manual") {
    return {
      ok: true,
      status: "manual_preserved",
      postcode,
      localAuthorityCode: existing.localAuthorityCode,
      localAuthorityName: existing.localAuthorityName,
      returnAreaLabel: existing.returnAreaLabel,
    };
  }

  const cachedIsCurrent =
    existing?.postcodeSnapshot === postcode &&
    Boolean(existing.localAuthorityName?.trim()) &&
    Boolean(existing.returnAreaLabel?.trim());

  if (cachedIsCurrent) {
    await enrichHistoricSnapshots(params);

    return {
      ok: true,
      status: "cached",
      postcode,
      localAuthorityCode: existing?.localAuthorityCode ?? null,
      localAuthorityName: existing?.localAuthorityName ?? null,
      returnAreaLabel: existing?.returnAreaLabel ?? null,
    };
  }

  let resolved;
  try {
    resolved = await resolvePostcodes([postcode]);
  } catch (error) {
    /*
      If the physical postcode changed, do not keep an authority that belonged
      to the previous postcode. Persist an unresolved current-postcode row.
      If it did not change, retaining the previous mapping is safer during a
      temporary external-service outage.
    */
    if (!existing || existing.postcodeSnapshot !== postcode) {
      await saveUnresolvedAutoMapping({
        ...params,
        postcode,
      });
    }

    return {
      ok: false,
      status: "postcode_service_unavailable",
      postcode,
      error: error instanceof Error ? error.message : "POSTCODE_SERVICE_UNAVAILABLE",
    };
  }

  const match = resolved.get(postcode);

  if (!match) {
    await saveUnresolvedAutoMapping({
      ...params,
      postcode,
    });

    return {
      ok: false,
      status: "postcode_not_found",
      postcode,
    };
  }

  await database
    .insert(returnSiteGeographies)
    .values({
      organisationId: params.organisationId,
      subjectType: params.subjectType,
      subjectId: params.subjectId,
      postcodeSnapshot: match.postcode,
      localAuthorityCode: match.localAuthorityCode,
      localAuthorityName: match.localAuthorityName,
      returnAreaLabel: match.returnAreaLabel,
      source: "postcodes_io",
      resolvedAt: new Date(),
      updatedByUserId: params.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        returnSiteGeographies.organisationId,
        returnSiteGeographies.subjectType,
        returnSiteGeographies.subjectId,
      ],
      set: {
        postcodeSnapshot: match.postcode,
        localAuthorityCode: match.localAuthorityCode,
        localAuthorityName: match.localAuthorityName,
        returnAreaLabel: match.returnAreaLabel,
        source: "postcodes_io",
        resolvedAt: new Date(),
        updatedByUserId: params.userId,
        updatedAt: new Date(),
      },
    });

  await enrichHistoricSnapshots(params);

  return {
    ok: true,
    status: "resolved",
    postcode: match.postcode,
    localAuthorityCode: match.localAuthorityCode,
    localAuthorityName: match.localAuthorityName,
    returnAreaLabel: match.returnAreaLabel,
  };
}

/*
  Use this from normal Site create/update actions.

  The Site itself is the source of truth and must still save if Postcodes.io is
  unavailable. Returns Setup / Exceptions can surface an unresolved postcode
  later, while the normal operator workflow remains uninterrupted.
*/
export async function resolveSiteReturnGeographyBestEffort(params: {
  organisationId: string;
  userId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
  postcode: string | null | undefined;
}) {
  try {
    return await resolveAndPersistSiteReturnGeography(params);
  } catch (error) {
    return {
      ok: false as const,
      status: "postcode_service_unavailable" as const,
      postcode: normaliseUkPostcode(params.postcode),
      error: error instanceof Error ? error.message : "POSTCODE_GEOGRAPHY_FAILED",
    };
  }
}
