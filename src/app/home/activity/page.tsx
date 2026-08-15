import Link from "next/link";

import {
  activityRangeToQuery,
  getSoloActivityFeed,
  parseActivityRange,
  type ActivityCategory,
  type ActivityTone,
} from "@/modules/activity/data-access/getSoloActivityFeed";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

type SearchParams = {
  from?: string | string[];
  to?: string | string[];
  category?: string | string[];
  q?: string | string[];
};

const CATEGORIES: { value: ActivityCategory; label: string }[] = [
  { value: "job", label: "Jobs" },
  { value: "load", label: "Loads" },
  { value: "dwt", label: "DWT" },
  { value: "billing", label: "Billing" },
  { value: "report", label: "Reports" },
  { value: "audit", label: "Audit" },
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isCategory(value: string): value is ActivityCategory {
  return CATEGORIES.some((category) => category.value === value);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function categoryLabel(value: ActivityCategory) {
  return CATEGORIES.find((category) => category.value === value)?.label ?? value;
}

function toneClasses(tone: ActivityTone) {
  if (tone === "success") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (tone === "warning") return "border-orange-200 bg-orange-50 text-orange-700";
  if (tone === "danger") return "border-red-200 bg-red-50 text-red-700";
  if (tone === "info") return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-black/10 bg-black/5 text-black/55";
}

export default async function ActivityPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireSoloWorkspaceAccess();
  const range = parseActivityRange(searchParams);
  const queryRange = activityRangeToQuery(range);
  const requestedCategory = first(searchParams.category);
  const category = isCategory(requestedCategory) ? requestedCategory : "";
  const search = first(searchParams.q).trim().toLowerCase();

  const feed = await getSoloActivityFeed({
    organisationId: access.organisationId,
    range,
    limit: 300,
  });

  const visibleFeedItems = feed.items.filter(
    (item) => access.canSeeFinancials || item.category !== "billing",
  );

  const visibleTotals = {
    all: visibleFeedItems.length,
    job: visibleFeedItems.filter((item) => item.category === "job").length,
    load: visibleFeedItems.filter((item) => item.category === "load").length,
    dwt: visibleFeedItems.filter((item) => item.category === "dwt").length,
    billing: visibleFeedItems.filter((item) => item.category === "billing").length,
    report: visibleFeedItems.filter((item) => item.category === "report").length,
    audit: visibleFeedItems.filter((item) => item.category === "audit").length,
  };

  const items = visibleFeedItems.filter((item) => {
    if (category && item.category !== category) return false;
    if (!search) return true;

    return [
      item.title,
      item.detail,
      item.reference,
      item.actorName ?? "",
      item.category,
    ].some((value) => value.toLowerCase().includes(search));
  });

  const exportParams = new URLSearchParams({
    from: queryRange.from,
    to: queryRange.to,
  });
  if (category) exportParams.set("category", category);
  if (first(searchParams.q)) exportParams.set("q", first(searchParams.q));

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-12 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Organisation Activity
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Activity
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                A read-only timeline of important operational, DWT, billing,
                reporting and audit events across {access.organisationName}.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/reports"
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Reports
              </Link>
              {access.canExportAudit && (
                <Link
                  href={`/home/activity/export?${exportParams.toString()}`}
                  className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
                >
                  Export activity CSV
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <Metric label="All" value={visibleTotals.all} />
          <Metric label="Jobs" value={visibleTotals.job} />
          <Metric label="Loads" value={visibleTotals.load} />
          <Metric label="DWT" value={visibleTotals.dwt} />
          <Metric label="Billing" value={visibleTotals.billing} />
          <Metric label="Reports" value={visibleTotals.report} />
          <Metric label="Audit" value={visibleTotals.audit} />
        </section>

        <section className="rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="grid gap-4 lg:grid-cols-[1fr_180px_180px_180px_auto] lg:items-end">
            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">
                Search activity
              </span>
              <input
                name="q"
                defaultValue={first(searchParams.q)}
                placeholder="Job, WTID, invoice, user..."
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">
                Category
              </span>
              <select
                name="category"
                defaultValue={category}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                <option value="">All activity</option>
                {CATEGORIES.filter((item) => access.canSeeFinancials || item.value !== "billing").map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">
                From
              </span>
              <input
                type="date"
                name="from"
                defaultValue={queryRange.from}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/45">
                To
              </span>
              <input
                type="date"
                name="to"
                defaultValue={queryRange.to}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              />
            </label>

            <button
              type="submit"
              className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Apply
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
          <div className="flex flex-col gap-2 border-b border-black/10 p-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Timeline
              </p>
              <h2 className="mt-2 text-2xl font-semibold">{items.length} events</h2>
            </div>
            <p className="text-xs text-black/40">
              Activity is read-only. Notifications remain the action/attention layer.
            </p>
          </div>

          {items.length === 0 ? (
            <div className="p-12 text-center text-sm text-black/45">
              No activity matches the selected filters.
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {items.map((item) => {
                const body = (
                  <div className="flex flex-col gap-4 p-5 transition hover:bg-[#fbfaf7] sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 gap-4">
                      <span className={`mt-1 size-3 shrink-0 rounded-full border ${toneClasses(item.tone)}`} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-black/45">
                            {categoryLabel(item.category)}
                          </span>
                          {item.actorName && (
                            <span className="text-xs text-black/35">
                              by {item.actorName}
                            </span>
                          )}
                        </div>
                        <h3 className="mt-2 font-semibold text-black">{item.title}</h3>
                        <p className="mt-1 text-sm leading-6 text-black/50">{item.detail}</p>
                        <p className="mt-2 break-all text-xs text-black/30">{item.reference}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-xs text-black/40 sm:text-right">
                      {formatDateTime(item.occurredAt)}
                    </div>
                  </div>
                );

                return item.href ? (
                  <Link key={item.id} href={item.href} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={item.id}>{body}</div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}
