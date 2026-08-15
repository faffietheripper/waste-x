import { and, eq, gte, lt, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  jobs,
  wasteTrackingSubmissions,
} from "@/db/schema";

import {
  roundMoney,
  roundTonnes,
  weightToTonnes,
} from "@/modules/admin-value/core/commercialMath";
import {
  getCommercialAdminData,
  type CommercialDateRange,
} from "@/modules/admin-value/data-access/getCommercialAdminData";

export type SoloReportsEwcRow = {
  ewcCode: string;
  description: string;
  loads: number;
  tonnes: number;
};

export type SoloReportsClientRow = {
  clientId: string;
  clientName: string;
  jobs: number;
  completedLoads: number;
  tonnes: number;
  revenue: number;
};

export type SoloReportsDwtSummary = {
  totalAttempts: number;
  accepted: number;
  acceptedWithWarnings: number;
  rejected: number;
  failed: number;
  submitted: number;
  draft: number;
  uniqueWtids: number;
};

export type SoloReportsData = {
  range: CommercialDateRange;
  operations: {
    jobsBooked: number;
    jobsCompleted: number;
    completedLoads: number;
    receivedLoads: number;
    receivedTonnes: number;
    rejectedLoads: number;
    uniqueClients: number;
  };
  ewcRows: SoloReportsEwcRow[];
  clientRows: SoloReportsClientRow[];
  dwt: SoloReportsDwtSummary;
  commercial: Awaited<ReturnType<typeof getCommercialAdminData>> | null;
};

function cleanEwc(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, "").trim();
}

function loadFallsInRange(
  load: {
    receivedAt: Date | null;
    completedAt: Date | null;
    movementAt: Date | null;
  },
  range: CommercialDateRange,
) {
  const candidates = [load.receivedAt, load.completedAt, load.movementAt];

  return candidates.some(
    (date) => date && date >= range.from && date < range.toExclusive,
  );
}

