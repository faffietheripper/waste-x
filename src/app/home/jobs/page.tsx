import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobs, users } from "@/db/schema";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string) {
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "in_progress") return "border-orange-200 bg-orange-50 text-orange-700";
  if (status === "cancelled") return "border-red-200 bg-red-50 text-red-700";
  if (status === "draft") return "border-black/10 bg-black/5 text-black/50";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!user?.organisationId || !user.isActive || user.isSuspended) {
    redirect("/home");
  }

  const allJobs = await database.query.jobs.findMany({
    where: eq(jobs.organisationId, user.organisationId),
    with: {
      client: { columns: { name: true } },
      clientSite: { columns: { name: true, postcode: true } },
      ownSite: { columns: { name: true, postcode: true } },
      thirdPartyDestinationSite: { columns: { name: true, postcode: true } },
      haulier: { columns: { name: true } },
      driver: { columns: { name: true } },
      vehicle: { columns: { registrationNumber: true } },
      materialProfile: {
        columns: { name: true },
        with: {
          ewcCode: { columns: { code: true } },
        },
      },
      sourceTemplate: { columns: { name: true } },
      loads: {
        columns: {
          id: true,
          status: true,
          loadNumber: true,
        },
      },
    },
    orderBy: (job, { desc }) => [desc(job.jobDate), desc(job.createdAt)],
  });

  const q = first(searchParams?.q).trim().toLowerCase();
  const status = first(searchParams?.status);
  const validStatus = ["draft", "booked", "in_progress", "completed", "cancelled"].includes(status)
    ? status
    : "all";

  const filteredJobs = allJobs.filter((job) => {
    if (validStatus !== "all" && job.status !== validStatus) return false;
    if (!q) return true;

    return [
      job.jobNumber,
      job.client?.name,
      job.clientSite?.name,
      job.clientSite?.postcode,
      job.materialProfile?.name,
      job.materialProfile?.ewcCode?.code,
      job.haulier?.name,
      job.driver?.name,
      job.vehicle?.registrationNumber,
      job.purchaseOrder,
      job.customerReference,
    ].some((value) => value?.toLowerCase().includes(q));
  });

  const count = (target: string) => allJobs.filter((job) => job.status === target).length;
  const loadCount = allJobs.reduce((sum, job) => sum + job.loads.length, 0);
  const completedLoadCount = allJobs.reduce(
    (sum, job) => sum + job.loads.filter((load) => load.status === "completed").length,
    0,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Operations
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Jobs</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Jobs are the planned commercial work. Each job creates planned loads that
                later flow into the Daily Worksheet and the actual receipt/DWT workflow.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/jobs/templates"
                className="rounded-2xl border border-white/15 px-4 py-3 text-xs font-semibold text-white/75 transition hover:bg-white/10"
              >
                Job templates
              </Link>
              <Link
                href="/home/jobs/new"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-orange-400"
              >
                + Book a Job
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="All jobs" value={allJobs.length} sub={`${loadCount} loads`} />
          <Metric label="Booked" value={count("booked")} sub="Waiting to run" />
          <Metric label="In progress" value={count("in_progress")} sub="Live work" highlight />
          <Metric label="Completed" value={count("completed")} sub="Finished jobs" />
          <Metric label="Completed loads" value={completedLoadCount} sub={`of ${loadCount}`} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="grid gap-3 md:grid-cols-[1fr_220px_auto_auto]">
            <input
              name="q"
              defaultValue={first(searchParams?.q)}
              placeholder="Search job, client, origin, material, EWC, vehicle..."
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400"
            />
            <select
              name="status"
              defaultValue={validStatus}
              className="h-12 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm outline-none focus:border-orange-400"
            >
              <option value="all">All statuses</option>
              <option value="draft">Draft</option>
              <option value="booked">Booked</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="h-12 rounded-2xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black">
              Apply
            </button>
            <Link
              href="/home/jobs"
              className="flex h-12 items-center justify-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/45 hover:border-orange-300"
            >
              Clear
            </Link>
          </form>
        </section>

        <section className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
              Job register
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-black">
              {filteredJobs.length} {filteredJobs.length === 1 ? "job" : "jobs"}
            </h2>
          </div>
        </section>

        {filteredJobs.length === 0 ? (
          <section className="rounded-[2rem] border border-dashed border-black/15 bg-white p-14 text-center">
            <h3 className="text-xl font-semibold text-black">
              {allJobs.length === 0 ? "No jobs booked yet" : "No jobs match this filter"}
            </h3>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-black/45">
              {allJobs.length === 0
                ? "Book the first job and Waste X will create the planned load records underneath it."
                : "Clear or adjust the filters to see more jobs."}
            </p>
            <Link
              href="/home/jobs/new"
              className="mt-6 inline-flex rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-black"
            >
              + Book a Job
            </Link>
          </section>
        ) : (
          <section className="space-y-4">
            {filteredJobs.map((job) => {
              const completedLoads = job.loads.filter((load) => load.status === "completed").length;
              const destination =
                job.direction === "outgoing" && job.thirdPartyDestinationSite
                  ? job.thirdPartyDestinationSite
                  : job.ownSite;

              return (
                <article
                  key={job.id}
                  className="overflow-hidden rounded-[2rem] border border-black/10 bg-white shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-5 p-6 lg:flex-row lg:items-start">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(job.status)}`}>
                          {pretty(job.status)}
                        </span>
                        <span className="rounded-full border border-black/10 bg-[#faf8f4] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
                          {pretty(job.source)}
                        </span>
                        {job.sourceTemplate?.name && (
                          <span className="text-[10px] font-medium text-black/35">
                            {job.sourceTemplate.name}
                          </span>
                        )}
                      </div>

                      <Link href={`/home/jobs/${job.id}`} className="group mt-4 block">
                        <h3 className="text-xl font-semibold text-black transition group-hover:text-orange-700">
                          {job.jobNumber}
                        </h3>
                        <p className="mt-1 text-sm font-medium text-black/65">
                          {job.client?.name ?? "No client"}
                        </p>
                        <p className="mt-1 text-xs text-black/40">
                          {formatDate(job.jobDate)} · {job.clientSite?.name ?? "No origin"}
                        </p>
                      </Link>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/home/jobs/new?repeat=${job.id}`}
                        className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-black hover:bg-orange-400"
                      >
                        Repeat
                      </Link>
                      <Link
                        href={`/home/jobs/new?duplicate=${job.id}`}
                        className="rounded-xl border border-black/10 px-3 py-2 text-xs font-semibold text-black/50 hover:border-orange-300"
                      >
                        Duplicate
                      </Link>
                      <Link
                        href={`/home/jobs/${job.id}`}
                        className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black"
                      >
                        Open
                      </Link>
                    </div>
                  </div>

                  <div className="grid border-t border-black/5 md:grid-cols-2 xl:grid-cols-5">
                    <Cell
                      label="Material"
                      value={job.materialProfile?.name ?? "Not assigned"}
                      sub={job.materialProfile?.ewcCode?.code ? `EWC ${job.materialProfile.ewcCode.code}` : "—"}
                    />
                    <Cell
                      label="Transport"
                      value={job.haulier?.name ?? "Own transport"}
                      sub={job.vehicle?.registrationNumber ?? job.driver?.name ?? "Assign later"}
                    />
                    <Cell
                      label="Destination"
                      value={destination?.name ?? "Not assigned"}
                      sub={destination?.postcode ?? "—"}
                    />
                    <Cell
                      label="PO / Reference"
                      value={job.purchaseOrder ?? job.customerReference ?? "—"}
                      sub={job.purchaseOrder && job.customerReference ? job.customerReference : ""}
                    />
                    <Cell
                      label="Loads"
                      value={`${completedLoads}/${job.loads.length} completed`}
                      sub={`${job.plannedLoads} planned`}
                    />
                  </div>
                </article>
              );
            })}
          </section>
        )}
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  sub,
  highlight = false,
}: {
  label: string;
  value: number;
  sub: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-[1.5rem] border p-5 shadow-sm ${highlight ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"}`}>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${highlight ? "text-orange-700" : "text-black/35"}`}>
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
      <p className="mt-1 text-xs text-black/40">{sub}</p>
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-h-24 border-t border-black/5 px-5 py-4 md:border-l xl:border-t-0">
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>
      <p className="mt-2 truncate text-sm font-semibold text-black">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-black/35">{sub}</p>}
    </div>
  );
}
