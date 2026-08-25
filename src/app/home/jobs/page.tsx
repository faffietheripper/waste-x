import Link from "next/link";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobs, users } from "@/db/schema";

export const dynamic = "force-dynamic";

type SearchParams = {
  q?: string | string[];
  status?: string | string[];
  view?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function londonDateKey(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function pretty(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(status: string) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (status === "in_progress") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  if (status === "cancelled") {
    return "border-red-200 bg-red-50 text-red-700";
  }

  if (status === "draft") {
    return "border-black/10 bg-black/5 text-black/50";
  }

  return "border-blue-200 bg-blue-50 text-blue-700";
}

function viewHref(view: string) {
  return view === "all" ? "/home/jobs" : `/home/jobs?view=${view}`;
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

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
      client: {
        columns: {
          name: true,
        },
      },
      clientSite: {
        columns: {
          name: true,
          postcode: true,
        },
      },
      ownSite: {
        columns: {
          name: true,
          postcode: true,
        },
      },
      thirdPartyDestinationSite: {
        columns: {
          name: true,
          postcode: true,
        },
      },
      haulier: {
        columns: {
          name: true,
        },
      },
      driver: {
        columns: {
          name: true,
        },
      },
      vehicle: {
        columns: {
          registrationNumber: true,
        },
      },
      materialProfile: {
        columns: {
          name: true,
        },
        with: {
          ewcCode: {
            columns: {
              code: true,
            },
          },
        },
      },
      sourceTemplate: {
        columns: {
          name: true,
        },
      },
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
  const requestedStatus = first(searchParams?.status);
  const requestedView = first(searchParams?.view);

  const validStatus = [
    "draft",
    "booked",
    "in_progress",
    "completed",
    "cancelled",
  ].includes(requestedStatus)
    ? requestedStatus
    : "all";

  const validView = ["today", "upcoming", "completed"].includes(requestedView)
    ? requestedView
    : "all";

  const today = londonDateKey(new Date());

  const filteredJobs = allJobs.filter((job) => {
    if (validStatus !== "all" && job.status !== validStatus) {
      return false;
    }

    if (validView === "today" && londonDateKey(job.jobDate) !== today) {
      return false;
    }

    if (
      validView === "upcoming" &&
      (londonDateKey(job.jobDate) < today ||
        job.status === "completed" ||
        job.status === "cancelled")
    ) {
      return false;
    }

    if (validView === "completed" && job.status !== "completed") {
      return false;
    }

    if (!q) {
      return true;
    }

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

  const count = (target: string) =>
    allJobs.filter((job) => job.status === target).length;

  const liveLoads = allJobs.reduce(
    (sum, job) =>
      sum +
      job.loads.filter(
        (load) =>
          load.status !== "completed" &&
          load.status !== "cancelled" &&
          load.status !== "rejected",
      ).length,
    0,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <div className="mx-auto max-w-[1650px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-black px-7 py-6 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-orange-400">
                Operations
              </p>

              <div className="mt-2 flex flex-wrap items-baseline gap-3">
                <h1 className="text-3xl font-semibold tracking-tight">
                  Jobs
                </h1>

                <span className="text-sm text-white/40">
                  {allJobs.length} total
                </span>
              </div>

              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Dense operational register. Search, repeat and open work without
                scrolling through large job cards.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/home/jobs/templates"
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/70 transition hover:border-orange-400 hover:text-orange-400"
              >
                Templates
              </Link>

              <Link
                href="/home/jobs/new"
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-black transition hover:bg-orange-400"
              >
                + Book Job
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Booked" value={count("booked")} />
          <Metric label="In progress" value={count("in_progress")} highlight />
          <Metric label="Completed" value={count("completed")} />
          <Metric label="Live loads" value={liveLoads} />
        </section>

        <section className="rounded-[24px] border border-black/10 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {[
                ["all", "All"],
                ["today", "Today"],
                ["upcoming", "Upcoming"],
                ["completed", "Completed"],
              ].map(([value, label]) => (
                <Link
                  key={value}
                  href={viewHref(value)}
                  className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition ${
                    validView === value
                      ? "bg-black text-white"
                      : "border border-black/10 bg-[#fbfaf7] text-black/50 hover:border-orange-300 hover:text-black"
                  }`}
                >
                  {label}
                </Link>
              ))}
            </div>

            <form
              method="get"
              className="grid flex-1 gap-2 md:grid-cols-[1fr_180px_auto_auto] xl:max-w-4xl"
            >
              {validView !== "all" && (
                <input type="hidden" name="view" value={validView} />
              )}

              <input
                name="q"
                defaultValue={first(searchParams?.q)}
                placeholder="Search job, client, site, material, EWC, vehicle..."
                className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm outline-none focus:border-orange-400"
              />

              <select
                name="status"
                defaultValue={validStatus}
                className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm outline-none focus:border-orange-400"
              >
                <option value="all">All statuses</option>
                <option value="draft">Draft</option>
                <option value="booked">Booked</option>
                <option value="in_progress">In progress</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <button className="h-10 rounded-xl bg-black px-4 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black">
                Apply
              </button>

              <Link
                href={viewHref(validView)}
                className="flex h-10 items-center justify-center rounded-xl border border-black/10 px-4 text-xs font-semibold text-black/40 hover:border-orange-300"
              >
                Clear
              </Link>
            </form>
          </div>
        </section>

        <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Job register
              </p>

              <h2 className="mt-1 text-lg font-semibold text-black">
                {filteredJobs.length} {filteredJobs.length === 1 ? "job" : "jobs"}
              </h2>
            </div>

            <p className="hidden text-xs text-black/35 lg:block">
              Repeat is the fastest way to reuse regular work.
            </p>
          </div>

          {filteredJobs.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm font-semibold text-black">
                No jobs match this view.
              </p>

              <Link
                href="/home/jobs/new"
                className="mt-5 inline-flex rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-black"
              >
                + Book Job
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] border-collapse text-left">
                <thead className="bg-[#fbfaf7]">
                  <tr className="border-b border-black/5">
                    <Th>Date</Th>
                    <Th>Job</Th>
                    <Th>Customer / site</Th>
                    <Th>Material</Th>
                    <Th>Transport</Th>
                    <Th>Loads</Th>
                    <Th>Status</Th>
                    <Th alignRight>Actions</Th>
                  </tr>
                </thead>

                <tbody>
                  {filteredJobs.map((job) => {
                    const completedLoads = job.loads.filter(
                      (load) => load.status === "completed",
                    ).length;

                    const destination =
                      job.direction === "outgoing" &&
                      job.thirdPartyDestinationSite
                        ? job.thirdPartyDestinationSite
                        : job.ownSite;

                    return (
                      <tr
                        key={job.id}
                        className="border-b border-black/5 align-middle transition last:border-b-0 hover:bg-orange-50/35"
                      >
                        <Td>
                          <p className="whitespace-nowrap text-sm font-semibold text-black/70">
                            {formatDate(job.jobDate)}
                          </p>
                        </Td>

                        <Td>
                          <Link
                            href={`/home/jobs/${job.id}`}
                            className="font-semibold text-black hover:text-orange-700"
                          >
                            {job.jobNumber}
                          </Link>

                          <div className="mt-1 flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                              {job.direction}
                            </span>

                            <span className="text-black/15">·</span>

                            <span className="text-[10px] uppercase tracking-[0.1em] text-black/30">
                              {pretty(job.source)}
                            </span>
                          </div>
                        </Td>

                        <Td>
                          <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">
                            {job.client?.name ??
                              (job.direction === "outgoing"
                                ? destination?.name ?? "Outgoing movement"
                                : "No client")}
                          </p>

                          <p className="mt-1 max-w-[220px] truncate text-xs text-black/35">
                            {job.clientSite?.name ??
                              destination?.name ??
                              "Site not assigned"}
                          </p>
                        </Td>

                        <Td>
                          <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">
                            {job.materialProfile?.name ?? "Not assigned"}
                          </p>

                          <p className="mt-1 text-xs text-black/35">
                            {job.materialProfile?.ewcCode?.code
                              ? `EWC ${job.materialProfile.ewcCode.code}`
                              : "No EWC"}
                          </p>
                        </Td>

                        <Td>
                          <p className="max-w-[180px] truncate text-sm font-semibold text-black/70">
                            {job.haulier?.name ?? "Own transport"}
                          </p>

                          <p className="mt-1 text-xs text-black/35">
                            {job.vehicle?.registrationNumber ??
                              job.driver?.name ??
                              "Assign later"}
                          </p>
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black">
                            {completedLoads}/{job.loads.length}
                          </p>

                          <p className="mt-1 text-xs text-black/35">
                            {job.plannedLoads} planned
                          </p>
                        </Td>

                        <Td>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(
                              job.status,
                            )}`}
                          >
                            {pretty(job.status)}
                          </span>
                        </Td>

                        <Td>
                          <div className="flex justify-end gap-1.5">
                            <Link
                              href={`/home/jobs/new?repeat=${job.id}`}
                              className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-black transition hover:bg-orange-400"
                            >
                              Repeat
                            </Link>

                            <Link
                              href={`/home/jobs/${job.id}`}
                              className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                            >
                              Open
                            </Link>

                            <Link
                              href={`/home/jobs/new?duplicate=${job.id}`}
                              className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/45 transition hover:border-orange-300 hover:text-black"
                            >
                              Copy
                            </Link>
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
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
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border px-4 py-3.5 shadow-sm ${
        highlight
          ? "border-orange-200 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>

      <p className="mt-1.5 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function Th({
  children,
  alignRight = false,
}: {
  children: React.ReactNode;
  alignRight?: boolean;
}) {
  return (
    <th
      className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35 ${
        alignRight ? "text-right" : ""
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}
