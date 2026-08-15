import Link from "next/link";

import {
  commercialDateRangeToQuery,
  getCommercialAdminData,
  parseCommercialDateRange,
} from "@/modules/admin-value/data-access/getCommercialAdminData";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";

import { markJobBilledAction, markJobUnbilledAction } from "./actions";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
  success?: string | string[];
  error?: string | string[];
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

function date(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function feedbackMessage(params: SearchParams) {
  const success = first(params.success);
  const error = first(params.error);

  if (success === "marked_billed") {
    return {
      tone: "success" as const,
      title: "Job marked as billed",
      text: "The customer invoice reference has been saved against the completed job.",
    };
  }

  if (success === "marked_unbilled") {
    return {
      tone: "success" as const,
      title: "Job returned to unbilled",
      text: "The customer invoice marker has been cleared.",
    };
  }

  if (error === "invoice_reference_required") {
    return {
      tone: "error" as const,
      title: "Invoice reference required",
      text: "Enter the reference from the invoice raised in your accounting system.",
    };
  }

  if (error === "job_not_completed") {
    return {
      tone: "error" as const,
      title: "Job is not complete",
      text: "Only completed jobs can be marked as billed.",
    };
  }

  if (error) {
    return {
      tone: "error" as const,
      title: "Billing update not saved",
      text: "Waste X could not update that job. Refresh the page and try again.",
    };
  }

  return null;
}

export default async function AccountsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireAdminValueAccess();
  const range = parseCommercialDateRange(searchParams);
  const data = await getCommercialAdminData({
    organisationId: access.organisationId,
    range,
  });
  const query = commercialDateRangeToQuery(range);
  const feedback = feedbackMessage(searchParams);

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Accounts
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Billing & Exports
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Turn completed operational work into invoice-ready information
                without trying to turn Waste X into an accounting package.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/home/accounts/export/csv?from=${query.from}&to=${query.to}`}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Download CSV
              </Link>
              <Link
                href={`/home/accounts/export/excel?from=${query.from}&to=${query.to}`}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Download Excel
              </Link>
            </div>
          </div>
        </section>

        {feedback && (
          <section
            className={`mt-6 rounded-3xl border p-5 text-sm ${
              feedback.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            <p className="font-semibold">{feedback.title}</p>
            <p className="mt-1 leading-6 opacity-80">{feedback.text}</p>
          </section>
        )}

        <section className="mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <label className="flex-1">
              <span className="mb-2 block text-xs font-semibold text-black/50">
                From
              </span>
              <input
                type="date"
                name="from"
                defaultValue={query.from}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="flex-1">
              <span className="mb-2 block text-xs font-semibold text-black/50">
                To
              </span>
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

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Completed jobs" value={String(data.totals.completedJobs)} helper={`${data.totals.completedLoads} loads`} />
          <Metric label="Tonnes" value={tonnes(data.totals.tonnes)} helper="Completed loads" />
          <Metric label="Revenue" value={money(data.totals.revenue)} helper="Operational charges" />
          <Metric label="Direct costs" value={money(data.totals.directCost)} helper="Recorded haulage + tipping" />
          <Metric label="Margin" value={money(data.totals.margin)} helper="Before overhead/internal costs" highlighted />
          <Metric label="All-time unbilled" value={money(data.allTimeUnbilled.revenue)} helper={`${data.allTimeUnbilled.jobs} completed jobs`} warning={data.allTimeUnbilled.jobs > 0} />
        </section>

        <section className="mt-8 grid gap-6 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-black/10 p-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Action queue
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Unbilled completed jobs</h2>
                <p className="mt-2 text-sm text-black/45">
                  These jobs are operationally complete but do not yet have a customer invoice reference recorded in Waste X.
                </p>
              </div>
              <span className="rounded-full bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700">
                {data.allTimeUnbilledJobs.length} jobs
              </span>
            </div>

            {data.allTimeUnbilledJobs.length === 0 ? (
              <div className="p-10 text-center text-sm text-black/45">
                No completed jobs are waiting for billing.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-black text-white">
                    <tr className="text-[10px] uppercase tracking-[0.15em] text-white/55">
                      <th className="px-5 py-3">Job</th>
                      <th className="px-5 py-3">Client</th>
                      <th className="px-5 py-3">PO</th>
                      <th className="px-5 py-3">Completed</th>
                      <th className="px-5 py-3">Loads / tonnes</th>
                      <th className="px-5 py-3">Revenue</th>
                      <th className="px-5 py-3">Invoice reference</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.allTimeUnbilledJobs.map((job) => (
                      <tr key={job.id} className="align-top">
                        <td className="px-5 py-4">
                          <Link href={`/home/jobs/${job.id}`} className="font-semibold text-black hover:text-orange-700">
                            {job.jobNumber}
                          </Link>
                          <p className="mt-1 text-xs text-black/35">{job.customerRateLabel}</p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium">{job.clientName}</p>
                          <p className="mt-1 text-xs text-black/35">{job.clientSiteName}</p>
                        </td>
                        <td className="px-5 py-4 text-black/55">{job.purchaseOrder || "—"}</td>
                        <td className="px-5 py-4 text-black/55">{date(job.completedAt ?? job.jobDate)}</td>
                        <td className="px-5 py-4 text-black/55">
                          {job.completedLoads} / {tonnes(job.tonnes)}
                        </td>
                        <td className="px-5 py-4 font-semibold">{money(job.revenue)}</td>
                        <td className="px-5 py-4">
                          <form action={markJobBilledAction} className="flex gap-2">
                            <input type="hidden" name="jobId" value={job.id} />
                            <input
                              name="invoiceReference"
                              required
                              placeholder="INV-12345"
                              className="h-10 min-w-0 flex-1 rounded-xl border border-black/10 px-3 text-xs outline-none focus:border-orange-400"
                            />
                            <button className="h-10 shrink-0 rounded-xl bg-black px-3 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                              Mark billed
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-orange-200 bg-orange-50 p-6">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">
                What the numbers mean
              </p>
              <h3 className="mt-2 text-lg font-semibold">Operational commercial view</h3>
              <p className="mt-3 text-sm leading-6 text-orange-900/70">
                Revenue is calculated from customer-charge snapshots on completed loads. Direct cost currently means recorded haulage and tipping cost only.
              </p>
              <p className="mt-3 text-sm leading-6 text-orange-900/70">
                It is deliberately not a statutory profit-and-loss account: VAT, tax, payroll, overheads, depreciation and unrecorded internal fleet costs are outside this MVP.
              </p>
            </div>

            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">
                Accounting integrations
              </p>
              <h3 className="mt-2 text-lg font-semibold">Export first, integrate later</h3>
              <p className="mt-3 text-sm leading-6 text-black/50">
                The CSV and Excel exports create a stable hand-off for an accountant now. Xero, Sage and QuickBooks can be connected later without rebuilding Waste X as a ledger.
              </p>
            </div>

            {data.pricingIssueCount > 0 && (
              <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-800">
                <p className="text-sm font-semibold">{data.pricingIssueCount} pricing issue{data.pricingIssueCount === 1 ? "" : "s"}</p>
                <p className="mt-2 text-sm leading-6 opacity-80">
                  Some completed work has missing price or weight information. Review the period table before relying on totals.
                </p>
              </div>
            )}
          </aside>
        </section>

        <section className="mt-8 overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/10 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Selected period</p>
            <h2 className="mt-2 text-2xl font-semibold">Completed job commercial detail</h2>
          </div>

          {data.jobs.length === 0 ? (
            <div className="p-10 text-center text-sm text-black/45">No completed jobs in this period.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] text-left text-sm">
                <thead className="bg-[#f3eee7] text-[10px] uppercase tracking-[0.14em] text-black/40">
                  <tr>
                    <th className="px-5 py-3">Job</th>
                    <th className="px-5 py-3">Client</th>
                    <th className="px-5 py-3">PO / reference</th>
                    <th className="px-5 py-3">Rate</th>
                    <th className="px-5 py-3">Tonnes</th>
                    <th className="px-5 py-3">Revenue</th>
                    <th className="px-5 py-3">Direct cost</th>
                    <th className="px-5 py-3">Margin</th>
                    <th className="px-5 py-3">Billing</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {data.jobs.map((job) => (
                    <tr key={job.id}>
                      <td className="px-5 py-4">
                        <Link href={`/home/jobs/${job.id}`} className="font-semibold hover:text-orange-700">{job.jobNumber}</Link>
                        <p className="mt-1 text-xs text-black/35">{date(job.completedAt ?? job.jobDate)}</p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-medium">{job.clientName}</p>
                        <p className="mt-1 text-xs text-black/35">{job.clientSiteName}</p>
                      </td>
                      <td className="px-5 py-4 text-black/55">
                        <p>{job.purchaseOrder || "No PO"}</p>
                        <p className="mt-1 text-xs text-black/35">{job.customerReference || "No customer reference"}</p>
                      </td>
                      <td className="px-5 py-4 text-black/55">{job.customerRateLabel}</td>
                      <td className="px-5 py-4">{tonnes(job.tonnes)}</td>
                      <td className="px-5 py-4 font-semibold">{money(job.revenue)}</td>
                      <td className="px-5 py-4">{money(job.directCost)}</td>
                      <td className="px-5 py-4 font-semibold">{money(job.margin)}</td>
                      <td className="px-5 py-4">
                        {job.isBilled ? (
                          <div>
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-700">Billed</span>
                            <p className="mt-2 text-xs font-medium">{job.customerInvoiceReference || "Reference not recorded"}</p>
                            <form action={markJobUnbilledAction} className="mt-2">
                              <input type="hidden" name="jobId" value={job.id} />
                              <button className="text-xs font-semibold text-black/40 underline decoration-black/20 underline-offset-4 hover:text-red-600">Mark unbilled</button>
                            </form>
                          </div>
                        ) : (
                          <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700">Unbilled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
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
  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${highlighted ? "border-orange-200 bg-orange-50" : warning ? "border-red-200 bg-red-50" : "border-black/10 bg-white"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.17em] text-black/35">{label}</p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs text-black/40">{helper}</p>
    </div>
  );
}
