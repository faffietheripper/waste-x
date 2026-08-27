"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import {
  counterpartySites,
  jobLoads,
  sites,
} from "@/db/schema";
import {
  jobLoadReturnSnapshots,
  jobReturnProfiles,
  materialReturnProfiles,
  returnSettings,
  returnSiteGeographies,
  type ReturnGeographySubjectType,
} from "@/db/returns-schema";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import { parseQuarterSearchParams } from "@/modules/admin-value/core/quarterPeriods";
import {
  normaliseUkPostcode,
  resolvePostcodes,
} from "@/modules/quarterly-returns/geography";
import { backfillReturnSnapshots } from "@/modules/quarterly-returns/snapshot";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: FormDataEntryValue | null) {
  const valueString = clean(value);
  return valueString || null;
}

function optionalBoolean(value: FormDataEntryValue | null) {
  const valueString = clean(value);
  if (valueString === "yes" || valueString === "true") return true;
  if (valueString === "no" || valueString === "false") return false;
  return null;
}

function returnUrl(
  formData: FormData,
  params: Record<string, string>,
) {
  const query = new URLSearchParams();
  const year = clean(formData.get("year"));
  const quarter = clean(formData.get("quarter"));
  const siteId = clean(formData.get("siteId"));
  const view = clean(formData.get("view"));

  if (year) query.set("year", year);
  if (quarter) query.set("quarter", quarter);
  if (siteId) query.set("siteId", siteId);
  if (view) query.set("view", view);

  for (const [key, value] of Object.entries(params)) {
    query.set(key, value);
  }

  return `/home/returns?${query.toString()}`;
}

export async function saveReturnSettingsAction(formData: FormData) {
  const access = await requireAdminValueAccess();

  const municipalSourceDefault =
    optionalBoolean(formData.get("municipalSourceDefault")) ?? false;
  const fromAnotherActivityDefault =
    optional(formData.get("fromAnotherActivityDefault")) ?? "No facility";
  const preTreatmentDefault =
    optional(formData.get("preTreatmentDefault")) ?? "None";

  await database
    .insert(returnSettings)
    .values({
      organisationId: access.organisationId,
      regulator: "EA",
      formVersion: "17.0",
      municipalSourceDefault,
      fromAnotherActivityDefault,
      preTreatmentDefault,
      updatedByUserId: access.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: returnSettings.organisationId,
      set: {
        regulator: "EA",
        formVersion: "17.0",
        municipalSourceDefault,
        fromAnotherActivityDefault,
        preTreatmentDefault,
        updatedByUserId: access.userId,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "settings_saved" }));
}

export async function saveMaterialReturnProfileAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const materialProfileId = clean(formData.get("materialProfileId"));
  const isDegradable =
    optionalBoolean(formData.get("isDegradable")) ?? false;

  if (!materialProfileId) {
    redirect(returnUrl(formData, { error: "material_required" }));
  }

  await database
    .insert(materialReturnProfiles)
    .values({
      materialProfileId,
      organisationId: access.organisationId,
      isDegradable,
      updatedByUserId: access.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: materialReturnProfiles.materialProfileId,
      set: {
        isDegradable,
        updatedByUserId: access.userId,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "material_saved" }));
}

export async function saveJobReturnProfileAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = clean(formData.get("jobId"));

  if (!jobId) {
    redirect(returnUrl(formData, { error: "job_required" }));
  }

  const municipalSource =
    optionalBoolean(formData.get("municipalSource")) ?? false;
  const fromAnotherActivity =
    optional(formData.get("fromAnotherActivity")) ?? "No facility";
  const preTreatment =
    optional(formData.get("preTreatment")) ?? "None";

  await database
    .insert(jobReturnProfiles)
    .values({
      jobId,
      organisationId: access.organisationId,
      municipalSource,
      fromAnotherActivity,
      preTreatment,
      updatedByUserId: access.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: jobReturnProfiles.jobId,
      set: {
        municipalSource,
        fromAnotherActivity,
        preTreatment,
        updatedByUserId: access.userId,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "job_return_profile_saved" }));
}


/*
  Fast exception correction.

  This is deliberately Load-specific. Organisation defaults stay lightweight,
  Job overrides handle the normal planned case, and this action is the escape
  hatch when one real movement is different.
*/
export async function saveLoadReturnOverrideAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobLoadId = clean(formData.get("jobLoadId"));

  if (!jobLoadId) {
    redirect(returnUrl(formData, { error: "load_required" }));
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, jobLoadId),
      eq(jobLoads.organisationId, access.organisationId),
    ),
    columns: {
      id: true,
      organisationId: true,
    },
  });

  if (!load) {
    redirect(returnUrl(formData, { error: "load_not_found" }));
  }

  const municipalSource =
    optionalBoolean(formData.get("municipalSource")) ?? false;
  const degradable =
    optionalBoolean(formData.get("degradable")) ?? false;
  const fromAnotherActivity =
    optional(formData.get("fromAnotherActivity")) ?? "No facility";
  const preTreatment =
    optional(formData.get("preTreatment")) ?? "None";

  await database
    .insert(jobLoadReturnSnapshots)
    .values({
      jobLoadId: load.id,
      organisationId: access.organisationId,
      municipalSource,
      degradable,
      fromAnotherActivity,
      preTreatment,
      capturedAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: jobLoadReturnSnapshots.jobLoadId,
      set: {
        municipalSource,
        degradable,
        fromAnotherActivity,
        preTreatment,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "load_return_override_saved" }));
}

