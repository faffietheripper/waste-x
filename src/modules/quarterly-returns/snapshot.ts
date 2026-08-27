import {
  and,
  eq,
  gte,
  inArray,
  lt,
  or,
} from "drizzle-orm";

import { database } from "@/db/database";
import {
  counterpartySites,
  jobLoads,
} from "@/db/schema";
import {
  jobLoadReturnSnapshots,
  jobReturnProfiles,
  materialReturnProfiles,
  returnSettings,
  returnSiteGeographies,
  type ReturnGeographySubjectType,
} from "@/db/returns-schema";

export type SnapshotQuarter = {
  start: Date;
  endExclusive: Date;
};

export type SnapshotSubjectFilter = {
  subjectType: ReturnGeographySubjectType;
  subjectId: string;
};

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

/*
  Current behaviour:
  - creates a return snapshot when an eligible historic Load has none;
  - enriches ONLY missing geography fields on an existing snapshot;
  - never replaces a non-null historical geography value;
  - preserves an existing snapshot's classification values;
  - can target one counterparty Site after an automatic postcode resolution.

  This fixes the earlier backfill behaviour that skipped an existing snapshot
  entirely even when its Origin/Destination geography was still null.
*/
export async function backfillReturnSnapshots(params: {
  organisationId: string;
  period?: SnapshotQuarter;
  subjectFilter?: SnapshotSubjectFilter;
}) {
  const predicates = [
    eq(jobLoads.organisationId, params.organisationId),

    /*
      Incoming accepted/completed Loads are return candidates.
      Outgoing Loads become return candidates only when completed.
    */
    or(
      and(
        eq(jobLoads.direction, "incoming"),
        inArray(jobLoads.status, ["accepted", "completed"]),
      ),
      and(
        eq(jobLoads.direction, "outgoing"),
        eq(jobLoads.status, "completed"),
      ),
    ),
  ];

  if (params.period) {
    predicates.push(
      or(
        and(
          gte(jobLoads.receivedAt, params.period.start),
          lt(jobLoads.receivedAt, params.period.endExclusive),
        ),
        and(
          gte(jobLoads.movementAt, params.period.start),
          lt(jobLoads.movementAt, params.period.endExclusive),
        ),
        and(
          gte(jobLoads.completedAt, params.period.start),
          lt(jobLoads.completedAt, params.period.endExclusive),
        ),
      ),
    );
  }

  if (params.subjectFilter) {
    if (params.subjectFilter.subjectType === "counterparty_site") {
      predicates.push(
        or(
          eq(jobLoads.clientSiteId, params.subjectFilter.subjectId),
          eq(
            jobLoads.thirdPartyDestinationSiteId,
            params.subjectFilter.subjectId,
          ),
        ),
      );
    } else {
      predicates.push(eq(jobLoads.ownSiteId, params.subjectFilter.subjectId));
    }
  }

  const loads = await database.query.jobLoads.findMany({
    where: and(...predicates),
    columns: {
      id: true,
      organisationId: true,
      jobId: true,
      materialProfileId: true,
      clientSiteId: true,
      thirdPartyDestinationSiteId: true,
      direction: true,
    },
  });

  if (loads.length === 0) return 0;

  const loadIds = loads.map((load) => load.id);
  const jobIds = Array.from(new Set(loads.map((load) => load.jobId)));
  const materialIds = Array.from(
    new Set(
      loads
        .map((load) => load.materialProfileId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const counterpartySiteIds = Array.from(
    new Set(
      loads
        .flatMap((load) => [
          load.clientSiteId,
          load.thirdPartyDestinationSiteId,
        ])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [
    existingRows,
    settingsRows,
    jobProfiles,
    materialProfiles,
    geographies,
    counterpartySiteRows,
  ] = await Promise.all([
    database
      .select()
      .from(jobLoadReturnSnapshots)
      .where(inArray(jobLoadReturnSnapshots.jobLoadId, loadIds)),

    database
      .select()
      .from(returnSettings)
      .where(eq(returnSettings.organisationId, params.organisationId))
      .limit(1),

    jobIds.length
      ? database
          .select()
          .from(jobReturnProfiles)
          .where(inArray(jobReturnProfiles.jobId, jobIds))
      : Promise.resolve([]),

    materialIds.length
      ? database
          .select()
          .from(materialReturnProfiles)
          .where(inArray(materialReturnProfiles.materialProfileId, materialIds))
      : Promise.resolve([]),

    counterpartySiteIds.length
      ? database
          .select()
          .from(returnSiteGeographies)
          .where(
            and(
              eq(
                returnSiteGeographies.organisationId,
                params.organisationId,
              ),
              eq(returnSiteGeographies.subjectType, "counterparty_site"),
              inArray(
                returnSiteGeographies.subjectId,
                counterpartySiteIds,
              ),
            ),
          )
      : Promise.resolve([]),

    counterpartySiteIds.length
      ? database
          .select({
            id: counterpartySites.id,
            postcode: counterpartySites.postcode,
          })
          .from(counterpartySites)
          .where(inArray(counterpartySites.id, counterpartySiteIds))
      : Promise.resolve([]),
  ]);

  const settings = settingsRows[0];
  const existingMap = new Map(
    existingRows.map((row) => [row.jobLoadId, row]),
  );
  const jobMap = new Map(
    jobProfiles.map((row) => [row.jobId, row]),
  );
  const materialMap = new Map(
    materialProfiles.map((row) => [row.materialProfileId, row]),
  );
  const geographyMap = new Map(
    geographies.map((row) => [row.subjectId, row]),
  );
  const siteMap = new Map(
    counterpartySiteRows.map((row) => [row.id, row]),
  );

  const inserts: (typeof jobLoadReturnSnapshots.$inferInsert)[] = [];
  const updates: Array<{
    jobLoadId: string;
    values: Partial<typeof jobLoadReturnSnapshots.$inferInsert>;
  }> = [];

  for (const load of loads) {
    const existing = existingMap.get(load.id);
    const jobProfile = jobMap.get(load.jobId);
    const materialProfile = load.materialProfileId
      ? materialMap.get(load.materialProfileId)
      : undefined;

    const origin = load.clientSiteId
      ? geographyMap.get(load.clientSiteId)
      : undefined;

    const destination = load.thirdPartyDestinationSiteId
      ? geographyMap.get(load.thirdPartyDestinationSiteId)
      : undefined;

    const proposed = {
      jobLoadId: load.id,
      organisationId: load.organisationId,

      municipalSource:
        jobProfile?.municipalSource ??
        settings?.municipalSourceDefault ??
        false,

      degradable:
        materialProfile?.isDegradable ??
        false,

      fromAnotherActivity:
        clean(jobProfile?.fromAnotherActivity) ||
        clean(settings?.fromAnotherActivityDefault) ||
        "No facility",

      preTreatment:
        clean(jobProfile?.preTreatment) ||
        clean(settings?.preTreatmentDefault) ||
        "None",

      originLocalAuthorityCode:
        origin?.localAuthorityCode ?? null,

      originLocalAuthorityName:
        origin?.localAuthorityName ?? null,

      originReturnAreaLabel:
        origin?.returnAreaLabel ??
        origin?.localAuthorityName ??
        null,

      originPostcodeSnapshot:
        origin?.postcodeSnapshot ??
        (load.clientSiteId
          ? siteMap.get(load.clientSiteId)?.postcode ?? null
          : null),

      destinationLocalAuthorityCode:
        destination?.localAuthorityCode ?? null,

      destinationLocalAuthorityName:
        destination?.localAuthorityName ?? null,

      destinationReturnAreaLabel:
        destination?.returnAreaLabel ??
        destination?.localAuthorityName ??
        null,

      destinationPostcodeSnapshot:
        destination?.postcodeSnapshot ??
        (load.thirdPartyDestinationSiteId
          ? siteMap.get(load.thirdPartyDestinationSiteId)?.postcode ?? null
          : null),

      capturedAt: new Date(),
      updatedAt: new Date(),
    } satisfies typeof jobLoadReturnSnapshots.$inferInsert;

    if (!existing) {
      inserts.push(proposed);
      continue;
    }

    /*
      Existing snapshot = historical record.
      Fill only missing geography. Never overwrite a value already captured.
    */
    const patch: Partial<typeof jobLoadReturnSnapshots.$inferInsert> = {
      updatedAt: new Date(),
    };
    let changed = false;

    if (load.direction === "incoming") {
      if (
        !existing.originLocalAuthorityCode &&
        proposed.originLocalAuthorityCode
      ) {
        patch.originLocalAuthorityCode =
          proposed.originLocalAuthorityCode;
        changed = true;
      }

      if (
        !existing.originLocalAuthorityName &&
        proposed.originLocalAuthorityName
      ) {
        patch.originLocalAuthorityName =
          proposed.originLocalAuthorityName;
        changed = true;
      }

      if (
        !existing.originReturnAreaLabel &&
        proposed.originReturnAreaLabel
      ) {
        patch.originReturnAreaLabel =
          proposed.originReturnAreaLabel;
        changed = true;
      }

      if (
        !existing.originPostcodeSnapshot &&
        proposed.originPostcodeSnapshot
      ) {
        patch.originPostcodeSnapshot =
          proposed.originPostcodeSnapshot;
        changed = true;
      }
    }

    if (load.direction === "outgoing") {
      if (
        !existing.destinationLocalAuthorityCode &&
        proposed.destinationLocalAuthorityCode
      ) {
        patch.destinationLocalAuthorityCode =
          proposed.destinationLocalAuthorityCode;
        changed = true;
      }

      if (
        !existing.destinationLocalAuthorityName &&
        proposed.destinationLocalAuthorityName
      ) {
        patch.destinationLocalAuthorityName =
          proposed.destinationLocalAuthorityName;
        changed = true;
      }

      if (
        !existing.destinationReturnAreaLabel &&
        proposed.destinationReturnAreaLabel
      ) {
        patch.destinationReturnAreaLabel =
          proposed.destinationReturnAreaLabel;
        changed = true;
      }

      if (
        !existing.destinationPostcodeSnapshot &&
        proposed.destinationPostcodeSnapshot
      ) {
        patch.destinationPostcodeSnapshot =
          proposed.destinationPostcodeSnapshot;
        changed = true;
      }
    }

    if (changed) {
      updates.push({
        jobLoadId: load.id,
        values: patch,
      });
    }
  }

  if (inserts.length > 0) {
    await database.insert(jobLoadReturnSnapshots).values(inserts);
  }

  for (const update of updates) {
    await database
      .update(jobLoadReturnSnapshots)
      .set(update.values)
      .where(
        eq(
          jobLoadReturnSnapshots.jobLoadId,
          update.jobLoadId,
        ),
      );
  }

  return inserts.length + updates.length;
}
