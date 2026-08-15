import Link from "next/link";
import { and, eq, gte, inArray, lt } from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads, jobs } from "@/db/schema";
import {
  defaultCommercialDateRange,
  getCommercialAdminData,
} from "@/modules/admin-value/data-access/getCommercialAdminData";
import {
  defaultActivityRange,
  getSoloActivityFeed,
} from "@/modules/activity/data-access/getSoloActivityFeed";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

function startOfTodayUtc(date = new Date()) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function endOfTodayUtc(date = new Date()) {
  const start = startOfTodayUtc(date);
  return new Date(start.getTime() + 86_400_000);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(value);
}

function formatShortDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function money(value: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function statusLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default async function HomePage() {
  const access = await requireSoloWorkspaceAccess();
  const now = new Date();
  const todayStart = startOfTodayUtc(now);
  const todayEnd = endOfTodayUtc(now);

  const [todayJobs, completedIncomingLoads, activity, commercial] =
    await Promise.all([
      database.query.jobs.findMany({
        where: and(
          eq(jobs.organisationId, access.organisationId),
          gte(jobs.jobDate, todayStart),
          lt(jobs.jobDate, todayEnd),
        ),
        with: {
          client: true,
          clientSite: true,
          materialProfile: {
            with: {
              ewcCode: true,
            },
          },
          loads: true,
        },
        orderBy: (job, { asc }) => [asc(job.createdAt)],
      }),

      database.query.jobLoads.findMany({
        where: and(
          eq(jobLoads.organisationId, access.organisationId),
          eq(jobLoads.direction, "incoming"),
          inArray(jobLoads.status, ["accepted", "completed"]),
        ),
        with: {
          job: true,
          submissions: true,
        },
        orderBy: (load, { desc }) => [desc(load.receivedAt), desc(load.createdAt)],
        limit: 250,
      }),

      getSoloActivityFeed({
        organisationId: access.organisationId,
        range: defaultActivityRange(now),
        limit: 8,
      }),

      access.canSeeFinancials
        ? getCommercialAdminData({
            organisationId: access.organisationId,
            range: defaultCommercialDateRange(now),
          })
        : Promise.resolve(null),
    ]);

  const allTodayLoads = todayJobs.flatMap((job) => job.loads);
  const plannedLoads = allTodayLoads.filter((load) => load.status === "planned").length;
  const activeLoads = allTodayLoads.filter((load) =>
    ["arrived", "accepted"].includes(load.status),
  ).length;
  const completedLoads = allTodayLoads.filter(
    (load) => load.status === "completed",
  ).length;
  const rejectedLoads = allTodayLoads.filter(
    (load) => load.status === "rejected",
  ).length;

  const dwtReviewLoads = completedIncomingLoads.filter((load) => {
    return !load.submissions.some((submission) =>
      ["accepted", "accepted_with_warnings"].includes(submission.status),
    );
  });

  const recentActivityItems = activity.items
    .filter((item) => access.canSeeFinancials || item.category !== "billing")
    .slice(0, 8);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-12 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-28 left-1/3 size-72 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative z-10 grid gap-8 xl:grid-cols-[1.1fr_0.9fr] xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                {access.organisationName}
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                {formatDate(now)}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/55">
                Run today’s waste operation from booked Jobs and Loads, then let
                Waste X carry the same records into DWT, returns, billing and reports.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/home/jobs/new"
                  className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
                >
                  + Book a Job
                </Link>
                <Link
                  href="/home/worksheet"
                  className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
                >
                  Daily Worksheet
                </Link>
                <Link
                  href="/home/dwt"
                  className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
                >
                  DWT Centre
                </Link>
              </div>
            </div>

            <form action="/home/search" method="get" className="rounded-[24px] border border-white/10 bg-white/5 p-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
                Search Waste X
              </p>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <input
                  name="q"
                  placeholder="Job, PO, client, vehicle, WTID..."
                  className="min-h-12 flex-1 rounded-2xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-orange-400"
                />
                <button
                  type="submit"
                  className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
                >
                  Search
                </button>
              </div>
              <p className="mt-3 text-xs leading-5 text-white/35">
                Search stays scoped to your organisation.
              </p>
            </form>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric
            label="Jobs today"
            value={todayJobs.length}
            helper={`${allTodayLoads.length} planned/recorded loads`}
          />
          <Metric
            label="Planned"
            value={plannedLoads}
            helper="Still waiting to run"
          />
          <Metric
            label="Active"
            value={activeLoads}
            helper="Arrived or accepted"
            highlighted={activeLoads > 0}
          />
          <Metric
            label="Completed"
            value={completedLoads}
            helper="Finished today"
          />
          <Metric
            label="Rejected"
            value={rejectedLoads}
            helper="Operational exceptions"
            danger={rejectedLoads > 0}
          />
          <Metric
            label="DWT to review"
            value={dwtReviewLoads.length}
            helper="Received loads without accepted DWT"
            warning={dwtReviewLoads.length > 0}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-black/10 p-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Today
                </p>
                <h2 className="mt-2 text-2xl font-semibold">Booked work</h2>
                <p className="mt-2 text-sm text-black/45">
                  These are the Jobs that feed today’s Daily Worksheet.
                </p>
              </div>
              <Link href="/home/jobs" className="text-sm font-semibold text-orange-700 hover:text-black">
                View all Jobs →
              </Link>
            </div>

            {todayJobs.length === 0 ? (
              <div className="p-10 text-center">
                <p className="text-sm text-black/45">No jobs are booked for today.</p>
                <Link
                  href="/home/jobs/new"
                  className="mt-5 inline-flex rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                >
                  Book a Job
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {todayJobs.slice(0, 8).map((job) => {
                  const done = job.loads.filter((load) => load.status === "completed").length;
                  const active = job.loads.filter((load) => ["arrived", "accepted"].includes(load.status)).length;
                  const ewc = job.materialProfile?.ewcCode?.code;

                  return (
                    <Link
                      key={job.id}
                      href={`/home/jobs/${job.id}`}
                      className="group flex flex-col gap-4 p-5 transition hover:bg-orange-50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-black px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">
                            {statusLabel(job.status)}
                          </span>
                          {ewc && (
                            <span className="text-xs text-black/35">EWC {ewc}</span>
                          )}
                        </div>
                        <p className="mt-2 font-semibold group-hover:text-orange-700">
                          {job.jobNumber} · {job.client?.name ?? "No client"}
                        </p>
                        <p className="mt-1 truncate text-sm text-black/45">
                          {job.clientSite?.name ?? "No origin"} · {job.materialProfile?.name ?? "No material"}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-4 text-xs text-black/45">
                        <span>{job.loads.length} loads</span>
                        <span>{active} active</span>
                        <span className="font-semibold text-black">{done} done</span>
                        <span className="text-orange-600">→</span>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="space-y-5">
            <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Admin attention
              </p>
              <h2 className="mt-2 text-xl font-semibold">What needs a look</h2>

              <div className="mt-5 space-y-3">
                <AttentionRow
                  label="DWT receipts to review"
                  value={dwtReviewLoads.length}
                  href="/home/dwt"
                  warning={dwtReviewLoads.length > 0}
                />
                {access.canSeeFinancials && commercial && (
                  <AttentionRow
                    label="Unbilled completed jobs"
                    value={commercial.allTimeUnbilled.jobs}
                    href="/home/accounts"
                    warning={commercial.allTimeUnbilled.jobs > 0}
                  />
                )}
                <AttentionRow
                  label="Rejected loads today"
                  value={rejectedLoads}
                  href="/home/worksheet"
                  warning={rejectedLoads > 0}
                />
              </div>
            </div>

            {access.canSeeFinancials && commercial && (
              <div className="rounded-[28px] border border-orange-200 bg-orange-50 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">
                  This month
                </p>
                <h2 className="mt-2 text-xl font-semibold">Commercial snapshot</h2>
                <div className="mt-4 space-y-3">
                  <MoneyRow label="Revenue" value={commercial.totals.revenue} />
                  <MoneyRow label="Direct cost" value={commercial.totals.directCost} />
                  <MoneyRow label="Operational margin" value={commercial.totals.margin} strong />
                  <MoneyRow label="All-time unbilled" value={commercial.allTimeUnbilled.revenue} warning={commercial.allTimeUnbilled.jobs > 0} />
                </div>
                <Link href="/home/accounts" className="mt-5 inline-flex text-sm font-semibold text-orange-800 hover:text-black">
                  Open Billing & Exports →
                </Link>
              </div>
            )}
          </aside>
        </section>

        <section className="grid gap-6 xl:grid-cols-[0.75fr_1.25fr]">
          <div className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
              Shortcuts
            </p>
            <h2 className="mt-2 text-2xl font-semibold">Go straight there</h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <QuickLink href="/home/jobs/new" title="Book a Job" detail="Create planned incoming work" />
              <QuickLink href="/home/worksheet" title="Daily Worksheet" detail="Run today’s Loads" />
              <QuickLink href="/home/dwt" title="DWT Centre" detail="Review and submit receipts" />
              <QuickLink href="/home/returns" title="Quarterly Returns" detail="Prepare waste-return totals" />
              {access.canSeeFinancials && (
                <QuickLink href="/home/accounts" title="Billing & Exports" detail="Unbilled jobs and accountant exports" />
              )}
              <QuickLink href="/home/reports" title="Reports" detail="Operations, compliance and admin reporting" />
            </div>
          </div>

          <div className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
            <div className="flex items-end justify-between gap-4 border-b border-black/10 p-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Recent activity
                </p>
                <h2 className="mt-2 text-2xl font-semibold">What changed</h2>
              </div>
              <Link href="/home/activity" className="text-sm font-semibold text-orange-700 hover:text-black">
                Full activity →
              </Link>
            </div>

            {recentActivityItems.length === 0 ? (
              <div className="p-10 text-center text-sm text-black/45">No recent activity yet.</div>
            ) : (
              <div className="divide-y divide-black/5">
                {recentActivityItems.map((item) => (
                  <div key={item.id} className="flex items-start justify-between gap-4 p-5">
                    <div className="min-w-0">
                      <p className="font-medium text-black">{item.title}</p>
                      <p className="mt-1 truncate text-sm text-black/45">{item.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-black/35">{formatShortDate(item.occurredAt)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
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
  danger = false,
}: {
  label: string;
  value: number;
  helper: string;
  highlighted?: boolean;
  warning?: boolean;
  danger?: boolean;
}) {
  const classes = danger
    ? "border-red-200 bg-red-50"
    : warning
      ? "border-orange-200 bg-orange-50"
      : highlighted
        ? "border-orange-200 bg-white"
        : "border-black/10 bg-white";

  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${classes}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-5 text-black/40">{helper}</p>
    </div>
  );
}

function AttentionRow({
  label,
  value,
  href,
  warning,
}: {
  label: string;
  value: number;
  href: string;
  warning: boolean;
}) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 transition hover:border-orange-300 hover:bg-orange-50">
      <span className="text-sm text-black/60">{label}</span>
      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${warning ? "bg-orange-500 text-black" : "bg-black/5 text-black/45"}`}>
        {value}
      </span>
    </Link>
  );
}

function MoneyRow({
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
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/65 px-4 py-3">
      <span className="text-xs font-medium text-orange-900/60">{label}</span>
      <span className={`${strong ? "text-lg" : "text-sm"} font-semibold ${warning ? "text-red-700" : "text-black"}`}>
        {money(value)}
      </span>
    </div>
  );
}

function QuickLink({ href, title, detail }: { href: string; title: string; detail: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between gap-4 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 transition hover:border-orange-300 hover:bg-orange-50">
      <div>
        <p className="text-sm font-semibold group-hover:text-orange-700">{title}</p>
        <p className="mt-1 text-xs text-black/40">{detail}</p>
      </div>
      <span className="text-orange-600 transition group-hover:translate-x-1">→</span>
    </Link>
  );
}
