import { and, desc, eq, gte, isNull, lt, or } from "drizzle-orm";

import { database } from "@/db/database";
import { jobs } from "@/db/schema";

import {
  calculateJobCommercials,
  roundMoney,
  roundTonnes,
} from "../core/commercialMath";

export type CommercialDateRange = {
  from: Date;
  toExclusive: Date;
};

export type CommercialJobRow = {
  id: string;
  jobNumber: string;
  jobDate: Date;
  completedAt: Date | null;
  clientName: string;
  clientSiteName: string;
  purchaseOrder: string;
  customerReference: string;
  customerRateLabel: string;
  completedLoads: number;
  tonnes: number;
  revenue: number;
  haulageCost: number;
  tippingCost: number;
  directCost: number;
  margin: number;
  currency: string;
  customerInvoiceReference: string;
  customerInvoicedAt: Date | null;
  isBilled: boolean;
  missingCustomerPrice: boolean;
  pricingIssues: string[];
};

export type CommercialAdminData = {
  range: CommercialDateRange;
  jobs: CommercialJobRow[];
  unbilledJobs: CommercialJobRow[];
  allTimeUnbilledJobs: CommercialJobRow[];
  totals: {
    completedJobs: number;
    completedLoads: number;
    tonnes: number;
    revenue: number;
    directCost: number;
    margin: number;
    billedRevenue: number;
    unbilledRevenue: number;
  };
  allTimeUnbilled: {
    jobs: number;
    revenue: number;
  };
  pricingIssueCount: number;
};

function rateLabel(job: {
  rate: {
    amount: string;
    unit: "tonne" | "load" | "job";
    currency: string;
  } | null;
}) {
  if (!job.rate) return "No matched customer rate";

  return `${job.rate.currency} ${job.rate.amount} / ${job.rate.unit}`;
}

function mapJob(job: Awaited<ReturnType<typeof loadCompletedJobs>>[number]) {
  const summary = calculateJobCommercials(job.loads);

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    jobDate: job.jobDate,
    completedAt: job.completedAt,
    clientName: job.client?.name ?? "No client",
    clientSiteName: job.clientSite?.name ?? "No client site",
    purchaseOrder: job.purchaseOrder ?? "",
    customerReference: job.customerReference ?? "",
    customerRateLabel: rateLabel(job),
    completedLoads: summary.completedLoads,
    tonnes: roundTonnes(summary.tonnes),
    revenue: roundMoney(summary.revenue),
    haulageCost: roundMoney(summary.haulageCost),
    tippingCost: roundMoney(summary.tippingCost),
    directCost: roundMoney(summary.directCost),
    margin: roundMoney(summary.margin),
    currency: job.loads.find((load) => load.currency)?.currency ?? "GBP",
    customerInvoiceReference: job.customerInvoiceReference ?? "",
    customerInvoicedAt: job.customerInvoicedAt,
    isBilled: Boolean(job.customerInvoicedAt),
    missingCustomerPrice: summary.missingCustomerPrice,
    pricingIssues: summary.pricingIssues,
  } satisfies CommercialJobRow;
}

async function loadCompletedJobs(params: {
  organisationId: string;
  range?: CommercialDateRange;
  onlyUnbilled?: boolean;
}) {
  const conditions = [
    eq(jobs.organisationId, params.organisationId),
    eq(jobs.status, "completed"),
  ];

  if (params.onlyUnbilled) {
    conditions.push(isNull(jobs.customerInvoicedAt));
  }

  if (params.range) {
    conditions.push(
      or(
        and(
          gte(jobs.completedAt, params.range.from),
          lt(jobs.completedAt, params.range.toExclusive),
        ),
        and(
          isNull(jobs.completedAt),
          gte(jobs.jobDate, params.range.from),
          lt(jobs.jobDate, params.range.toExclusive),
        ),
      )!,
    );
  }

  return database.query.jobs.findMany({
    where: and(...conditions),
    with: {
      client: true,
      clientSite: true,
      ownSite: true,
      rate: true,
      loads: true,
    },
    orderBy: [desc(jobs.completedAt), desc(jobs.jobDate)],
  });
}

