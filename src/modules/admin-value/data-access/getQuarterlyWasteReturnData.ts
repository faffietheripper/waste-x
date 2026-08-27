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
  jobLoads,
  jobs,
  materialProfiles,
  permitEwcCodes,
  sites,
  counterpartySites,
} from "@/db/schema";
import {
  jobLoadReturnSnapshots,
  jobReturnProfiles,
  materialReturnProfiles,
  returnSettings,
  returnSiteGeographies,
} from "@/db/returns-schema";

import { roundTonnes, weightToTonnes } from "../core/commercialMath";
import type { QuarterPeriod } from "../core/quarterPeriods";

export type WasteReturnDirection = "received" | "removed";

export type WasteReturnDetailRow = {
  jobLoadId: string;
  jobNumber: string;
  loadNumber: number;
  direction: WasteReturnDirection;
  eventAt: Date;
  siteId: string;
  siteName: string;
  permitId: string;
  permitNumber: string;
  regulator: string;
  ewcCode: string;
  wasteDescription: string;
  tonnes: number;
  ticketNumber: string;
  counterpartyName: string;
  counterpartySiteName: string;
  thirdPartyDestination: string;

  disposalRecoveryCode: string;
  municipalSource: boolean;
  degradable: boolean | null;
  state: string;
  fromAnotherActivity: string;
  preTreatment: string;
  origin: string;
  destination: string;
};

export type WasteReturnAggregateRow = {
  ewcCode: string;
  wasteDescription: string;
  receivedLoads: number;
  receivedTonnes: number;
  removedLoads: number;
  removedTonnes: number;
};

export type IncomingReturnRow = {
  key: string;
  origin: string;
  originCode: string;
  ewcCode: string;
  wasteDescription: string;
  disposalRecoveryCode: string;
  municipalSource: boolean;
  degradable: boolean;
  state: string;
  fromAnotherActivity: string;
  tonnes: number;
  preTreatment: string;
  loadCount: number;
};

export type OutgoingReturnRow = {
  key: string;
  destination: string;
  destinationCode: string;
  ewcCode: string;
  wasteDescription: string;
  municipalSource: boolean;
  state: string;
  disposalRecoveryCode: string;
  tonnes: number;
  loadCount: number;
};

export type WasteReturnException = {
  jobLoadId: string;
  jobId: string;
  jobNumber: string;
  loadNumber: number;
  direction: WasteReturnDirection;
  issue: string;
  blocking: boolean;

  materialProfileId: string | null;
  materialName: string;

  municipalSource: boolean;
  degradable: boolean;
  fromAnotherActivity: string;
  preTreatment: string;

  geographySubjectType: "counterparty_site" | null;
  geographySubjectId: string | null;
  geographyName: string;
  geographyPostcode: string;
  geographyLocalAuthorityCode: string;
  geographyLocalAuthorityName: string;
  geographyReturnAreaLabel: string;
};

export type WasteReturnSiteOption = {
  id: string;
  name: string;
  postcode: string;
  isDefault: boolean;
  primaryPermitId: string | null;
  primaryPermitNumber: string | null;
  regulator: string | null;
};

export type ReturnMaterialSetupRow = {
  id: string;
  name: string;
  isDegradable: boolean;
  hasOverride: boolean;
};

export type ReturnJobSetupRow = {
  id: string;
  jobNumber: string;
  clientName: string;
  municipalSource: boolean;
  fromAnotherActivity: string;
  preTreatment: string;
  hasOverride: boolean;
};

export type ReturnGeographySetupRow = {
  subjectType: "own_site" | "counterparty_site";
  subjectId: string;
  name: string;
  postcode: string;
  localAuthorityCode: string;
  localAuthorityName: string;
  returnAreaLabel: string;
  source: string;
  resolved: boolean;
};

export type QuarterlyWasteReturnData = {
  period: QuarterPeriod;
  sites: WasteReturnSiteOption[];
  selectedSiteId: string | null;
  selectedSite: WasteReturnSiteOption | null;
  detailRows: WasteReturnDetailRow[];
  aggregateRows: WasteReturnAggregateRow[];
  incomingRows: IncomingReturnRow[];
  outgoingRows: OutgoingReturnRow[];
  exceptions: WasteReturnException[];
  settings: {
    regulator: string;
    formVersion: string;
    municipalSourceDefault: boolean;
    fromAnotherActivityDefault: string;
    preTreatmentDefault: string;
  };
  setup: {
    materials: ReturnMaterialSetupRow[];
    jobs: ReturnJobSetupRow[];
    geographies: ReturnGeographySetupRow[];
    unresolvedGeographyCount: number;
    missingMaterialClassificationCount: number;
    missingJobClassificationCount: number;
  };
  totals: {
    receivedLoads: number;
    receivedTonnes: number;
    removedLoads: number;
    removedTonnes: number;
  };
};

