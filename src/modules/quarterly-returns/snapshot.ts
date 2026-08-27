import { and, eq, inArray, or, gte, lt } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  counterpartySites,
} from "@/db/schema";
import {
  jobLoadReturnSnapshots,
  jobReturnProfiles,
  materialReturnProfiles,
  returnSettings,
  returnSiteGeographies,
} from "@/db/returns-schema";

export type SnapshotQuarter = {
  start: Date;
  endExclusive: Date;
};

/*
  Backfills only missing Load snapshots. The database trigger handles future
  accepted/completed Loads automatically; this function is for historic data
  that existed before the return upgrade was installed.
*/
export async function backfillReturnSnapshots(params: {
  organisationId: string;
  period?: SnapshotQuarter;
}) {
  const where = params.period
    ? and(
        eq(jobLoads.organisationId, params.organisationId),
        inArray(jobLoads.status, ["accepted", "completed"]),
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
      )
    : and(
        eq(jobLoads.organisationId, params.organisationId),
        inArray(jobLoads.status, ["accepted", "completed"]),
      );

  const loads = await database.query.jobLoads.findMany({
    where,
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
  const existing = await database
    .select({ jobLoadId: jobLoadReturnSnapshots.jobLoadId })
    .from(jobLoadReturnSnapshots)
    .where(inArray(jobLoadReturnSnapshots.jobLoadId, loadIds));

  const existingIds = new Set(existing.map((row) => row.jobLoadId));
  const missing = loads.filter((load) => !existingIds.has(load.id));

  if (missing.length === 0) return 0;

  const [settings] = await database
    .select()
    .from(returnSettings)
    .where(eq(returnSettings.organisationId, params.organisationId))
    .limit(1);

  const jobIds = Array.from(new Set(missing.map((load) => load.jobId)));
  const materialIds = Array.from(
    new Set(
      missing
        .map((load) => load.materialProfileId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const counterpartySiteIds = Array.from(
    new Set(
      missing
        .flatMap((load) => [
          load.clientSiteId,
          load.thirdPartyDestinationSiteId,
        ])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [jobProfiles, materialProfiles, geographies, counterpartySiteRows] =
    await Promise.all([
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
                eq(returnSiteGeographies.organisationId, params.organisationId),
                eq(returnSiteGeographies.subjectType, "counterparty_site"),
                inArray(returnSiteGeographies.subjectId, counterpartySiteIds),
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

  const jobMap = new Map(jobProfiles.map((row) => [row.jobId, row]));
  const materialMap = new Map(
    materialProfiles.map((row) => [row.materialProfileId, row]),
  );
  const geographyMap = new Map(geographies.map((row) => [row.subjectId, row]));
  const siteMap = new Map(counterpartySiteRows.map((row) => [row.id, row]));

  const rows = missing.map((load) => {
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

    return {
      jobLoadId: load.id,
      organisationId: load.organisationId,
      municipalSource:
        jobProfile?.municipalSource ?? settings?.municipalSourceDefault ?? false,
      degradable: materialProfile?.isDegradable ?? false,
      fromAnotherActivity:
        jobProfile?.fromAnotherActivity?.trim() ||
        settings?.fromAnotherActivityDefault?.trim() ||
        "No facility",
      preTreatment:
        jobProfile?.preTreatment?.trim() ||
        settings?.preTreatmentDefault?.trim() ||
        "None",

      originLocalAuthorityCode: origin?.localAuthorityCode ?? null,
      originLocalAuthorityName: origin?.localAuthorityName ?? null,
      originReturnAreaLabel:
        origin?.returnAreaLabel ?? origin?.localAuthorityName ?? null,
      originPostcodeSnapshot:
        origin?.postcodeSnapshot ??
        (load.clientSiteId ? siteMap.get(load.clientSiteId)?.postcode ?? null : null),

      destinationLocalAuthorityCode: destination?.localAuthorityCode ?? null,
      destinationLocalAuthorityName: destination?.localAuthorityName ?? null,
      destinationReturnAreaLabel:
        destination?.returnAreaLabel ?? destination?.localAuthorityName ?? null,
      destinationPostcodeSnapshot:
        destination?.postcodeSnapshot ??
        (load.thirdPartyDestinationSiteId
          ? siteMap.get(load.thirdPartyDestinationSiteId)?.postcode ?? null
          : null),

      capturedAt: new Date(),
      updatedAt: new Date(),
    };
  });

  if (rows.length) {
    await database.insert(jobLoadReturnSnapshots).values(rows);
  }

  return rows.length;
}
