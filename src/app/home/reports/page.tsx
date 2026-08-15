import Link from "next/link";

import {
  commercialDateRangeToQuery,
  parseCommercialDateRange,
} from "@/modules/admin-value/data-access/getCommercialAdminData";
import { getSoloReportsData } from "@/modules/reports/solo/getSoloReportsData";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
};

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
  }).format(value);
}

function tonnes(value: number) {
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)} t`;
}

export default async function ReportsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireSoloWorkspaceAccess();
  const range = parseCommercialDateRange(searchParams);
  const query = commercialDateRangeToQuery(range);
  const data = await getSoloReportsData({
    organisationId: access.organisationId,
    range,
    includeCommercial: access.canSeeFinancials,
  });

  const rangeQuery = `from=${encodeURIComponent(query.from)}&to=${encodeURIComponent(query.to)}`;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-12 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Waste Manager Reporting
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Reports
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Operational, compliance and commercial reporting built from the
                same Jobs, Loads, DWT records and billing markers used day to day.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/activity"
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Activity audit
              </Link>
              <Link
                href={`/home/reports/export/operations?${rangeQuery}`}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Export operations CSV
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">From</span>
              <input
                type="date"
                name="from"
                defaultValue={query.from}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">To</span>
              <input
                type="date"
                name="to"
                defaultValue={query.to}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <button
              type="submit"
              className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Apply period
            </button>
          </form>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label="Jobs booked" value={String(data.operations.jobsBooked)} helper="In selected period" />
          <Metric label="Jobs completed" value={String(data.operations.jobsCompleted)} helper="Operationally finished" />
          <Metric label="Received loads" value={String(data.operations.receivedLoads)} helper="Accepted/completed" />
          <Metric label="Waste received" value={tonnes(data.operations.receivedTonnes)} helper="Net tonnes" highlighted />
          <Metric label="Rejected loads" value={String(data.operations.rejectedLoads)} helper="Needs operational review" warning={data.operations.rejectedLoads > 0} />
          <Metric label="DWT WTIDs" value={String(data.dwt.uniqueWtids)} helper={`${data.dwt.totalAttempts} attempts`} />
        </section>

        <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          <ReportCard
            eyebrow="Operations"
            title="Operations summary"
            description="Jobs, completed loads, clients, EWC codes and received tonnage for the selected period."
            primaryHref={`/home/reports/export/operations?${rangeQuery}`}
            primaryLabel="Download CSV"
            secondaryHref="/home/jobs"
            secondaryLabel="Open Jobs"
          />

          <ReportCard
            eyebrow="Compliance"
            title="DWT submissions"
            description="Submission attempts, WTIDs, accepted records, warnings, rejections and failures."
            primaryHref={`/home/reports/export/dwt?${rangeQuery}`}
            primaryLabel="Download CSV"
            secondaryHref="/home/dwt/submissions"
            secondaryLabel="Open DWT history"
          />

          <ReportCard
            eyebrow="Regulatory admin"
            title="Quarterly return preparation"
            description="Prepare waste received/removed totals by EWC and resolve missing data before regulator submission."
            primaryHref="/home/returns"
            primaryLabel="Open returns"
            secondaryHref="/home/returns"
            secondaryLabel="CSV / Excel inside"
          />

          {access.canSeeFinancials && (
            <ReportCard
              eyebrow="Accounts"
              title="Commercial & billing"
              description="Revenue, direct costs, operational margin, PO data and unbilled completed jobs."
              primaryHref={`/home/accounts?${rangeQuery}`}
              primaryLabel="Open accounts"
              secondaryHref={`/home/accounts/export/excel?${rangeQuery}`}
              secondaryLabel="Download Excel"
            />
          )}

          <ReportCard
            eyebrow="Audit"
            title="Organisation activity"
            description="Read-only timeline of jobs, loads, DWT, billing, reports and explicit audit events."
            primaryHref="/home/activity"
            primaryLabel="Open activity"
            secondaryHref={
              access.canExportAudit
                ? `/home/activity/export?${rangeQuery}`
                : undefined
            }
            secondaryLabel={access.canExportAudit ? "Download CSV" : undefined}
          />

          <ReportCard
            eyebrow="Live operations"
            title="Daily worksheet"
            description="Today’s planned and active loads remain an operational screen rather than a static report."
            primaryHref="/home/worksheet"
            primaryLabel="Open worksheet"
            secondaryHref="/home/movements/incoming"
            secondaryLabel="Incoming register"
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
            <div className="border-b border-black/10 p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Waste received
              </p>
              <h2 className="mt-2 text-2xl font-semibold">EWC breakdown</h2>
              <p className="mt-2 text-sm text-black/45">
                Received incoming loads grouped by the factual EWC snapshot held on each Load.
              </p>
            </div>

            {data.ewcRows.length === 0 ? (
              <div className="p-10 text-center text-sm text-black/45">No received waste in this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead className="bg-black text-white">
                    <tr className="text-[10px] uppercase tracking-[0.15em] text-white/55">
                      <th className="px-5 py-3">EWC</th>
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3 text-right">Loads</th>
                      <th className="px-5 py-3 text-right">Tonnes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.ewcRows.map((row) => (
                      <tr key={row.ewcCode}>
                        <td className="px-5 py-4 font-semibold">{row.ewcCode}</td>
                        <td className="px-5 py-4 text-black/55">{row.description}</td>
                        <td className="px-5 py-4 text-right text-black/55">{row.loads}</td>
                        <td className="px-5 py-4 text-right font-semibold">{tonnes(row.tonnes)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                DWT health
              </p>
              <h2 className="mt-2 text-xl font-semibold">Submission status</h2>
              <div className="mt-5 space-y-3">
                <StatusRow label="Accepted" value={data.dwt.accepted} tone="success" />
                <StatusRow label="Accepted with warnings" value={data.dwt.acceptedWithWarnings} tone="warning" />
                <StatusRow label="Rejected" value={data.dwt.rejected} tone="danger" />
                <StatusRow label="Failed" value={data.dwt.failed} tone="danger" />
                <StatusRow label="Submitted / pending" value={data.dwt.submitted} tone="info" />
                <StatusRow label="Draft" value={data.dwt.draft} tone="neutral" />
              </div>
              <Link href="/home/dwt" className="mt-5 inline-flex text-sm font-semibold text-orange-700 hover:text-black">
                Open DWT Centre →
              </Link>
            </div>

            {access.canSeeFinancials && data.commercial && (
              <div className="rounded-[28px] border border-orange-200 bg-orange-50 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">
                  Commercial snapshot
                </p>
                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <SmallMoney label="Revenue" value={data.commercial.totals.revenue} />
                  <SmallMoney label="Direct cost" value={data.commercial.totals.directCost} />
                  <SmallMoney label="Operational margin" value={data.commercial.totals.margin} strong />
                  <SmallMoney label="All-time unbilled" value={data.commercial.allTimeUnbilled.revenue} warning={data.commercial.allTimeUnbilled.jobs > 0} />
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
              Customer activity
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Top clients in period</h2>
          </div>

          {data.clientRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-black/45">No client activity in this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-[#fbfaf7] text-[10px] uppercase tracking-[0.15em] text-black/35">
                  <tr>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3 text-right">Jobs</th>
                    <th className="px-5 py-3 text-right">Completed loads</th>
                    <th className="px-5 py-3 text-right">Tonnes</th>
                    {access.canSeeFinancials && <th className="px-5 py-3 text-right">Revenue</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {data.clientRows.map((row) => (
                    <tr key={row.clientId}>
                      <td className="px-5 py-4 font-semibold">{row.clientName}</td>
                      <td className="px-5 py-4 text-right text-black/55">{row.jobs}</td>
                      <td className="px-5 py-4 text-right text-black/55">{row.completedLoads}</td>
                      <td className="px-5 py-4 text-right font-semibold">{tonnes(row.tonnes)}</td>
                      {access.canSeeFinancials && (
                        <td className="px-5 py-4 text-right font-semibold">{money(row.revenue)}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">
            Reporting boundary
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-black/50">
            Reports are views and exports of the operational source data. They do not create a second ledger,
            rewrite historical Load snapshots or replace the official regulator submission process. Accounts remains
            the hand-off to an external accounting system; Returns remains the preparation workspace for regulatory returns.
          </p>
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  helper,
  highlighted = false,
  warning = false,
}: {
  label: string;
  value: string;
  helper: string;
  highlighted?: boolean;
  warning?: boolean;
}) {
  const classes = warning
    ? "border-red-200 bg-red-50"
    : highlighted
      ? "border-orange-200 bg-orange-50"
      : "border-black/10 bg-white";

  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${classes}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-black/40">{helper}</p>
    </div>
  );
}

function ReportCard({
  eyebrow,
  title,
  description,
  primaryHref,
  primaryLabel,
  secondaryHref,
  secondaryLabel,
}: {
  eyebrow: string;
  title: string;
  description: string;
  primaryHref: string;
  primaryLabel: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">{eyebrow}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <p className="mt-3 min-h-[72px] text-sm leading-6 text-black/50">{description}</p>
      <div className="mt-5 flex flex-wrap gap-2">
        <Link href={primaryHref} className="rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black">
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link href={secondaryHref} className="rounded-xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}

function StatusRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  const dot =
    tone === "success"
      ? "bg-emerald-500"
      : tone === "warning"
        ? "bg-orange-500"
        : tone === "danger"
          ? "bg-red-500"
          : tone === "info"
            ? "bg-blue-500"
            : "bg-black/25";

  return (
    <div className="flex items-center justify-between rounded-2xl bg-[#fbfaf7] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className={`size-2.5 rounded-full ${dot}`} />
        <span className="text-sm text-black/60">{label}</span>
      </div>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function SmallMoney({
  label,
  value,
  strong = false,
  warning = false,
}: {
  label: string;
  value: number;
  strong?: boolean;
  warning?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-orange-200/70 bg-white/60 px-4 py-3">
      <span className="text-xs font-medium text-orange-900/60">{label}</span>
      <span className={`${strong ? "text-lg" : "text-sm"} font-semibold ${warning ? "text-red-700" : "text-black"}`}>
        {money(value)}
      </span>
    </div>
  );
}