function cleanEwc(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function isWithinPeriod(date: Date, period: QuarterPeriod) {
  return date >= period.start && date < period.endExclusive;
}

function cleanText(value: string | null | undefined) {
  return (value ?? "").trim();
}

function booleanLabel(value: boolean) {
  return value ? "Yes" : "No";
}

export async function getQuarterlyWasteReturnData(params: {
  organisationId: string;
  period: QuarterPeriod;
  requestedSiteId?: string | null;
}): Promise<QuarterlyWasteReturnData> {
  const ownSites = await database.query.sites.findMany({
    where: and(
      eq(sites.organisationId, params.organisationId),
      eq(sites.status, "active"),
      eq(sites.siteType, "waste_receiving_site"),
    ),
    with: {
      permits: true,
    },
  });

  const siteOptions: WasteReturnSiteOption[] = ownSites
    .map((site) => {
      const primaryPermit =
        site.permits.find(
          (permit) => permit.status === "active" && permit.isPrimary,
        ) ?? site.permits.find((permit) => permit.status === "active") ?? null;

      return {
        id: site.id,
        name: site.name,
        postcode: site.postcode ?? "",
        isDefault: site.isDefault,
        primaryPermitId: primaryPermit?.id ?? null,
        primaryPermitNumber: primaryPermit?.permitNumber ?? null,
        regulator: primaryPermit?.regulator ?? null,
      };
    })
    .sort((a, b) => {
      if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const requestedIsValid = siteOptions.some(
    (site) => site.id === params.requestedSiteId,
  );

  const selectedSiteId = requestedIsValid
    ? params.requestedSiteId ?? null
    : siteOptions[0]?.id ?? null;

  const selectedSite =
    siteOptions.find((site) => site.id === selectedSiteId) ?? null;

  const [settingsRow] = await database
    .select()
    .from(returnSettings)
    .where(eq(returnSettings.organisationId, params.organisationId))
    .limit(1);

  const settings = {
    regulator: settingsRow?.regulator ?? "EA",
    formVersion: settingsRow?.formVersion ?? "17.0",
    municipalSourceDefault: settingsRow?.municipalSourceDefault ?? false,
    fromAnotherActivityDefault:
      cleanText(settingsRow?.fromAnotherActivityDefault) || "No facility",
    preTreatmentDefault:
      cleanText(settingsRow?.preTreatmentDefault) || "None",
  };

  if (!selectedSiteId || !selectedSite) {
    return {
      period: params.period,
      sites: siteOptions,
      selectedSiteId: null,
      selectedSite: null,
      detailRows: [],
      aggregateRows: [],
      incomingRows: [],
      outgoingRows: [],
      exceptions: [],
      settings,
      setup: {
        materials: [],
        jobs: [],
        geographies: [],
        unresolvedGeographyCount: 0,
        missingMaterialClassificationCount: 0,
        missingJobClassificationCount: 0,
      },
      totals: {
        receivedLoads: 0,
        receivedTonnes: 0,
        removedLoads: 0,
        removedTonnes: 0,
      },
    };
  }

  const candidateLoads = await database.query.jobLoads.findMany({
    where: and(
      eq(jobLoads.organisationId, params.organisationId),
      eq(jobLoads.ownSiteId, selectedSiteId),
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
    ),
    with: {
      job: true,
      ownSite: true,
      sitePermit: true,
      ewcCode: true,
      client: true,
      clientSite: true,
      thirdPartyDestinationSite: true,
    },
  });

  const loadIds = candidateLoads.map((load) => load.id);
  const jobIds = Array.from(new Set(candidateLoads.map((load) => load.jobId)));
  const materialIds = Array.from(
    new Set(
      candidateLoads
        .map((load) => load.materialProfileId)
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const counterpartySiteIds = Array.from(
    new Set(
      candidateLoads
        .flatMap((load) => [
          load.clientSiteId,
          load.thirdPartyDestinationSiteId,
        ])
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const [
    snapshotRows,
    jobProfileRows,
    materialProfileRows,
    geographyRows,
    materialRows,
    jobRows,
    counterpartySiteRows,
    allOwnGeographies,
  ] = await Promise.all([
    loadIds.length
      ? database
          .select()
          .from(jobLoadReturnSnapshots)
          .where(inArray(jobLoadReturnSnapshots.jobLoadId, loadIds))
      : Promise.resolve([]),
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
    materialIds.length
      ? database
          .select({
            id: materialProfiles.id,
            name: materialProfiles.name,
          })
          .from(materialProfiles)
          .where(inArray(materialProfiles.id, materialIds))
      : Promise.resolve([]),
    jobIds.length
      ? database
          .select({
            id: jobs.id,
            jobNumber: jobs.jobNumber,
            clientCounterpartyId: jobs.clientCounterpartyId,
          })
          .from(jobs)
          .where(inArray(jobs.id, jobIds))
      : Promise.resolve([]),
    counterpartySiteIds.length
      ? database
          .select({
            id: counterpartySites.id,
            name: counterpartySites.name,
            postcode: counterpartySites.postcode,
          })
          .from(counterpartySites)
          .where(inArray(counterpartySites.id, counterpartySiteIds))
      : Promise.resolve([]),
    database
      .select()
      .from(returnSiteGeographies)
      .where(
        and(
          eq(returnSiteGeographies.organisationId, params.organisationId),
          eq(returnSiteGeographies.subjectType, "own_site"),
        ),
      ),
  ]);

  const snapshots = new Map(snapshotRows.map((row) => [row.jobLoadId, row]));
  const jobProfiles = new Map(jobProfileRows.map((row) => [row.jobId, row]));
  const materialReturnMap = new Map(
    materialProfileRows.map((row) => [row.materialProfileId, row]),
  );
  const geographies = new Map(geographyRows.map((row) => [row.subjectId, row]));
  const materialNames = new Map(materialRows.map((row) => [row.id, row.name]));

  const permitIds = Array.from(
    new Set(
      candidateLoads
        .map((load) => load.sitePermitId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const permitMappings = permitIds.length
    ? await database
        .select({
          permitId: permitEwcCodes.permitId,
          ewcCodeId: permitEwcCodes.ewcCodeId,
        })
        .from(permitEwcCodes)
        .where(
          and(
            eq(permitEwcCodes.organisationId, params.organisationId),
            inArray(permitEwcCodes.permitId, permitIds),
            eq(permitEwcCodes.isActive, true),
          ),
        )
    : [];

  const permittedPairs = new Set(
    permitMappings.map((row) => `${row.permitId}:${row.ewcCodeId}`),
  );

  const detailRows: WasteReturnDetailRow[] = [];
  const exceptions: WasteReturnException[] = [];

  for (const load of candidateLoads) {
    const direction: WasteReturnDirection =
      load.direction === "outgoing" ? "removed" : "received";

    if (direction === "received" && !["accepted", "completed"].includes(load.status)) {
      continue;
    }

    if (direction === "removed" && load.status !== "completed") {
      continue;
    }

    const eventAt = direction === "received" ? load.receivedAt : load.movementAt;
    const ewcCode = cleanEwc(load.ewcCodeSnapshot ?? load.ewcCode?.code);
    const tonnes = weightToTonnes(load.netWeight, load.weightMetric);
    const state = cleanText(load.physicalFormSnapshot);
    const disposalRecoveryCode = cleanText(load.disposalRecoveryCodeSnapshot);

    const snapshot = snapshots.get(load.id);
    const jobProfile = jobProfiles.get(load.jobId);
    const materialProfile = load.materialProfileId
      ? materialReturnMap.get(load.materialProfileId)
      : undefined;
    const originGeo = load.clientSiteId
      ? geographies.get(load.clientSiteId)
      : undefined;
    const destinationGeo = load.thirdPartyDestinationSiteId
      ? geographies.get(load.thirdPartyDestinationSiteId)
      : undefined;

    /*
      Low-friction regulatory defaults.

      These are explicitly allowed to default because the operator can override
      the Job or individual Load when the real movement is different.
      We still never default geography, weights, EWC, D/R, dates or permit data.
    */
    const municipalSource =
      snapshot?.municipalSource ??
      jobProfile?.municipalSource ??
      settings.municipalSourceDefault ??
      false;

    const degradable =
      snapshot?.degradable ??
      materialProfile?.isDegradable ??
      false;

    const fromAnotherActivity =
      cleanText(
        snapshot?.fromAnotherActivity ??
          jobProfile?.fromAnotherActivity ??
          settings.fromAnotherActivityDefault,
      ) || "No facility";

    const preTreatment =
      cleanText(
        snapshot?.preTreatment ??
          jobProfile?.preTreatment ??
          settings.preTreatmentDefault,
      ) || "None";

    const origin = cleanText(
      snapshot?.originReturnAreaLabel ??
        originGeo?.returnAreaLabel ??
        originGeo?.localAuthorityName,
    );
    const originCode = cleanText(
      snapshot?.originLocalAuthorityCode ?? originGeo?.localAuthorityCode,
    );

    const destination = cleanText(
      snapshot?.destinationReturnAreaLabel ??
        destinationGeo?.returnAreaLabel ??
        destinationGeo?.localAuthorityName,
    );
    const destinationCode = cleanText(
      snapshot?.destinationLocalAuthorityCode ??
        destinationGeo?.localAuthorityCode,
    );

    const issues: string[] = [];

    if (!eventAt || !isWithinPeriod(eventAt, params.period)) {
      issues.push(
        direction === "received"
          ? "Missing date/time received. This Load is excluded from the prepared return."
          : "Missing movement/removal date. This Load is excluded from the prepared return.",
      );
    }

    if (!ewcCode) {
      issues.push("No EWC code snapshot is available for this Load.");
    }

    if (tonnes <= 0) {
      issues.push("No usable positive net weight is available for this Load.");
    }

    if (!state) {
      issues.push("Physical state is missing for this Load.");
    }

    if (!disposalRecoveryCode) {
      issues.push("Disposal / recovery code is missing for this Load.");
    }

    if (!load.sitePermitId || !load.sitePermit) {
      issues.push("No receiving-site permit is linked to this Load.");
    }

    if (
      load.sitePermitId &&
      load.ewcCodeId &&
      !permittedPairs.has(`${load.sitePermitId}:${load.ewcCodeId}`)
    ) {
      issues.push(
        `EWC ${ewcCode || "unknown"} is not currently configured against the permit linked to this Load.`,
      );
    }

    if (direction === "received" && !origin) {
      issues.push(
        `Origin local authority could not be resolved${
          load.clientSite?.postcode
            ? ` from ${load.clientSite.postcode}`
            : " because the source site has no postcode"
        }.`,
      );
    }

    if (direction === "removed" && !destination) {
      issues.push(
        `Destination local authority could not be resolved${
          load.thirdPartyDestinationSite?.postcode
            ? ` from ${load.thirdPartyDestinationSite.postcode}`
            : " because the destination site has no postcode"
        }.`,
      );
    }

    if (issues.length > 0) {
      const geographySite =
        direction === "received"
          ? load.clientSite
          : load.thirdPartyDestinationSite;
      const geographyGeo =
        direction === "received" ? originGeo : destinationGeo;
      const geographySubjectId =
        direction === "received"
          ? load.clientSiteId
          : load.thirdPartyDestinationSiteId;

      for (const issue of issues) {
        exceptions.push({
          jobLoadId: load.id,
          jobId: load.jobId,
          jobNumber: load.job?.jobNumber ?? load.jobId,
          loadNumber: load.loadNumber,
          direction,
          issue,
          blocking: true,

          materialProfileId: load.materialProfileId ?? null,
          materialName:
            (load.materialProfileId
              ? materialNames.get(load.materialProfileId)
              : "") ?? "",

          municipalSource,
          degradable,
          fromAnotherActivity,
          preTreatment,

          geographySubjectType: geographySubjectId
            ? "counterparty_site"
            : null,
          geographySubjectId: geographySubjectId ?? null,
          geographyName: geographySite?.name ?? "",
          geographyPostcode: geographySite?.postcode ?? "",
          geographyLocalAuthorityCode:
            geographyGeo?.localAuthorityCode ?? "",
          geographyLocalAuthorityName:
            geographyGeo?.localAuthorityName ?? "",
          geographyReturnAreaLabel:
            geographyGeo?.returnAreaLabel ??
            geographyGeo?.localAuthorityName ??
            "",
        });
      }

      continue;
    }

    // TypeScript narrowing for eventAt after the exception gate.
    if (!eventAt) continue;

    detailRows.push({
      jobLoadId: load.id,
      jobNumber: load.job?.jobNumber ?? load.jobId,
      loadNumber: load.loadNumber,
      direction,
      eventAt,
      siteId: load.ownSiteId ?? "",
      siteName: load.ownSite?.name ?? selectedSite.name,
      permitId: load.sitePermitId ?? "",
      permitNumber: load.sitePermit?.permitNumber ?? "",
      regulator: load.sitePermit?.regulator ?? "",
      ewcCode,
      wasteDescription: load.wasteDescriptionSnapshot ?? "",
      tonnes: roundTonnes(tonnes),
      ticketNumber: load.ticketNumber ?? "",
      counterpartyName: load.client?.name ?? "",
      counterpartySiteName: load.clientSite?.name ?? "",
      thirdPartyDestination: load.thirdPartyDestinationSite?.name ?? "",
      disposalRecoveryCode,
      municipalSource,
      degradable,
      state,
      fromAnotherActivity,
      preTreatment,
      origin: origin || originCode,
      destination: destination || destinationCode,
    });
  }

  const aggregateMap = new Map<string, WasteReturnAggregateRow>();
  const incomingMap = new Map<string, IncomingReturnRow>();
  const outgoingMap = new Map<string, OutgoingReturnRow>();

  for (const row of detailRows) {
    const aggregateKey = row.ewcCode;
    const aggregate = aggregateMap.get(aggregateKey) ?? {
      ewcCode: row.ewcCode,
      wasteDescription: row.wasteDescription,
      receivedLoads: 0,
      receivedTonnes: 0,
      removedLoads: 0,
      removedTonnes: 0,
    };

    if (row.direction === "received") {
      aggregate.receivedLoads += 1;
      aggregate.receivedTonnes += row.tonnes;

      const key = [
        row.origin,
        row.ewcCode,
        row.disposalRecoveryCode,
        booleanLabel(row.municipalSource),
        booleanLabel(row.degradable === true),
        row.state,
        row.fromAnotherActivity,
        row.preTreatment,
      ].join("|");

      const current = incomingMap.get(key) ?? {
        key,
        origin: row.origin,
        originCode: "",
        ewcCode: row.ewcCode,
        wasteDescription: row.wasteDescription,
        disposalRecoveryCode: row.disposalRecoveryCode,
        municipalSource: row.municipalSource,
        degradable: row.degradable === true,
        state: row.state,
        fromAnotherActivity: row.fromAnotherActivity,
        tonnes: 0,
        preTreatment: row.preTreatment,
        loadCount: 0,
      };

      current.tonnes += row.tonnes;
      current.loadCount += 1;
      incomingMap.set(key, current);
    } else {
      aggregate.removedLoads += 1;
      aggregate.removedTonnes += row.tonnes;

      const key = [
        row.destination,
        row.ewcCode,
        booleanLabel(row.municipalSource),
        row.state,
        row.disposalRecoveryCode,
      ].join("|");

      const current = outgoingMap.get(key) ?? {
        key,
        destination: row.destination,
        destinationCode: "",
        ewcCode: row.ewcCode,
        wasteDescription: row.wasteDescription,
        municipalSource: row.municipalSource,
        state: row.state,
        disposalRecoveryCode: row.disposalRecoveryCode,
        tonnes: 0,
        loadCount: 0,
      };

      current.tonnes += row.tonnes;
      current.loadCount += 1;
      outgoingMap.set(key, current);
    }

    aggregateMap.set(aggregateKey, aggregate);
  }

  const aggregateRows = Array.from(aggregateMap.values())
    .map((row) => ({
      ...row,
      receivedTonnes: roundTonnes(row.receivedTonnes),
      removedTonnes: roundTonnes(row.removedTonnes),
    }))
    .sort((a, b) => a.ewcCode.localeCompare(b.ewcCode));

  const incomingRows = Array.from(incomingMap.values())
    .map((row) => ({ ...row, tonnes: roundTonnes(row.tonnes) }))
    .sort((a, b) =>
      a.origin.localeCompare(b.origin) || a.ewcCode.localeCompare(b.ewcCode),
    );

  const outgoingRows = Array.from(outgoingMap.values())
    .map((row) => ({ ...row, tonnes: roundTonnes(row.tonnes) }))
    .sort((a, b) =>
      a.destination.localeCompare(b.destination) ||
      a.ewcCode.localeCompare(b.ewcCode),
    );

  const totals = aggregateRows.reduce(
    (acc, row) => {
      acc.receivedLoads += row.receivedLoads;
      acc.receivedTonnes += row.receivedTonnes;
      acc.removedLoads += row.removedLoads;
      acc.removedTonnes += row.removedTonnes;
      return acc;
    },
    {
      receivedLoads: 0,
      receivedTonnes: 0,
      removedLoads: 0,
      removedTonnes: 0,
    },
  );

  const materialReturnById = new Map(
    materialProfileRows.map((row) => [row.materialProfileId, row]),
  );
  const jobReturnById = new Map(jobProfileRows.map((row) => [row.jobId, row]));
  const clientNameByJobId = new Map(
    candidateLoads.map((load) => [load.jobId, load.client?.name ?? ""]),
  );

  const materials: ReturnMaterialSetupRow[] = materialRows
    .map((material) => ({
      id: material.id,
      name: material.name,
      isDegradable:
        materialReturnById.get(material.id)?.isDegradable ?? false,
      hasOverride: materialReturnById.has(material.id),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const jobsSetup: ReturnJobSetupRow[] = jobRows
    .map((job) => {
      const profile = jobReturnById.get(job.id);
      return {
        id: job.id,
        jobNumber: job.jobNumber,
        clientName: clientNameByJobId.get(job.id) ?? "",
        municipalSource:
          profile?.municipalSource ?? settings.municipalSourceDefault ?? false,
        fromAnotherActivity:
          cleanText(profile?.fromAnotherActivity) ||
          settings.fromAnotherActivityDefault ||
          "No facility",
        preTreatment:
          cleanText(profile?.preTreatment) ||
          settings.preTreatmentDefault ||
          "None",
        hasOverride: Boolean(profile),
      };
    })
    .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));

  const geographyBySubject = new Map(
    geographyRows.map((row) => [row.subjectId, row]),
  );
  const ownGeographyBySubject = new Map(
    allOwnGeographies.map((row) => [row.subjectId, row]),
  );

  const geographySetup: ReturnGeographySetupRow[] = [
    ...ownSites.map((site) => {
      const geo = ownGeographyBySubject.get(site.id);
      return {
        subjectType: "own_site" as const,
        subjectId: site.id,
        name: site.name,
        postcode: site.postcode ?? "",
        localAuthorityCode: geo?.localAuthorityCode ?? "",
        localAuthorityName: geo?.localAuthorityName ?? "",
        returnAreaLabel:
          geo?.returnAreaLabel ?? geo?.localAuthorityName ?? "",
        source: geo?.source ?? "",
        resolved: Boolean(geo?.localAuthorityName),
      };
    }),
    ...counterpartySiteRows.map((site) => {
      const geo = geographyBySubject.get(site.id);
      return {
        subjectType: "counterparty_site" as const,
        subjectId: site.id,
        name: site.name,
        postcode: site.postcode ?? "",
        localAuthorityCode: geo?.localAuthorityCode ?? "",
        localAuthorityName: geo?.localAuthorityName ?? "",
        returnAreaLabel:
          geo?.returnAreaLabel ?? geo?.localAuthorityName ?? "",
        source: geo?.source ?? "",
        resolved: Boolean(geo?.localAuthorityName),
      };
    }),
  ].sort((a, b) => Number(a.resolved) - Number(b.resolved) || a.name.localeCompare(b.name));

  return {
    period: params.period,
    sites: siteOptions,
    selectedSiteId,
    selectedSite,
    detailRows: detailRows.sort(
      (a, b) => a.eventAt.getTime() - b.eventAt.getTime(),
    ),
    aggregateRows,
    incomingRows,
    outgoingRows,
    exceptions,
    settings,
    setup: {
      materials,
      jobs: jobsSetup,
      geographies: geographySetup,
      unresolvedGeographyCount: geographySetup.filter((row) => !row.resolved).length,
      // With v3 defaults, an absent override is no longer a classification gap.
      missingMaterialClassificationCount: 0,
      missingJobClassificationCount: 0,
    },
    totals: {
      ...totals,
      receivedTonnes: roundTonnes(totals.receivedTonnes),
      removedTonnes: roundTonnes(totals.removedTonnes),
    },
  };
}
