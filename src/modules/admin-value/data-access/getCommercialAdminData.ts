import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lt,
  or,
} from "drizzle-orm";

import {
  jobCommercialLines,
} from "@/db/commercial-schema";
import { database } from "@/db/database";
import { jobs } from "@/db/schema";

import {
  calculateJobCommercials as calculateLegacyJobCommercials,
  roundMoney,
  roundTonnes,
} from "../core/commercialMath";
import {
  calculateJobCommercials as calculateCurrentJobCommercials,
} from "@/modules/commercial/jobCommercials";

export type CommercialDateRange = {
  from: Date;
  toExclusive: Date;
};

export type CommercialJobRow = {
  id: string;
  jobNumber: string;
  direction: "incoming" | "outgoing";
  jobDate: Date;
  completedAt: Date | null;
  clientName: string;
  clientSiteName: string;
  purchaseOrder: string;
  customerReference: string;

  /*
    Kept under the old property name so existing Accounts/exports do not need a
    schema migration or broad rewrite. The value is now a Job-specific pricing
    label when bb_job_commercial_line exists.
  */
  customerRateLabel: string;

  pricingSource: "job_specific" | "legacy_snapshot";

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
  hasInvoiceCustomer: boolean;

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

function legacyRateLabel(job: {
  rate: {
    amount: string;
    unit: "tonne" | "load" | "job";
    currency: string;
  } | null;
}) {
  if (!job.rate) return "No Job-specific price";

  return `${job.rate.currency} ${job.rate.amount} / ${job.rate.unit} · legacy suggestion`;
}

function currentPricingLabel(
  lines: Array<typeof jobCommercialLines.$inferSelect>,
) {
  const revenueLines = lines.filter(
    (line) => line.kind === "revenue",
  );

  if (revenueLines.length === 0) {
    return "No Job-specific revenue price";
  }

  const primary =
    revenueLines.find(
      (line) =>
        line.category === "customer_charge" ||
        line.category === "material_sale",
    ) ?? revenueLines[0];

  const suffix =
    revenueLines.length > 1
      ? ` + ${revenueLines.length - 1} more`
      : "";

  return `${primary.currency} ${primary.amount} / ${primary.unit} · Job price${suffix}`;
}

function currentCostForCategory(params: {
  lines: Array<typeof jobCommercialLines.$inferSelect>;
  loads: Awaited<
    ReturnType<typeof loadCompletedJobs>
  >[number]["loads"];
  category: "haulage_cost" | "tipping_cost";
}) {
  const lines = params.lines.filter(
    (line) =>
      line.kind === "cost" &&
      line.category === params.category,
  );

  if (lines.length === 0) return 0;

  return calculateCurrentJobCommercials({
    lines,
    loads: params.loads,
  }).directCost;
}

function mapJob(
  job: Awaited<
    ReturnType<typeof loadCompletedJobs>
  >[number],
  lines: Array<
    typeof jobCommercialLines.$inferSelect
  >,
) {
  const usesJobSpecificPricing =
    lines.length > 0;

  const currentSummary =
    usesJobSpecificPricing
      ? calculateCurrentJobCommercials({
          lines,
          loads: job.loads,
        })
      : null;

  const legacySummary =
    usesJobSpecificPricing
      ? null
      : calculateLegacyJobCommercials(
          job.loads,
        );

  const completedLoads =
    currentSummary?.completedLoads ??
    legacySummary?.completedLoads ??
    0;

  const tonnes =
    currentSummary?.tonnes ??
    legacySummary?.tonnes ??
    0;

  const revenue =
    currentSummary?.revenue ??
    legacySummary?.revenue ??
    0;

  const directCost =
    currentSummary?.directCost ??
    legacySummary?.directCost ??
    0;

  const haulageCost =
    currentSummary
      ? currentCostForCategory({
          lines,
          loads: job.loads,
          category: "haulage_cost",
        })
      : legacySummary?.haulageCost ?? 0;

  const tippingCost =
    currentSummary
      ? currentCostForCategory({
          lines,
          loads: job.loads,
          category: "tipping_cost",
        })
      : legacySummary?.tippingCost ?? 0;

  const pricingIssues: string[] = [];

  if (
    currentSummary?.missingQuantity
  ) {
    pricingIssues.push(
      "A Job-specific per-tonne/per-load line has no completed quantity.",
    );
  }

  if (
    legacySummary?.pricingIssues?.length
  ) {
    pricingIssues.push(
      ...legacySummary.pricingIssues,
    );
  }

  /*
    "Missing customer price" only matters for work that actually has an invoice
    customer. Outgoing disposal/cost-only Jobs should not pollute the invoice
    queue merely because they have no customer revenue line.
  */
  const hasInvoiceCustomer =
    Boolean(job.clientCounterpartyId);

  const missingCustomerPrice =
    hasInvoiceCustomer &&
    (currentSummary
      ? !currentSummary.hasRevenue
      : Boolean(
          legacySummary
            ?.missingCustomerPrice,
        ));

  return {
    id: job.id,
    jobNumber: job.jobNumber,
    direction: job.direction,
    jobDate: job.jobDate,
    completedAt: job.completedAt,
    clientName:
      job.client?.name ??
      (job.direction === "outgoing"
        ? "Outgoing movement"
        : "No client"),
    clientSiteName:
      job.clientSite?.name ??
      (job.direction === "outgoing"
        ? job.thirdPartyDestinationSite
            ?.name ?? "Third-party destination"
        : "No client site"),
    purchaseOrder:
      job.purchaseOrder ?? "",
    customerReference:
      job.customerReference ?? "",
    customerRateLabel:
      usesJobSpecificPricing
        ? currentPricingLabel(lines)
        : legacyRateLabel(job),
    pricingSource:
      usesJobSpecificPricing
        ? "job_specific"
        : "legacy_snapshot",
    completedLoads,
    tonnes: roundTonnes(tonnes),
    revenue: roundMoney(revenue),
    haulageCost:
      roundMoney(haulageCost),
    tippingCost:
      roundMoney(tippingCost),
    directCost:
      roundMoney(directCost),
    margin: roundMoney(
      revenue - directCost,
    ),
    currency:
      lines.find(
        (line) => line.currency,
      )?.currency ??
      job.loads.find(
        (load) => load.currency,
      )?.currency ??
      "GBP",
    customerInvoiceReference:
      job.customerInvoiceReference ?? "",
    customerInvoicedAt:
      job.customerInvoicedAt,
    isBilled:
      Boolean(job.customerInvoicedAt),
    hasInvoiceCustomer,
    missingCustomerPrice,
    pricingIssues,
  } satisfies CommercialJobRow;
}

async function loadCompletedJobs(params: {
  organisationId: string;
  range?: CommercialDateRange;
  onlyUnbilled?: boolean;
}) {
  const conditions = [
    eq(
      jobs.organisationId,
      params.organisationId,
    ),
    eq(jobs.status, "completed"),
  ];

  if (params.onlyUnbilled) {
    conditions.push(
      isNull(jobs.customerInvoicedAt),
    );
  }

  if (params.range) {
    conditions.push(
      or(
        and(
          gte(
            jobs.completedAt,
            params.range.from,
          ),
          lt(
            jobs.completedAt,
            params.range.toExclusive,
          ),
        ),
        and(
          isNull(jobs.completedAt),
          gte(
            jobs.jobDate,
            params.range.from,
          ),
          lt(
            jobs.jobDate,
            params.range.toExclusive,
          ),
        ),
      )!,
    );
  }

  return database.query.jobs.findMany({
    where: and(...conditions),
    with: {
      client: true,
      clientSite: true,
      thirdPartyDestinationSite: true,
      ownSite: true,
      rate: true,
      loads: true,
    },
    orderBy: [
      desc(jobs.completedAt),
      desc(jobs.jobDate),
    ],
  });
}

async function loadLinesForJobs(params: {
  organisationId: string;
  jobIds: string[];
}) {
  if (params.jobIds.length === 0) {
    return [];
  }

  return database.query.jobCommercialLines.findMany({
    where: and(
      eq(
        jobCommercialLines.organisationId,
        params.organisationId,
      ),
      inArray(
        jobCommercialLines.jobId,
        params.jobIds,
      ),
      eq(
        jobCommercialLines.isActive,
        true,
      ),
    ),
  });
}

export async function getCommercialAdminData(params: {
  organisationId: string;
  range: CommercialDateRange;
}): Promise<CommercialAdminData> {
  const [
    rangeJobsRaw,
    allTimeUnbilledRaw,
  ] = await Promise.all([
    loadCompletedJobs({
      organisationId:
        params.organisationId,
      range: params.range,
    }),
    loadCompletedJobs({
      organisationId:
        params.organisationId,
      onlyUnbilled: true,
    }),
  ]);

  const uniqueJobIds = Array.from(
    new Set(
      [
        ...rangeJobsRaw,
        ...allTimeUnbilledRaw,
      ].map((job) => job.id),
    ),
  );

  const commercialLines =
    await loadLinesForJobs({
      organisationId:
        params.organisationId,
      jobIds: uniqueJobIds,
    });

  const linesByJob = new Map<
    string,
    Array<
      typeof jobCommercialLines.$inferSelect
    >
  >();

  for (const line of commercialLines) {
    const current =
      linesByJob.get(line.jobId) ?? [];
    current.push(line);
    linesByJob.set(
      line.jobId,
      current,
    );
  }

  const rangeJobs =
    rangeJobsRaw.map((job) =>
      mapJob(
        job,
        linesByJob.get(job.id) ?? [],
      ),
    );

  /*
    The legacy Accounts queue should only treat Jobs with an invoice customer as
    "unbilled". Outgoing operational cost Jobs remain in totals/reports but do not
    become fake customer-invoice work.
  */
  const allTimeUnbilledJobs =
    allTimeUnbilledRaw
      .map((job) =>
        mapJob(
          job,
          linesByJob.get(job.id) ?? [],
        ),
      )
      .filter(
        (job) =>
          job.hasInvoiceCustomer &&
          job.revenue !== 0,
      );

  const unbilledJobs =
    rangeJobs.filter(
      (job) =>
        !job.isBilled &&
        job.hasInvoiceCustomer &&
        job.revenue !== 0,
    );

  const totals = rangeJobs.reduce(
    (acc, job) => {
      acc.completedJobs += 1;
      acc.completedLoads +=
        job.completedLoads;
      acc.tonnes += job.tonnes;
      acc.revenue += job.revenue;
      acc.directCost +=
        job.directCost;
      acc.margin += job.margin;

      if (
        job.isBilled &&
        job.hasInvoiceCustomer
      ) {
        acc.billedRevenue +=
          job.revenue;
      } else if (
        job.hasInvoiceCustomer
      ) {
        acc.unbilledRevenue +=
          job.revenue;
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
      tonnes:
        roundTonnes(
          totals.tonnes,
        ),
      revenue:
        roundMoney(
          totals.revenue,
        ),
      directCost:
        roundMoney(
          totals.directCost,
        ),
      margin:
        roundMoney(
          totals.margin,
        ),
      billedRevenue:
        roundMoney(
          totals.billedRevenue,
        ),
      unbilledRevenue:
        roundMoney(
          totals.unbilledRevenue,
        ),
    },
    allTimeUnbilled: {
      jobs:
        allTimeUnbilledJobs.length,
      revenue:
        roundMoney(
          allTimeUnbilledJobs.reduce(
            (sum, job) =>
              sum + job.revenue,
            0,
          ),
        ),
    },
    pricingIssueCount:
      rangeJobs.reduce(
        (count, job) =>
          count +
          (job.missingCustomerPrice
            ? 1
            : 0) +
          job.pricingIssues.length,
        0,
      ),
  };
}

export function defaultCommercialDateRange(
  date = new Date(),
): CommercialDateRange {
  const from = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      1,
    ),
  );

  const toExclusive = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth() + 1,
      1,
    ),
  );

  return {
    from,
    toExclusive,
  };
}