export async function getCommercialAdminData(params: {
  organisationId: string;
  range: CommercialDateRange;
}): Promise<CommercialAdminData> {
  const [rangeJobsRaw, allTimeUnbilledRaw] = await Promise.all([
    loadCompletedJobs({
      organisationId: params.organisationId,
      range: params.range,
    }),
    loadCompletedJobs({
      organisationId: params.organisationId,
      onlyUnbilled: true,
    }),
  ]);

  const rangeJobs = rangeJobsRaw.map(mapJob);
  const allTimeUnbilledJobs = allTimeUnbilledRaw.map(mapJob);
  const unbilledJobs = rangeJobs.filter((job) => !job.isBilled);

  const totals = rangeJobs.reduce(
    (acc, job) => {
      acc.completedJobs += 1;
      acc.completedLoads += job.completedLoads;
      acc.tonnes += job.tonnes;
      acc.revenue += job.revenue;
      acc.directCost += job.directCost;
      acc.margin += job.margin;

      if (job.isBilled) {
        acc.billedRevenue += job.revenue;
      } else {
        acc.unbilledRevenue += job.revenue;
      }

      return acc;
    },
    {
      completedJobs: 0,
      completedLoads: 0,
      tonnes: 0,
      revenue: 0,
      directCost: 0,
      margin: 0,
      billedRevenue: 0,
      unbilledRevenue: 0,
    },
  );

  return {
    range: params.range,
    jobs: rangeJobs,
    unbilledJobs,
    allTimeUnbilledJobs,
    totals: {
      ...totals,
      tonnes: roundTonnes(totals.tonnes),
      revenue: roundMoney(totals.revenue),
      directCost: roundMoney(totals.directCost),
      margin: roundMoney(totals.margin),
      billedRevenue: roundMoney(totals.billedRevenue),
      unbilledRevenue: roundMoney(totals.unbilledRevenue),
    },
    allTimeUnbilled: {
      jobs: allTimeUnbilledJobs.length,
      revenue: roundMoney(
        allTimeUnbilledJobs.reduce((sum, job) => sum + job.revenue, 0),
      ),
    },
    pricingIssueCount: rangeJobs.reduce(
      (count, job) =>
        count +
        (job.missingCustomerPrice ? 1 : 0) +
        (job.pricingIssues.length > 0 ? job.pricingIssues.length : 0),
      0,
    ),
  };
}

export function defaultCommercialDateRange(date = new Date()): CommercialDateRange {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const toExclusive = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1),
  );

  return { from, toExclusive };
}

export function parseCommercialDateRange(params: {
  from?: string | string[];
  to?: string | string[];
}) {
  const fallback = defaultCommercialDateRange();
  const rawFrom = Array.isArray(params.from) ? params.from[0] : params.from;
  const rawTo = Array.isArray(params.to) ? params.to[0] : params.to;

  const from = rawFrom ? new Date(`${rawFrom}T00:00:00.000Z`) : fallback.from;
  const inclusiveTo = rawTo ? new Date(`${rawTo}T00:00:00.000Z`) : null;

  const safeFrom = Number.isNaN(from.getTime()) ? fallback.from : from;
  const toExclusive =
    inclusiveTo && !Number.isNaN(inclusiveTo.getTime())
      ? new Date(inclusiveTo.getTime() + 24 * 60 * 60 * 1000)
      : fallback.toExclusive;

  if (safeFrom >= toExclusive) return fallback;

  return { from: safeFrom, toExclusive };
}

export function commercialDateRangeToQuery(range: CommercialDateRange) {
  const inclusiveTo = new Date(range.toExclusive.getTime() - 24 * 60 * 60 * 1000);

  return {
    from: range.from.toISOString().slice(0, 10),
    to: inclusiveTo.toISOString().slice(0, 10),
  };
}