async function upsertResolvedGeography(params: {
  organisationId: string;
  userId: string;
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
  postcode: string;
}) {
  const resolved = await resolvePostcodes([params.postcode]);
  const match = resolved.get(params.postcode);

  if (!match) return false;

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

  return true;
}

export async function resolveSingleReturnGeographyAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const subjectType = clean(
    formData.get("subjectType"),
  ) as ReturnGeographySubjectType;
  const subjectId = clean(formData.get("subjectId"));
  const postcode = normaliseUkPostcode(clean(formData.get("postcode")));

  if (
    !["own_site", "counterparty_site"].includes(subjectType) ||
    !subjectId ||
    !postcode
  ) {
    redirect(returnUrl(formData, { error: "geography_postcode_required" }));
  }

  try {
    const resolved = await upsertResolvedGeography({
      organisationId: access.organisationId,
      userId: access.userId,
      subjectType,
      subjectId,
      postcode,
    });

    if (!resolved) {
      redirect(returnUrl(formData, { error: "geography_not_found" }));
    }
  } catch {
    redirect(returnUrl(formData, { error: "postcode_service_unavailable" }));
  }

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "geography_resolved" }));
}

export async function saveReturnAreaOverrideAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const subjectType = clean(formData.get("subjectType")) as ReturnGeographySubjectType;
  const subjectId = clean(formData.get("subjectId"));
  const localAuthorityName = clean(formData.get("localAuthorityName"));
  const localAuthorityCode = optional(formData.get("localAuthorityCode"));
  const returnAreaLabel = clean(formData.get("returnAreaLabel"));
  const postcodeSnapshot = normaliseUkPostcode(clean(formData.get("postcode")));

  if (
    !["own_site", "counterparty_site"].includes(subjectType) ||
    !subjectId ||
    !localAuthorityName ||
    !returnAreaLabel
  ) {
    redirect(returnUrl(formData, { error: "invalid_geography_override" }));
  }

  await database
    .insert(returnSiteGeographies)
    .values({
      organisationId: access.organisationId,
      subjectType,
      subjectId,
      postcodeSnapshot: postcodeSnapshot || null,
      localAuthorityCode,
      localAuthorityName,
      returnAreaLabel,
      source: "manual",
      resolvedAt: new Date(),
      updatedByUserId: access.userId,
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
        postcodeSnapshot: postcodeSnapshot || null,
        localAuthorityCode,
        localAuthorityName,
        returnAreaLabel,
        source: "manual",
        resolvedAt: new Date(),
        updatedByUserId: access.userId,
        updatedAt: new Date(),
      },
    });

  revalidatePath("/home/returns");
  redirect(returnUrl(formData, { success: "geography_override_saved" }));
}

export async function resolveReturnGeographiesAction(formData: FormData) {
  const access = await requireAdminValueAccess();

  const [ownSites, counterpartySiteRows] = await Promise.all([
    database.query.sites.findMany({
      where: eq(sites.organisationId, access.organisationId),
      columns: {
        id: true,
        postcode: true,
      },
    }),
    database.query.counterpartySites.findMany({
      where: eq(counterpartySites.organisationId, access.organisationId),
      columns: {
        id: true,
        postcode: true,
      },
    }),
  ]);

  const subjects = [
    ...ownSites.map((site) => ({
      subjectType: "own_site" as const,
      subjectId: site.id,
      postcode: normaliseUkPostcode(site.postcode),
    })),
    ...counterpartySiteRows.map((site) => ({
      subjectType: "counterparty_site" as const,
      subjectId: site.id,
      postcode: normaliseUkPostcode(site.postcode),
    })),
  ];

  const withPostcodes = subjects.filter((subject) => Boolean(subject.postcode));

  if (withPostcodes.length === 0) {
    redirect(returnUrl(formData, { error: "no_postcodes_to_resolve" }));
  }

  let resolved;
  try {
    resolved = await resolvePostcodes(
      withPostcodes.map((subject) => subject.postcode),
    );
  } catch {
    redirect(returnUrl(formData, { error: "postcode_service_unavailable" }));
  }

  let resolvedCount = 0;

  for (const subject of withPostcodes) {
    const match = resolved.get(subject.postcode);
    if (!match) continue;

    await database
      .insert(returnSiteGeographies)
      .values({
        organisationId: access.organisationId,
        subjectType: subject.subjectType,
        subjectId: subject.subjectId,
        postcodeSnapshot: match.postcode,
        localAuthorityCode: match.localAuthorityCode,
        localAuthorityName: match.localAuthorityName,
        returnAreaLabel: match.returnAreaLabel,
        source: "postcodes_io",
        resolvedAt: new Date(),
        updatedByUserId: access.userId,
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
          updatedByUserId: access.userId,
          updatedAt: new Date(),
        },
      });

    resolvedCount += 1;
  }

  revalidatePath("/home/returns");
  redirect(
    returnUrl(formData, {
      success: "geographies_resolved",
      resolved: String(resolvedCount),
    }),
  );
}

export async function backfillQuarterReturnSnapshotsAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const year = clean(formData.get("year"));
  const quarter = clean(formData.get("quarter"));
  const period = parseQuarterSearchParams({ year, quarter });

  const count = await backfillReturnSnapshots({
    organisationId: access.organisationId,
    period: {
      start: period.start,
      endExclusive: period.endExclusive,
    },
  });

  revalidatePath("/home/returns");
  redirect(
    returnUrl(formData, {
      success: "snapshots_backfilled",
      count: String(count),
    }),
  );
}