export function parseCommercialDateRange(
  params: {
    from?: string | string[];
    to?: string | string[];
  },
) {
  const fallback =
    defaultCommercialDateRange();

  const rawFrom =
    Array.isArray(params.from)
      ? params.from[0]
      : params.from;

  const rawTo =
    Array.isArray(params.to)
      ? params.to[0]
      : params.to;

  const from = rawFrom
    ? new Date(
        `${rawFrom}T00:00:00.000Z`,
      )
    : fallback.from;

  const inclusiveTo =
    rawTo
      ? new Date(
          `${rawTo}T00:00:00.000Z`,
        )
      : null;

  const safeFrom =
    Number.isNaN(from.getTime())
      ? fallback.from
      : from;

  const toExclusive =
    inclusiveTo &&
    !Number.isNaN(
      inclusiveTo.getTime(),
    )
      ? new Date(
          inclusiveTo.getTime() +
            24 * 60 * 60 * 1000,
        )
      : fallback.toExclusive;

  if (safeFrom >= toExclusive) {
    return fallback;
  }

  return {
    from: safeFrom,
    toExclusive,
  };
}

export function commercialDateRangeToQuery(
  range: CommercialDateRange,
) {
  const inclusiveTo = new Date(
    range.toExclusive.getTime() -
      24 * 60 * 60 * 1000,
  );

  return {
    from:
      range.from
        .toISOString()
        .slice(0, 10),
    to:
      inclusiveTo
        .toISOString()
        .slice(0, 10),
  };
}
