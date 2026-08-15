import Link from "next/link";
import { redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoads, users } from "@/db/schema";

type SearchParams = {
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
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (status === "cancelled") return "border-black/10 bg-black/5 text-black/35";
  return "border-blue-200 bg-blue-50 text-blue-700";
}

export default async function OutgoingMovementsPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.isActive || currentUser.isSuspended) {
    redirect("/home");
  }

  const allLoads = await database.query.jobLoads.findMany({
    where: and(
      eq(jobLoads.organisationId, currentUser.organisationId),
      eq(jobLoads.direction, "outgoing"),
    ),
    with: {
      job: true,
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
    orderBy: [desc(jobLoads.movementAt), desc(jobLoads.createdAt)],
  });

  const query = firstParam(searchParams?.q).trim().toLowerCase();
  const status = firstParam(searchParams?.status);
  const selectedDate = firstParam(searchParams?.date);

  const filtered = allLoads.filter((load) => {
    if (status && status !== "all" && load.status !== status) return false;
    if (selectedDate && load.job?.jobDate && dateInput(load.job.jobDate) !== selectedDate) return false;
    if (!query) return true;

    return [
      load.job?.jobNumber,
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

  const planned = allLoads.filter((load) => load.status === "planned").length;
  const completed = allLoads.filter((load) => load.status === "completed").length;
  const today = dateInput(new Date());
  const movingToday = allLoads.filter(
    (load) => load.job?.jobDate && dateInput(load.job.jobDate) === today && load.status !== "cancelled",
  ).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <div className="mx-auto max-w-[1550px] space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-blue-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-6 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Operations // Outgoing
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">Outgoing waste</h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Waste leaving your site for an external facility. The selected material must be
                compatible with that facility's active configured authorisation before completion.
              </p>
            </div>
            <div className="flex gap-2">
              <Link href="/home/worksheet" className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-semibold text-white/70">
                Daily Worksheet
              </Link>
              <Link href="/home/movements/outgoing/new" className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black">
                + Book outgoing
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Metric label="Moving today" value={movingToday} />
          <Metric label="Planned" value={planned} />
          <Metric label="Completed" value={completed} highlighted />
        </section>

        <section className="rounded-[26px] border border-black/10 bg-white p-5 shadow-sm">
          <form method="get" className="grid gap-3 xl:grid-cols-[1fr_190px_190px_auto_auto]">
            <input
              name="q"
              defaultValue={firstParam(searchParams?.q)}
              placeholder="Search facility, job, EWC, vehicle or ticket..."
              className="h-12 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
            />
            <input type="date" name="date" defaultValue={selectedDate} className="h-12 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400" />
            <select name="status" defaultValue={status || "all"} className="h-12 rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400">
              <option value="all">All statuses</option>
              <option value="planned">Planned</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="h-12 rounded-2xl bg-black px-5 text-sm font-semibold text-white">Apply</button>
            <Link href="/home/movements/outgoing" className="flex h-12 items-center justify-center rounded-2xl border border-black/10 px-5 text-sm font-semibold text-black/45">Clear</Link>
          </form>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <div className="border-b border-black/5 px-6 py-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">Movement register</p>
            <h2 className="mt-1 text-xl font-semibold text-black">{filtered.length} outgoing load{filtered.length === 1 ? "" : "s"}</h2>
          </div>

          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-sm text-black/40">No outgoing loads match these filters.</p>
              <Link href="/home/movements/outgoing/new" className="mt-5 inline-flex rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black">Book outgoing movement</Link>
            </div>
          ) : (
            <div className="divide-y divide-black/5">
              {filtered.map((load) => (
                <div key={load.id} className="grid gap-4 px-6 py-5 xl:grid-cols-[170px_1.3fr_1.2fr_1fr_1fr_130px_130px] xl:items-center">
                  <div>
                    <Link href={load.job ? `/home/jobs/${load.job.id}` : "/home/jobs"} className="text-sm font-semibold text-black hover:text-orange-700">
                      {load.job?.jobNumber ?? `Load ${load.loadNumber}`}
                    </Link>
                    <p className="mt-1 text-xs text-black/35">Load {load.loadNumber} · {formatDate(load.job?.jobDate)}</p>
                  </div>
                  <Cell label="Destination" value={load.thirdPartyDestinationSite?.name ?? "—"} sub={load.thirdPartyDestinationSite?.counterparty?.name ?? "External operator"} />
                  <Cell label="Waste" value={load.ewcCodeSnapshot ?? "No EWC"} sub={load.wasteDescriptionSnapshot ?? "No description"} />
                  <Cell label="Transport" value={load.haulier?.name ?? "Own transport"} sub={load.vehicle?.registrationNumber ?? load.driver?.name ?? "Not assigned"} />
                  <Cell label="Moved" value={formatTime(load.movementAt)} sub={formatDate(load.movementAt)} />
                  <Cell label="Weight" value={load.netWeight ?? "—"} sub={load.netWeight ? load.weightMetric : "Not recorded"} />
                  <div className="flex xl:justify-end">
                    <span className={`rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClass(load.status)}`}>
                      {formatStatus(load.status)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({ label, value, highlighted = false }: { label: string; value: number; highlighted?: boolean }) {
  return (
    <div className={`rounded-[24px] border p-5 shadow-sm ${highlighted ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white"}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">{label}</p>
      <p className="mt-3 text-3xl font-semibold text-black">{value}</p>
    </div>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/30">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-black/70">{value}</p>
      {sub && <p className="mt-1 truncate text-xs text-black/35">{sub}</p>}
    </div>
  );
}
