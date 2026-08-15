import Link from "next/link";

import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import {
  getEnglandEaSubmissionWindow,
  parseQuarterSearchParams,
} from "@/modules/admin-value/core/quarterPeriods";
import { getQuarterlyWasteReturnData } from "@/modules/admin-value/data-access/getQuarterlyWasteReturnData";

type SearchParams = {
  year?: string | string[];
  quarter?: string | string[];
  siteId?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function tonnes(value: number) {
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)} t`;
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export default async function QuarterlyReturnsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireAdminValueAccess();
  const period = parseQuarterSearchParams(searchParams);
  const requestedSiteId = first(searchParams.siteId) || null;

  const data = await getQuarterlyWasteReturnData({
    organisationId: access.organisationId,
    period,
    requestedSiteId,
  });

  const query = new URLSearchParams({
    year: String(period.year),
    quarter: String(period.quarter),
  });

  if (data.selectedSiteId) {
    query.set("siteId", data.selectedSiteId);
  }

  const eaWindow =
    data.selectedSite?.regulator === "EA"
      ? getEnglandEaSubmissionWindow(period)
      : null;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Compliance admin
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Quarterly Returns
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Prepare the waste tonnage return from the same factual Load records
                already used by operations and DWT. Waste X aggregates accepted
                waste received and recorded waste removed without creating a second
                return-only dataset.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/home/returns/export/csv?${query.toString()}`}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Download prep CSV
              </Link>
              <Link
                href={`/home/returns/export/excel?${query.toString()}`}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Download prep Excel
              </Link>
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_2fr_auto] xl:items-end">
            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">Year</span>
              <select
                name="year"
                defaultValue={String(period.year)}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                {Array.from({ length: 7 }, (_, index) => period.year - 3 + index).map((year) => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">Quarter</span>
              <select
                name="quarter"
                defaultValue={String(period.quarter)}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                <option value="1">Q1 · Jan–Mar</option>
                <option value="2">Q2 · Apr–Jun</option>
                <option value="3">Q3 · Jul–Sep</option>
                <option value="4">Q4 · Oct–Dec</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">Receiving site</span>
              <select
                name="siteId"
                defaultValue={data.selectedSiteId ?? ""}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                {data.sites.length === 0 && <option value="">No receiving site configured</option>}
                {data.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}{site.primaryPermitNumber ? ` · ${site.primaryPermitNumber}` : " · no active permit"}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Prepare return
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="Period" value={period.label} helper={period.periodLabel} />
          <Metric label="Received" value={tonnes(data.totals.receivedTonnes)} helper={`${data.totals.receivedLoads} accepted load${data.totals.receivedLoads === 1 ? "" : "s"}`} />
          <Metric label="Removed" value={tonnes(data.totals.removedTonnes)} helper={`${data.totals.removedLoads} recorded load${data.totals.removedLoads === 1 ? "" : "s"}`} />
          <Metric label="EWC codes" value={String(data.aggregateRows.length)} helper="In prepared totals" />
          <Metric label="Exceptions" value={String(data.exceptions.length)} helper="Excluded until resolved" warning={data.exceptions.length > 0} />
        </section>

        <section className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Return context</p>
            <h2 className="mt-2 text-xl font-semibold">{data.selectedSite?.name ?? "Receiving site not configured"}</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info label="Permit / authorisation" value={data.selectedSite?.primaryPermitNumber ?? "Missing"} />
              <Info label="Regulator" value={data.selectedSite?.regulator ?? "Unknown"} />
              <Info label="Postcode" value={data.selectedSite?.postcode || "Not recorded"} />
              <Info label="Return period" value={period.periodLabel} />
            </div>
          </div>

          <div className={`rounded-[28px] border p-6 ${data.exceptions.length > 0 ? "border-red-200 bg-red-50 text-red-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-65">Preparation status</p>
            <h2 className="mt-2 text-xl font-semibold">
              {data.exceptions.length > 0 ? "Resolve data exceptions before filing" : "Prepared totals have no blocking data exceptions"}
            </h2>
            <p className="mt-3 text-sm leading-6 opacity-75">
              Waste X excludes loads with missing movement dates, EWC codes, usable weights or permit linkage rather than silently guessing regulatory return data.
            </p>
            {eaWindow && (
              <p className="mt-4 rounded-2xl border border-current/15 bg-white/45 p-4 text-sm font-medium">
                Environment Agency submission window for this quarter: {eaWindow.label}.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Automatic aggregation</p>
            <h2 className="mt-2 text-2xl font-semibold">Waste received / removed by EWC</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
              “Removed” here is regulatory return terminology for waste leaving the permitted site. It does not mean Waste X has expanded the current MVP to generator users.
            </p>
          </div>

          {data.aggregateRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-black/45">
              No valid return rows were found for this site and quarter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-sm">
                <thead className="bg-black text-white">
                  <tr className="text-[10px] uppercase tracking-[0.14em] text-white/55">
                    <th className="px-5 py-3">EWC</th>
                    <th className="px-5 py-3">Description</th>
                    <th className="px-5 py-3">Received loads</th>
                    <th className="px-5 py-3">Received tonnes</th>
                    <th className="px-5 py-3">Removed loads</th>
                    <th className="px-5 py-3">Removed tonnes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {data.aggregateRows.map((row) => (
                    <tr key={row.ewcCode}>
                      <td className="px-5 py-4 font-semibold">{row.ewcCode}</td>
                      <td className="max-w-lg px-5 py-4 text-black/55">{row.wasteDescription || "—"}</td>
                      <td className="px-5 py-4">{row.receivedLoads}</td>
                      <td className="px-5 py-4 font-semibold">{tonnes(row.receivedTonnes)}</td>
                      <td className="px-5 py-4">{row.removedLoads}</td>
                      <td className="px-5 py-4 font-semibold">{tonnes(row.removedTonnes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {data.exceptions.length > 0 && (
          <section className="mt-8 overflow-hidden rounded-[30px] border border-red-200 bg-white shadow-sm">
            <div className="border-b border-red-100 bg-red-50 p-6 text-red-900">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-red-600">Needs attention</p>
              <h2 className="mt-2 text-2xl font-semibold">Return data exceptions</h2>
              <p className="mt-2 text-sm leading-6 text-red-800/70">
                These loads are not included in the prepared totals until the missing or conflicting data is fixed.
              </p>
            </div>
            <div className="divide-y divide-black/5">
              {data.exceptions.map((item, index) => (
                <div key={`${item.jobLoadId}-${index}`} className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-sm font-semibold">{item.jobNumber} · Load {item.loadNumber}</p>
                    <p className="mt-1 text-sm text-black/50">{item.issue}</p>
                  </div>
                  <span className="rounded-full bg-red-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">Excluded</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-[30px] border border-orange-200 bg-orange-50 p-6 text-orange-900">
          <p className="text-sm font-semibold">Preparation export — not the regulator submission file</p>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-orange-900/70">
            Waste X prepares and reconciles the operational data. For Environment Agency waste tonnage returns, use the current official EA Excel return form for the actual submission. We are intentionally not cloning a regulator workbook that can change over time.
          </p>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-orange-900/70">
            This page prepares permit waste-tonnage return data. Hazardous-waste consignee returns are a separate regulatory return and are not generated by this screen.
          </p>
        </section>

        <details className="mt-8 rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
          <summary className="cursor-pointer text-lg font-semibold">View prepared movement detail ({data.detailRows.length})</summary>
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="bg-[#f3eee7] text-[10px] uppercase tracking-[0.14em] text-black/40">
                <tr>
                  <th className="px-4 py-3">Direction</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Job / load</th>
                  <th className="px-4 py-3">Ticket</th>
                  <th className="px-4 py-3">EWC</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Tonnes</th>
                  <th className="px-4 py-3">Source / destination</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {data.detailRows.map((row) => (
                  <tr key={row.jobLoadId}>
                    <td className="px-4 py-3 capitalize">{row.direction}</td>
                    <td className="px-4 py-3 text-black/55">{dateTime(row.eventAt)}</td>
                    <td className="px-4 py-3 font-medium">{row.jobNumber} / {row.loadNumber}</td>
                    <td className="px-4 py-3 text-black/55">{row.ticketNumber || "—"}</td>
                    <td className="px-4 py-3 font-semibold">{row.ewcCode}</td>
                    <td className="max-w-md px-4 py-3 text-black/55">{row.wasteDescription}</td>
                    <td className="px-4 py-3 font-semibold">{tonnes(row.tonnes)}</td>
                    <td className="px-4 py-3 text-black/55">
                      {row.direction === "received"
                        ? [row.counterpartyName, row.counterpartySiteName].filter(Boolean).join(" · ") || "—"
                        : row.thirdPartyDestination || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  helper,
  warning = false,
}: {
  label: string;
  value: string;
  helper: string;
  warning?: boolean;
}) {
  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${warning ? "border-red-200 bg-red-50" : "border-black/10 bg-white"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-black/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-black/40">{helper}</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-black/30">{label}</p>
      <p className="mt-2 break-words text-sm font-semibold">{value}</p>
    </div>
  );
}
