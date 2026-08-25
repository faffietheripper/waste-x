import Link from "next/link";
import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoads, users } from "@/db/schema";

export const dynamic = "force-dynamic";

type SearchParams = {
  direction?: string | string[];
  q?: string | string[];
  status?: string | string[];
  date?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function dateInput(value: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function formatDate(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatTime(value: Date | null | undefined) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClass(status: string) {
  if (status === "completed") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (status === "rejected") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (status === "accepted") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  if (status === "arrived") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (status === "cancelled") {
    return "border-black/10 bg-black/5 text-black/35";
  }
  return "border-black/10 bg-black/5 text-black/50";
}

function tabHref(direction: "incoming" | "outgoing") {
  return `/home/movements?direction=${direction}`;
}

export default async function MovementsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home");
  }

  const allLoads = await database.query.jobLoads.findMany({
    where: eq(jobLoads.organisationId, currentUser.organisationId),
    with: {
      job: true,
      client: true,
      clientSite: true,
      ownSite: true,
      thirdPartyDestinationSite: {
        with: {
          counterparty: true,
        },
      },
      haulier: true,
      driver: true,
      vehicle: true,
    },
    orderBy: [desc(jobLoads.createdAt)],
  });

  const direction =
    firstParam(searchParams?.direction) === "outgoing"
      ? "outgoing"
      : "incoming";

  const query = firstParam(searchParams?.q).trim().toLowerCase();
  const status = firstParam(searchParams?.status);
  const selectedDate = firstParam(searchParams?.date);

  const directionalLoads = allLoads.filter((load) => load.direction === direction);

  const filtered = directionalLoads.filter((load) => {
    if (status && status !== "all" && load.status !== status) {
      return false;
    }

    if (
      selectedDate &&
      load.job?.jobDate &&
      dateInput(load.job.jobDate) !== selectedDate
    ) {
      return false;
    }

    if (!query) {
      return true;
    }

    return [
      load.job?.jobNumber,
      load.client?.name,
      load.clientSite?.name,
      load.thirdPartyDestinationSite?.name,
      load.thirdPartyDestinationSite?.counterparty?.name,
      load.haulier?.name,
      load.driver?.name,
      load.vehicle?.registrationNumber,
      load.ewcCodeSnapshot,
      load.wasteDescriptionSnapshot,
      load.ticketNumber,
    ].some((value) => value?.toLowerCase().includes(query));
  });

  const incomingCount = allLoads.filter((load) => load.direction === "incoming").length;
  const outgoingCount = allLoads.filter((load) => load.direction === "outgoing").length;

  const completed = directionalLoads.filter((load) => load.status === "completed").length;

  const live = directionalLoads.filter(
    (load) =>
      load.status !== "completed" &&
      load.status !== "rejected" &&
      load.status !== "cancelled",
  ).length;

  const exceptions = directionalLoads.filter(
    (load) => load.status === "rejected" || load.status === "cancelled",
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <div className="mx-auto max-w-[1700px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-black px-7 py-6 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-orange-400">
                Operations
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                Movements
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-white/45">
                One movement register with Incoming and Outgoing side by side
                instead of separate navigation pages.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/home/worksheet"
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/70 hover:border-orange-400 hover:text-orange-400"
              >
                Daily Operations
              </Link>

              {direction === "incoming" ? (
                <Link
                  href="/home/jobs/new"
                  className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black"
                >
                  + Incoming job
                </Link>
              ) : (
                <Link
                  href="/home/movements/outgoing/new"
                  className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black"
                >
                  + Outgoing
                </Link>
              )}
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-black/10 bg-white p-3 shadow-sm">
          <div className="grid grid-cols-2 gap-2 rounded-[18px] bg-black/[0.035] p-1.5">
            <Link
              href={tabHref("incoming")}
              className={`flex items-center justify-between rounded-[14px] px-5 py-3 transition ${
                direction === "incoming"
                  ? "bg-black text-white shadow-sm"
                  : "text-black/45 hover:bg-white hover:text-black"
              }`}
            >
              <div>
                <p className="text-sm font-semibold">Incoming</p>
                <p
                  className={`mt-0.5 text-[10px] ${
                    direction === "incoming" ? "text-white/40" : "text-black/30"
                  }`}
                >
                  Waste received
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  direction === "incoming"
                    ? "bg-orange-500 text-black"
                    : "bg-black/5 text-black/40"
                }`}
              >
                {incomingCount}
              </span>
            </Link>

            <Link
              href={tabHref("outgoing")}
              className={`flex items-center justify-between rounded-[14px] px-5 py-3 transition ${
                direction === "outgoing"
                  ? "bg-black text-white shadow-sm"
                  : "text-black/45 hover:bg-white hover:text-black"
              }`}
            >
              <div>
                <p className="text-sm font-semibold">Outgoing</p>
                <p
                  className={`mt-0.5 text-[10px] ${
                    direction === "outgoing" ? "text-white/40" : "text-black/30"
                  }`}
                >
                  Waste leaving site
                </p>
              </div>

              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                  direction === "outgoing"
                    ? "bg-orange-500 text-black"
                    : "bg-black/5 text-black/40"
                }`}
              >
                {outgoingCount}
              </span>
            </Link>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          <Metric label="Live" value={live} highlight />
          <Metric label="Completed" value={completed} />
          <Metric label="Exceptions" value={exceptions} />
        </section>

        <section className="rounded-[22px] border border-black/10 bg-white p-4 shadow-sm">
          <form
            method="get"
            className="grid gap-2 xl:grid-cols-[1fr_170px_180px_auto_auto]"
          >
            <input type="hidden" name="direction" value={direction} />

            <input
              name="q"
              defaultValue={firstParam(searchParams?.q)}
              placeholder="Search job, customer, site, EWC, vehicle, ticket..."
              className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm outline-none focus:border-orange-400"
            />

            <input
              type="date"
              name="date"
              defaultValue={selectedDate}
              className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm outline-none focus:border-orange-400"
            />

            <select
              name="status"
              defaultValue={status || "all"}
              className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm outline-none focus:border-orange-400"
            >
              <option value="all">All statuses</option>
              <option value="planned">Planned</option>
              <option value="arrived">Arrived</option>
              <option value="accepted">Accepted</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="cancelled">Cancelled</option>
            </select>

            <button className="h-10 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
              Apply
            </button>

            <Link
              href={tabHref(direction)}
              className="flex h-10 items-center justify-center rounded-xl border border-black/10 px-4 text-xs font-semibold text-black/40 hover:border-orange-300"
            >
              Clear
            </Link>
          </form>
        </section>

        <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                {direction} register
              </p>

              <h2 className="mt-1 text-lg font-semibold text-black">
                {filtered.length} load{filtered.length === 1 ? "" : "s"}
              </h2>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-black/40">
              No {direction} loads match these filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1350px] border-collapse text-left">
                <thead className="bg-[#fbfaf7]">
                  <tr className="border-b border-black/5">
                    <Th>Date</Th>
                    <Th>Job / load</Th>
                    <Th>{direction === "incoming" ? "Customer / origin" : "Destination"}</Th>
                    <Th>Waste</Th>
                    <Th>Transport</Th>
                    <Th>{direction === "incoming" ? "Received" : "Moved"}</Th>
                    <Th>Weight</Th>
                    <Th>Status</Th>
                    <Th alignRight>Action</Th>
                  </tr>
                </thead>

                <tbody>
                  {filtered.map((load) => {
                    const eventTime =
                      direction === "incoming" ? load.receivedAt : load.movementAt;

                    const operationDate = load.job?.jobDate
                      ? dateInput(load.job.jobDate)
                      : "";

                    return (
                      <tr
                        key={load.id}
                        className="border-b border-black/5 align-middle last:border-b-0 hover:bg-orange-50/25"
                      >
                        <Td>
                          <p className="whitespace-nowrap text-sm font-semibold text-black/65">
                            {formatDate(load.job?.jobDate)}
                          </p>
                        </Td>

                        <Td>
                          <Link
                            href={load.job ? `/home/jobs/${load.job.id}` : "/home/jobs"}
                            className="text-sm font-semibold text-black hover:text-orange-700"
                          >
                            {load.job?.jobNumber ?? `Load ${load.loadNumber}`}
                          </Link>

                          <p className="mt-1 text-xs text-black/35">
                            Load {load.loadNumber}
                            {load.ticketNumber ? ` · ${load.ticketNumber}` : ""}
                          </p>
                        </Td>

                        <Td>
                          {direction === "incoming" ? (
                            <>
                              <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">
                                {load.client?.name ?? "—"}
                              </p>
                              <p className="mt-1 max-w-[220px] truncate text-xs text-black/35">
                                {load.clientSite?.name ?? "Origin not assigned"}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">
                                {load.thirdPartyDestinationSite?.name ?? "—"}
                              </p>
                              <p className="mt-1 max-w-[220px] truncate text-xs text-black/35">
                                {load.thirdPartyDestinationSite?.counterparty?.name ??
                                  "External operator"}
                              </p>
                            </>
                          )}
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black/65">
                            {load.ewcCodeSnapshot ?? "No EWC"}
                          </p>
                          <p
                            title={load.wasteDescriptionSnapshot ?? "No description"}
                            className="mt-1 max-w-[240px] truncate text-xs text-black/35"
                          >
                            {load.wasteDescriptionSnapshot ?? "No description"}
                          </p>
                        </Td>

                        <Td>
                          <p className="max-w-[180px] truncate text-sm font-semibold text-black/65">
                            {load.haulier?.name ?? "Own transport"}
                          </p>
                          <p className="mt-1 max-w-[180px] truncate text-xs text-black/35">
                            {load.vehicle?.registrationNumber ??
                              load.driver?.name ??
                              "Not assigned"}
                          </p>
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black/65">
                            {formatTime(eventTime)}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            {formatDate(eventTime)}
                          </p>
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black/65">
                            {load.netWeight ?? "—"}
                          </p>
                          <p className="mt-1 text-xs text-black/35">
                            {load.netWeight ? load.weightMetric : "Not recorded"}
                          </p>
                        </Td>

                        <Td>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(
                              load.status,
                            )}`}
                          >
                            {formatStatus(load.status)}
                          </span>
                        </Td>

                        <Td>
                          <div className="flex justify-end gap-1.5">
                            {operationDate &&
                              load.status !== "completed" &&
                              load.status !== "rejected" &&
                              load.status !== "cancelled" && (
                                <Link
                                  href={`/home/worksheet?date=${operationDate}`}
                                  className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-bold text-black hover:bg-orange-400"
                                >
                                  Operate
                                </Link>
                              )}

                            <Link
                              href={load.job ? `/home/jobs/${load.job.id}` : "/home/jobs"}
                              className="rounded-lg bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black"
                            >
                              Open
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
        highlight ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"
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