export async function getSoloReportsData(params: {
  organisationId: string;
  range: CommercialDateRange;
  includeCommercial?: boolean;
}): Promise<SoloReportsData> {
  const { organisationId, range } = params;

  const [jobRows, loadRows, dwtRows, commercial] = await Promise.all([
    database.query.jobs.findMany({
      where: and(
        eq(jobs.organisationId, organisationId),
        or(
          and(gte(jobs.jobDate, range.from), lt(jobs.jobDate, range.toExclusive)),
          and(
            gte(jobs.completedAt, range.from),
            lt(jobs.completedAt, range.toExclusive),
          ),
        ),
      ),
      with: {
        client: true,
        loads: true,
      },
    }),

    database.query.jobLoads.findMany({
      where: and(
        eq(jobLoads.organisationId, organisationId),
        or(
          and(
            gte(jobLoads.receivedAt, range.from),
            lt(jobLoads.receivedAt, range.toExclusive),
          ),
          and(
            gte(jobLoads.completedAt, range.from),
            lt(jobLoads.completedAt, range.toExclusive),
          ),
          and(
            gte(jobLoads.movementAt, range.from),
            lt(jobLoads.movementAt, range.toExclusive),
          ),
        ),
      ),
      with: {
        job: {
          with: {
            client: true,
          },
        },
        ewcCode: true,
      },
    }),

    database.query.wasteTrackingSubmissions.findMany({
      where: and(
        eq(wasteTrackingSubmissions.organisationId, organisationId),
        or(
          and(
            gte(wasteTrackingSubmissions.createdAt, range.from),
            lt(wasteTrackingSubmissions.createdAt, range.toExclusive),
          ),
          and(
            gte(wasteTrackingSubmissions.lastAttemptedAt, range.from),
            lt(wasteTrackingSubmissions.lastAttemptedAt, range.toExclusive),
          ),
        ),
      ),
      columns: {
        id: true,
        status: true,
        wasteTrackingId: true,
        createdAt: true,
        lastAttemptedAt: true,
      },
    }),

    params.includeCommercial
      ? getCommercialAdminData({
          organisationId,
          range,
        })
      : Promise.resolve(null),
  ]);

  const jobsBooked = jobRows.filter(
    (job) => job.jobDate >= range.from && job.jobDate < range.toExclusive,
  ).length;

  const jobsCompleted = jobRows.filter(
    (job) =>
      job.status === "completed" &&
      Boolean(
        job.completedAt &&
          job.completedAt >= range.from &&
          job.completedAt < range.toExclusive,
      ),
  ).length;

  const includedLoads = loadRows.filter((load) => loadFallsInRange(load, range));
  const completedLoads = includedLoads.filter(
    (load) => load.status === "completed",
  );
  const receivedLoads = includedLoads.filter(
    (load) =>
      load.direction === "incoming" &&
      Boolean(
        load.receivedAt &&
          load.receivedAt >= range.from &&
          load.receivedAt < range.toExclusive,
      ) &&
      inArrayStatus(load.status, ["accepted", "completed"]),
  );
  const rejectedLoads = includedLoads.filter(
    (load) => load.status === "rejected",
  ).length;

  const ewcMap = new Map<string, SoloReportsEwcRow>();

  for (const load of receivedLoads) {
    const ewcCode = cleanEwc(load.ewcCodeSnapshot ?? load.ewcCode?.code) || "Unknown";
    const description =
      load.wasteDescriptionSnapshot ??
      load.ewcCode?.description ??
      "No description";
    const tonnes = weightToTonnes(load.netWeight, load.weightMetric);

    const existing = ewcMap.get(ewcCode) ?? {
      ewcCode,
      description,
      loads: 0,
      tonnes: 0,
    };

    existing.loads += 1;
    existing.tonnes += tonnes;
    ewcMap.set(ewcCode, existing);
  }

  const ewcRows = Array.from(ewcMap.values())
    .map((row) => ({
      ...row,
      tonnes: roundTonnes(row.tonnes),
    }))
    .sort((a, b) => b.tonnes - a.tonnes || a.ewcCode.localeCompare(b.ewcCode));

  const clientMap = new Map<string, SoloReportsClientRow>();

  for (const job of jobRows) {
    const clientId = job.clientCounterpartyId ?? "no-client";
    const clientName = job.client?.name ?? "No client";
    const relevantLoads = job.loads.filter(
      (load) =>
        load.status === "completed" &&
        loadFallsInRange(load, range),
    );

    if (relevantLoads.length === 0 && !(job.jobDate >= range.from && job.jobDate < range.toExclusive)) {
      continue;
    }

    const existing = clientMap.get(clientId) ?? {
      clientId,
      clientName,
      jobs: 0,
      completedLoads: 0,
      tonnes: 0,
      revenue: 0,
    };

    existing.jobs += 1;
    existing.completedLoads += relevantLoads.length;
    existing.tonnes += relevantLoads.reduce(
      (sum, load) => sum + weightToTonnes(load.netWeight, load.weightMetric),
      0,
    );

    const commercialJob = commercial?.jobs.find((row) => row.id === job.id);
    if (commercialJob) {
      existing.revenue += commercialJob.revenue;
    }

    clientMap.set(clientId, existing);
  }

  const clientRows = Array.from(clientMap.values())
    .map((row) => ({
      ...row,
      tonnes: roundTonnes(row.tonnes),
      revenue: roundMoney(row.revenue),
    }))
    .sort((a, b) => b.tonnes - a.tonnes || b.revenue - a.revenue)
    .slice(0, 25);

  const uniqueWtids = new Set(
    dwtRows
      .map((row) => row.wasteTrackingId)
      .filter((value): value is string => Boolean(value)),
  );

  const dwt: SoloReportsDwtSummary = {
    totalAttempts: dwtRows.length,
    accepted: dwtRows.filter((row) => row.status === "accepted").length,
    acceptedWithWarnings: dwtRows.filter(
      (row) => row.status === "accepted_with_warnings",
    ).length,
    rejected: dwtRows.filter((row) => row.status === "rejected").length,
    failed: dwtRows.filter((row) => row.status === "failed").length,
    submitted: dwtRows.filter((row) => row.status === "submitted").length,
    draft: dwtRows.filter((row) => row.status === "draft").length,
    uniqueWtids: uniqueWtids.size,
  };

  return {
    range,
    operations: {
      jobsBooked,
      jobsCompleted,
      completedLoads: completedLoads.length,
      receivedLoads: receivedLoads.length,
      receivedTonnes: roundTonnes(
        receivedLoads.reduce(
          (sum, load) => sum + weightToTonnes(load.netWeight, load.weightMetric),
          0,
        ),
      ),
      rejectedLoads,
      uniqueClients: new Set(
        jobRows
          .map((job) => job.clientCounterpartyId)
          .filter((value): value is string => Boolean(value)),
      ).size,
    },
    ewcRows,
    clientRows,
    dwt,
    commercial,
  };
}

function inArrayStatus<T extends string>(value: string, values: readonly T[]) {
  return values.includes(value as T);
}
