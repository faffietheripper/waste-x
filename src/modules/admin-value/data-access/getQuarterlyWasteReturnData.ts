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
  permitEwcCodes,
  sites,
} from "@/db/schema";

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
};

export type WasteReturnAggregateRow = {
  ewcCode: string;
  wasteDescription: string;
  receivedLoads: number;
  receivedTonnes: number;
  removedLoads: number;
  removedTonnes: number;
};

export type WasteReturnException = {
  jobLoadId: string;
  jobNumber: string;
  loadNumber: number;
  issue: string;
  blocking: boolean;
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

export type QuarterlyWasteReturnData = {
  period: QuarterPeriod;
  sites: WasteReturnSiteOption[];
  selectedSiteId: string | null;
  selectedSite: WasteReturnSiteOption | null;
  detailRows: WasteReturnDetailRow[];
  aggregateRows: WasteReturnAggregateRow[];
  exceptions: WasteReturnException[];
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

  if (!selectedSiteId) {
    return {
      period: params.period,
      sites: siteOptions,
      selectedSiteId: null,
      selectedSite: null,
      detailRows: [],
      aggregateRows: [],
      exceptions: [],
      totals: {
        receivedLoads: 0,
        receivedTonnes: 0,
        removedLoads: 0,
        removedTonnes: 0,
      },
    };
  }

  /*
    We include completedAt as a candidate date only so loads with a missing
    regulatory movement timestamp can still be surfaced as exceptions.
    Valid return rows themselves use receivedAt (incoming) or movementAt
    (outgoing); we never silently substitute completedAt in the final totals.
  */
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

  const permitIds = Array.from(
    new Set(
      candidateLoads
        .map((load) => load.sitePermitId)
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const permitMappings =
    permitIds.length > 0
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

    if (!eventAt || !isWithinPeriod(eventAt, params.period)) {
      exceptions.push({
        jobLoadId: load.id,
        jobNumber: load.job?.jobNumber ?? load.jobId,
        loadNumber: load.loadNumber,
        issue:
          direction === "received"
            ? "Missing date/time received. Excluded from prepared return totals."
            : "Missing movement/removal date. Excluded from prepared return totals.",
        blocking: true,
      });
      continue;
    }

    const ewcCode = cleanEwc(load.ewcCodeSnapshot ?? load.ewcCode?.code);
    const tonnes = weightToTonnes(load.netWeight, load.weightMetric);

    let blocked = false;

    if (!ewcCode) {
      blocked = true;
      exceptions.push({
        jobLoadId: load.id,
        jobNumber: load.job?.jobNumber ?? load.jobId,
        loadNumber: load.loadNumber,
        issue: "No EWC code snapshot is available for this load.",
        blocking: true,
      });
    }

    if (tonnes <= 0) {
      blocked = true;
      exceptions.push({
        jobLoadId: load.id,
        jobNumber: load.job?.jobNumber ?? load.jobId,
        loadNumber: load.loadNumber,
        issue: "No usable net weight is available for this load.",
        blocking: true,
      });
    }

    if (!load.sitePermitId || !load.sitePermit) {
      blocked = true;
      exceptions.push({
        jobLoadId: load.id,
        jobNumber: load.job?.jobNumber ?? load.jobId,
        loadNumber: load.loadNumber,
        issue: "No receiving-site permit is linked to this load.",
        blocking: true,
      });
    }

    if (
      load.sitePermitId &&
      load.ewcCodeId &&
      !permittedPairs.has(`${load.sitePermitId}:${load.ewcCodeId}`)
    ) {
      blocked = true;
      exceptions.push({
        jobLoadId: load.id,
        jobNumber: load.job?.jobNumber ?? load.jobId,
        loadNumber: load.loadNumber,
        issue: `EWC ${ewcCode || "unknown"} is not currently configured against the permit linked to this load.`,
        blocking: true,
      });
    }

    if (blocked) continue;

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
    });
  }

  const aggregateMap = new Map<string, WasteReturnAggregateRow>();

  for (const row of detailRows) {
    const key = row.ewcCode;
    const existing = aggregateMap.get(key) ?? {
      ewcCode: row.ewcCode,
      wasteDescription: row.wasteDescription,
      receivedLoads: 0,
      receivedTonnes: 0,
      removedLoads: 0,
      removedTonnes: 0,
    };

    if (!existing.wasteDescription && row.wasteDescription) {
      existing.wasteDescription = row.wasteDescription;
    }

    if (row.direction === "received") {
      existing.receivedLoads += 1;
      existing.receivedTonnes += row.tonnes;
    } else {
      existing.removedLoads += 1;
      existing.removedTonnes += row.tonnes;
    }

    aggregateMap.set(key, existing);
  }

  const aggregateRows = Array.from(aggregateMap.values())
    .map((row) => ({
      ...row,
      receivedTonnes: roundTonnes(row.receivedTonnes),
      removedTonnes: roundTonnes(row.removedTonnes),
    }))
    .sort((a, b) => a.ewcCode.localeCompare(b.ewcCode));

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

  return {
    period: params.period,
    sites: siteOptions,
    selectedSiteId,
    selectedSite,
    detailRows: detailRows.sort(
      (a, b) => a.eventAt.getTime() - b.eventAt.getTime(),
    ),
    aggregateRows,
    exceptions,
    totals: {
      ...totals,
      receivedTonnes: roundTonnes(totals.receivedTonnes),
      removedTonnes: roundTonnes(totals.removedTonnes),
    },
  };
}
