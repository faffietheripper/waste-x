import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { drivers, jobs, users, vehicles } from "@/db/schema";

import {
  acceptLoadAction,
  addExtraLoadAction,
  cancelPlannedLoadAction,
  completeIncomingLoadAction,
  completeOutgoingLoadAction,
  markLoadArrivedAction,
  rejectLoadAction,
  saveLoadDetailsAction,
} from "./actions";

type SearchParams = {
  date?: string | string[];
  success?: string | string[];
  error?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function londonDateInput(value = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime());
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDay(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${value}T12:00:00Z`));
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
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusClasses(status: string) {
  switch (status) {
    case "planned":
      return "border-black/10 bg-black/5 text-black/50";
    case "arrived":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "accepted":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "rejected":
      return "border-red-200 bg-red-50 text-red-700";
    case "cancelled":
      return "border-black/10 bg-black/5 text-black/35";
    default:
      return "border-black/10 bg-black/5 text-black/50";
  }
}

const successMessages: Record<string, string> = {
  load_arrived: "Load marked as arrived.",
  load_details_saved: "Load details saved.",
  load_accepted: "Load accepted against the receiving permit.",
  load_rejected: "Load rejected and retained in the operational record.",
  load_completed: "Incoming load completed.",
  outgoing_load_completed: "Outgoing movement completed.",
  load_cancelled: "Planned load cancelled.",
  extra_load_added: "Extra planned load added to the job.",
};

const errorMessages: Record<string, string> = {
  unauthorised: "You do not have access to operate the worksheet.",
  load_required: "A load was not supplied.",
  load_not_found: "That load could not be found in your organisation.",
  incoming_only_action: "That action is only available for incoming loads.",
  outgoing_only_action: "That action is only available for outgoing loads.",
  load_not_planned: "Only a planned incoming load can be marked as arrived.",
  load_must_be_arrived: "The load must be marked as arrived first.",
  load_must_be_accepted: "The load must be accepted before it can be completed.",
  load_is_terminal: "That load is already finished and cannot be edited.",
  waste_description_required: "Confirm the actual waste description before continuing.",
  invalid_weight_metric: "Choose a valid weight unit.",
  invalid_gross_weight: "Gross weight must be zero or greater.",
  invalid_tare_weight: "Tare weight must be zero or greater.",
  invalid_net_weight: "Net weight must be zero or greater.",
  gross_below_tare: "Gross weight cannot be lower than tare weight.",
  net_weight_required: "A positive net weight is required before completion.",
  received_time_missing: "The incoming load does not have an arrival time.",
  permit_mismatch: "This EWC is not currently allowed by the selected receiving permit.",
  external_facility_permit_mismatch:
    "The selected third-party facility does not have an active authorisation for this EWC.",
  rejection_reason_required: "Enter a reason before rejecting the load.",
  invalid_driver: "The selected driver is not available.",
  invalid_vehicle: "The selected vehicle is not available.",
  driver_not_for_haulier: "That driver belongs to a different haulier.",
  vehicle_not_for_haulier: "That vehicle belongs to a different haulier.",
  driver_not_for_own_transport: "Choose one of your own drivers for own transport.",
  vehicle_not_for_own_transport: "Choose one of your own vehicles for own transport.",
  only_planned_loads_can_cancel: "Only planned loads can be cancelled from the worksheet.",
  job_required: "A job was not supplied.",
  job_not_available: "That job is not available.",
  job_not_operational: "That job is cancelled or not operational.",
  source_load_missing: "Waste X could not find a source load to copy.",
};

export default async function DailyWorksheetPage({
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
      role: true,
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

  const requestedDate = firstParam(searchParams?.date);
  const selectedDate = validDate(requestedDate)
    ? requestedDate
    : londonDateInput();

  const dayStart = new Date(`${selectedDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${shiftDate(selectedDate, 1)}T00:00:00.000Z`);

  const [dayJobs, activeDrivers, activeVehicles] = await Promise.all([
    database.query.jobs.findMany({
      where: and(
        eq(jobs.organisationId, currentUser.organisationId),
        gte(jobs.jobDate, dayStart),
        lt(jobs.jobDate, dayEnd),
        ne(jobs.status, "draft"),
        ne(jobs.status, "cancelled"),
      ),
      with: {
        client: true,
        clientSite: true,
        ownSite: true,
        thirdPartyDestinationSite: {
          with: {
            counterparty: true,
          },
        },
        haulier: true,
        materialProfile: {
          with: {
            ewcCode: true,
          },
        },
        loads: {
          with: {
            driver: true,
            vehicle: true,
            haulier: true,
            ownSite: true,
            thirdPartyDestinationSite: {
              with: {
                counterparty: true,
              },
            },
          },
          orderBy: (load, { asc: sortAsc }) => [sortAsc(load.loadNumber)],
        },
      },
      orderBy: (job, { asc: sortAsc }) => [sortAsc(job.createdAt)],
    }),
    database
      .select({
        id: drivers.id,
        name: drivers.name,
        haulierCounterpartyId: drivers.haulierCounterpartyId,
      })
      .from(drivers)
      .where(
        and(
          eq(drivers.organisationId, currentUser.organisationId),
          eq(drivers.isActive, true),
        ),
      )
      .orderBy(asc(drivers.name)),
    database
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        haulierCounterpartyId: vehicles.haulierCounterpartyId,
      })
      .from(vehicles)
      .where(
        and(
          eq(vehicles.organisationId, currentUser.organisationId),
          eq(vehicles.isActive, true),
        ),
      )
      .orderBy(asc(vehicles.registrationNumber)),
  ]);

  const loads = dayJobs.flatMap((job) => job.loads);
  const incomingLoads = loads.filter((load) => load.direction === "incoming");
  const outgoingLoads = loads.filter((load) => load.direction === "outgoing");
  const completedLoads = loads.filter((load) => load.status === "completed");
  const problemLoads = loads.filter(
    (load) => load.status === "rejected" || load.status === "cancelled",
  );

  const success = firstParam(searchParams?.success);
  const error = firstParam(searchParams?.error);
  const isToday = selectedDate === londonDateInput();

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-24 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Operations // Daily Worksheet
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                {formatDay(selectedDate)}
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Today's booked Jobs are already here. Operate the existing Load records —
                arrival, actual transport, weights, acceptance or rejection and completion —
                without entering the job again.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/home/worksheet?date=${shiftDate(selectedDate, -1)}`}
                className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-orange-400 hover:text-orange-400"
              >
                ← Previous day
              </Link>

              {!isToday && (
                <Link
                  href="/home/worksheet"
                  className="rounded-2xl border border-orange-400/30 bg-orange-400/10 px-4 py-3 text-sm font-semibold text-orange-400"
                >
                  Today
                </Link>
              )}

              <Link
                href={`/home/worksheet?date=${shiftDate(selectedDate, 1)}`}
                className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-semibold text-white/70 transition hover:border-orange-400 hover:text-orange-400"
              >
                Next day →
              </Link>
            </div>
          </div>
        </section>

        {(success || error) && (
          <div
            className={`rounded-2xl border px-5 py-4 text-sm font-medium ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error
              ? errorMessages[error] ?? `Operation failed: ${error}`
              : successMessages[success] ?? "Worksheet updated."}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Jobs" value={dayJobs.length} detail="Booked for this date" />
          <MetricCard label="Incoming" value={incomingLoads.length} detail="Loads into your site" />
          <MetricCard label="Outgoing" value={outgoingLoads.length} detail="Loads leaving your site" />
          <MetricCard label="Completed" value={completedLoads.length} detail={`of ${loads.length} loads`} highlighted />
          <MetricCard label="Exceptions" value={problemLoads.length} detail="Rejected / cancelled" />
        </section>

        {dayJobs.length === 0 ? (
          <section className="rounded-[30px] border border-dashed border-black/15 bg-white p-12 text-center shadow-sm">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-orange-50 text-2xl">
              📋
            </div>
            <h2 className="mt-5 text-2xl font-semibold text-black">
              Nothing booked for this date
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-black/45">
              Incoming jobs booked for this date will appear automatically. Outgoing work can
              be booked from the Outgoing register and will use the same worksheet.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link
                href="/home/jobs/new"
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                + Book incoming job
              </Link>
              <Link
                href="/home/movements/outgoing/new"
                className="rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:text-orange-400"
              >
                + Book outgoing movement
              </Link>
            </div>
          </section>
        ) : (
          <section className="space-y-5">
            {dayJobs.map((job) => (
              <article
                key={job.id}
                className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm"
              >
                <div className="flex flex-col gap-5 border-b border-black/5 p-6 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                          job.direction === "incoming"
                            ? "border-orange-200 bg-orange-50 text-orange-700"
                            : "border-blue-200 bg-blue-50 text-blue-700"
                        }`}
                      >
                        {job.direction}
                      </span>
                      <span className="rounded-full border border-black/10 bg-black/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-black/50">
                        {formatStatus(job.status)}
                      </span>
                    </div>

                    <div className="mt-3 flex flex-wrap items-baseline gap-3">
                      <Link
                        href={`/home/jobs/${job.id}`}
                        className="text-xl font-semibold text-black transition hover:text-orange-700"
                      >
                        {job.jobNumber}
                      </Link>
                      <span className="text-sm font-medium text-black/55">
                        {job.direction === "incoming"
                          ? job.client?.name ?? "Client not assigned"
                          : job.thirdPartyDestinationSite?.name ?? "External destination"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-black/40">
                      {job.direction === "incoming"
                        ? `${job.clientSite?.name ?? "Origin not assigned"} → ${job.ownSite?.name ?? "Receiving site"}`
                        : `${job.ownSite?.name ?? "Your site"} → ${job.thirdPartyDestinationSite?.name ?? "Third-party facility"}`}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-right">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/30">
                        Loads
                      </p>
                      <p className="mt-1 text-lg font-semibold text-black">
                        {job.loads.length}
                      </p>
                    </div>

                    <form action={addExtraLoadAction}>
                      <input type="hidden" name="jobId" value={job.id} />
                      <input type="hidden" name="returnDate" value={selectedDate} />
                      <button
                        type="submit"
                        className="rounded-2xl border border-black/10 bg-white px-4 py-3 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                      >
                        + Extra load
                      </button>
                    </form>
                  </div>
                </div>

                <div className="divide-y divide-black/5">
                  {job.loads.map((load) => {
                    const availableDrivers = activeDrivers.filter(
                      (driver) =>
                        driver.haulierCounterpartyId === load.haulierCounterpartyId,
                    );

                    const availableVehicles = activeVehicles.filter(
                      (vehicle) =>
                        vehicle.haulierCounterpartyId === load.haulierCounterpartyId,
                    );

                    const terminal =
                      load.status === "completed" ||
                      load.status === "rejected" ||
                      load.status === "cancelled";

                    return (
                      <div key={load.id} className="p-5">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                          <div className="flex min-w-0 flex-1 items-center gap-4">
                            <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-black text-sm font-bold text-orange-400">
                              {load.loadNumber}
                            </div>

                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses(load.status)}`}
                                >
                                  {formatStatus(load.status)}
                                </span>
                                <span className="text-xs font-medium text-black/55">
                                  {load.ewcCodeSnapshot ?? "No EWC"}
                                </span>
                                {load.ticketNumber && (
                                  <span className="text-xs text-black/35">
                                    Ticket {load.ticketNumber}
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 truncate text-sm font-semibold text-black">
                                {load.wasteDescriptionSnapshot ?? "Waste description not confirmed"}
                              </p>
                              <p className="mt-1 text-xs text-black/40">
                                {load.haulier?.name ?? "Own transport"}
                                {load.driver?.name ? ` · ${load.driver.name}` : " · Driver not assigned"}
                                {load.vehicle?.registrationNumber
                                  ? ` · ${load.vehicle.registrationNumber}`
                                  : " · Vehicle not assigned"}
                              </p>
                            </div>
                          </div>

                          <div className="grid min-w-0 gap-3 sm:grid-cols-3 xl:min-w-[500px]">
                            <SmallStat
                              label={load.direction === "incoming" ? "Arrived" : "Moved"}
                              value={formatTime(
                                load.direction === "incoming" ? load.receivedAt : load.movementAt,
                              )}
                            />
                            <SmallStat
                              label="Net weight"
                              value={
                                load.netWeight
                                  ? `${load.netWeight} ${load.weightMetric}`
                                  : "Not recorded"
                              }
                            />
                            <SmallStat
                              label="Destination"
                              value={
                                load.direction === "incoming"
                                  ? load.ownSite?.name ?? job.ownSite?.name ?? "Your site"
                                  : load.thirdPartyDestinationSite?.name ??
                                    job.thirdPartyDestinationSite?.name ??
                                    "External facility"
                              }
                            />
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {load.direction === "incoming" && load.status === "planned" && (
                            <form action={markLoadArrivedAction}>
                              <input type="hidden" name="loadId" value={load.id} />
                              <input type="hidden" name="returnDate" value={selectedDate} />
                              <button
                                type="submit"
                                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                              >
                                Mark arrived
                              </button>
                            </form>
                          )}

                          {load.direction === "incoming" && load.status === "arrived" && (
                            <form action={acceptLoadAction}>
                              <input type="hidden" name="loadId" value={load.id} />
                              <input type="hidden" name="returnDate" value={selectedDate} />
                              <button
                                type="submit"
                                className="rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
                              >
                                Accept waste
                              </button>
                            </form>
                          )}

                          {load.direction === "incoming" && load.status === "accepted" && (
                            <form action={completeIncomingLoadAction}>
                              <input type="hidden" name="loadId" value={load.id} />
                              <input type="hidden" name="returnDate" value={selectedDate} />
                              <button
                                type="submit"
                                className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500"
                              >
                                Complete load
                              </button>
                            </form>
                          )}

                          {load.direction === "outgoing" && !terminal && (
                            <form action={completeOutgoingLoadAction}>
                              <input type="hidden" name="loadId" value={load.id} />
                              <input type="hidden" name="returnDate" value={selectedDate} />
                              <button
                                type="submit"
                                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-blue-500"
                              >
                                Complete outgoing movement
                              </button>
                            </form>
                          )}

                          {!terminal && (
                            <details className="group">
                              <summary className="cursor-pointer list-none rounded-xl border border-black/10 px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700">
                                Update actual details
                              </summary>

                              <div className="mt-3 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 xl:min-w-[900px]">
                                <form action={saveLoadDetailsAction} className="grid gap-4 xl:grid-cols-4">
                                  <input type="hidden" name="loadId" value={load.id} />
                                  <input type="hidden" name="returnDate" value={selectedDate} />

                                  <label className="xl:col-span-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Actual waste description
                                    </span>
                                    <input
                                      name="wasteDescription"
                                      defaultValue={load.wasteDescriptionSnapshot ?? ""}
                                      required
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    />
                                  </label>

                                  <label>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Driver
                                    </span>
                                    <select
                                      name="driverId"
                                      defaultValue={load.driverId ?? ""}
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    >
                                      <option value="">Assign later / none</option>
                                      {availableDrivers.map((driver) => (
                                        <option key={driver.id} value={driver.id}>
                                          {driver.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <label>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Vehicle
                                    </span>
                                    <select
                                      name="vehicleId"
                                      defaultValue={load.vehicleId ?? ""}
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    >
                                      <option value="">Assign later / none</option>
                                      {availableVehicles.map((vehicle) => (
                                        <option key={vehicle.id} value={vehicle.id}>
                                          {vehicle.registrationNumber}
                                          {vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </label>

                                  <WeightInput label="Gross" name="grossWeight" value={load.grossWeight} />
                                  <WeightInput label="Tare" name="tareWeight" value={load.tareWeight} />
                                  <WeightInput label="Net" name="netWeight" value={load.netWeight} />

                                  <label>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Weight unit
                                    </span>
                                    <select
                                      name="weightMetric"
                                      defaultValue={load.weightMetric}
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    >
                                      <option value="Tonnes">Tonnes</option>
                                      <option value="Kilograms">Kilograms</option>
                                      <option value="Grams">Grams</option>
                                    </select>
                                  </label>

                                  <label>
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Ticket number
                                    </span>
                                    <input
                                      name="ticketNumber"
                                      defaultValue={load.ticketNumber ?? ""}
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    />
                                  </label>

                                  <label className="flex items-end pb-2">
                                    <span className="flex items-center gap-2 text-xs font-medium text-black/55">
                                      <input
                                        type="checkbox"
                                        name="weightIsEstimate"
                                        defaultChecked={load.weightIsEstimate}
                                        className="size-4 accent-orange-500"
                                      />
                                      Weight is estimated
                                    </span>
                                  </label>

                                  <label className="xl:col-span-2">
                                    <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                                      Operational notes
                                    </span>
                                    <input
                                      name="notes"
                                      defaultValue={load.notes ?? ""}
                                      className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
                                    />
                                  </label>

                                  <div className="flex items-end">
                                    <button
                                      type="submit"
                                      className="h-11 w-full rounded-xl bg-black px-4 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                                    >
                                      Save actual details
                                    </button>
                                  </div>
                                </form>
                              </div>
                            </details>
                          )}

                          {load.direction === "incoming" && load.status === "arrived" && (
                            <details>
                              <summary className="cursor-pointer list-none rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-xs font-semibold text-red-700">
                                Reject load
                              </summary>
                              <form
                                action={rejectLoadAction}
                                className="mt-3 flex max-w-2xl gap-2 rounded-2xl border border-red-100 bg-red-50 p-3"
                              >
                                <input type="hidden" name="loadId" value={load.id} />
                                <input type="hidden" name="returnDate" value={selectedDate} />
                                <input
                                  name="reason"
                                  required
                                  minLength={3}
                                  placeholder="Reason for rejection"
                                  className="h-10 flex-1 rounded-xl border border-red-200 bg-white px-3 text-sm outline-none"
                                />
                                <button
                                  type="submit"
                                  className="rounded-xl bg-red-600 px-4 text-xs font-semibold text-white"
                                >
                                  Confirm reject
                                </button>
                              </form>
                            </details>
                          )}

                          {load.status === "planned" && (
                            <details>
                              <summary className="cursor-pointer list-none rounded-xl border border-black/10 px-4 py-2 text-xs font-semibold text-black/40">
                                Cancel load
                              </summary>
                              <form action={cancelPlannedLoadAction} className="mt-3 flex max-w-xl gap-2">
                                <input type="hidden" name="loadId" value={load.id} />
                                <input type="hidden" name="returnDate" value={selectedDate} />
                                <input
                                  name="reason"
                                  placeholder="Optional reason"
                                  className="h-10 flex-1 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none"
                                />
                                <button
                                  type="submit"
                                  className="rounded-xl bg-black px-4 text-xs font-semibold text-white"
                                >
                                  Cancel
                                </button>
                              </form>
                            </details>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  detail,
  highlighted = false,
}: {
  label: string;
  value: number;
  detail: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border p-5 shadow-sm ${
        highlighted
          ? "border-orange-200 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>
      <p className="mt-3 text-3xl font-semibold tracking-tight text-black">
        {value}
      </p>
      <p className="mt-1 text-xs text-black/40">{detail}</p>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-[#fbfaf7] px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/30">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-black/65">{value}</p>
    </div>
  );
}

function WeightInput({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | null;
}) {
  return (
    <label>
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {label} weight
      </span>
      <input
        type="number"
        min="0"
        step="0.001"
        name={name}
        defaultValue={value ?? ""}
        className="mt-2 h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-orange-400"
      />
    </label>
  );
}
