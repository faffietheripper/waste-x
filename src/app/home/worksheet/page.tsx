/* WASTE_X_WORKSHEET_FAST_FLOW_V1 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, gte, lt, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  jobs,
  users,
  vehicles,
} from "@/db/schema";

export const dynamic = "force-dynamic";

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
import DailyOperationsScrollKeeper from "./DailyOperationsScrollKeeper";
import TransportAssignmentPopover from "./TransportAssignmentPopover";
import WorksheetSearch from "./WorksheetSearch";
import WorksheetToast from "./WorksheetToast";

type SearchParams = {
  date?: string | string[];
  view?: string | string[];
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

type WeightMetric = "Grams" | "Kilograms" | "Tonnes";

function vehicleTareForMetric(
  tareWeightKg: string | null | undefined,
  metric: WeightMetric,
) {
  if (tareWeightKg === null || tareWeightKg === undefined) {
    return null;
  }

  const kilograms = Number(tareWeightKg);

  if (!Number.isFinite(kilograms) || kilograms < 0) {
    return null;
  }

  if (metric === "Grams") {
    return Number((kilograms * 1000).toFixed(3)).toString();
  }

  if (metric === "Tonnes") {
    return Number((kilograms / 1000).toFixed(3)).toString();
  }

  return Number(kilograms.toFixed(3)).toString();
}

function weightUnit(metric: WeightMetric) {
  if (metric === "Grams") return "g";
  if (metric === "Tonnes") return "t";
  return "kg";
}

function formatWeight(value: string | number) {
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return String(value);
  }

  return new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(numeric);
}

function formatStatus(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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
  load_arrived_and_accepted:
    "Load marked as arrived and accepted against the receiving permit.",
  load_details_saved: "Load details saved.",
  load_accepted: "Load accepted against the receiving permit.",
  load_rejected: "Load rejected and retained in the operational record.",
  load_completed: "Incoming load completed.",
  outgoing_load_completed: "Outgoing movement completed.",
  load_cancelled: "Planned load cancelled.",
  extra_load_added: "Extra planned load added to the job.",
  transport_assigned: "Transport details updated.",
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
  driver_required: "Choose a driver before accepting the load.",
  vehicle_required: "Choose a vehicle before accepting the load.",
  haulier_required: "Choose a haulier or switch the load to own transport.",
  invalid_haulier: "The selected haulier is no longer available.",
  invalid_transport_mode: "Choose own transport or an external haulier.",
  invalid_driver: "The selected driver is not available.",
  invalid_vehicle: "The selected vehicle is not available.",
  driver_not_for_haulier: "That driver belongs to a different haulier.",
  vehicle_not_for_haulier: "That vehicle belongs to a different haulier.",
  driver_not_for_own_transport: "Choose one of your own drivers for own transport.",
  vehicle_not_for_own_transport: "Choose one of your own vehicles for own transport.",
  only_planned_loads_can_cancel: "Only planned loads can be cancelled from Daily Operations.",
  job_required: "A job was not supplied.",
  job_not_available: "That job is not available.",
  job_not_operational: "That job is cancelled or not operational.",
  source_load_missing: "Waste X could not find a source load to copy.",
};

export default async function DailyOperationsPage({
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
  const selectedDate = validDate(requestedDate) ? requestedDate : londonDateInput();

  const dayStart = new Date(`${selectedDate}T00:00:00.000Z`);
  const dayEnd = new Date(`${shiftDate(selectedDate, 1)}T00:00:00.000Z`);

  const [dayJobs, activeDrivers, activeVehicles, activeHauliers] = await Promise.all([
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
    database
      .select({
        id: counterparties.id,
        name: counterparties.name,
        carrierRegistrationNumber: counterparties.carrierRegistrationNumber,
      })
      .from(counterparties)
      .innerJoin(
        counterpartyRoles,
        and(
          eq(counterpartyRoles.counterpartyId, counterparties.id),
          eq(counterpartyRoles.organisationId, currentUser.organisationId),
          eq(counterpartyRoles.role, "haulier"),
        ),
      )
      .where(
        and(
          eq(counterparties.organisationId, currentUser.organisationId),
          eq(counterparties.isActive, true),
        ),
      )
      .orderBy(asc(counterparties.name)),
  ]);

  /*
    Keep the live board deterministic. Demo/imported jobs can share the exact same
    createdAt timestamp, and ordering by createdAt alone lets PostgreSQL return
    tied rows in a different order after each mutation/refetch.

    These tie-breakers never change during the load workflow, so Arrived, Weight
    and Accept cannot make a row jump. Loads remain grouped beneath their Job.
  */
  const stableDayJobs = [...dayJobs].sort((a, b) => {
    const aCreated = a.createdAt ? a.createdAt.getTime() : 0;
    const bCreated = b.createdAt ? b.createdAt.getTime() : 0;

    if (aCreated !== bCreated) return aCreated - bCreated;

    const jobNumberOrder = a.jobNumber.localeCompare(b.jobNumber);
    if (jobNumberOrder !== 0) return jobNumberOrder;

    return a.id.localeCompare(b.id);
  });

  const rows = stableDayJobs.flatMap((job) =>
    [...job.loads]
      .sort((a, b) => {
        if (a.loadNumber !== b.loadNumber) return a.loadNumber - b.loadNumber;
        return a.id.localeCompare(b.id);
      })
      .map((load) => ({
        job,
        load,
      })),
  );

  const incomingLoads = rows.filter(({ load }) => load.direction === "incoming");
  const outgoingLoads = rows.filter(({ load }) => load.direction === "outgoing");

  // Filtering preserves the original database order. Marking a load arrived or
  // accepted therefore does not make it jump around the live board.
  const completedRows = rows.filter(({ load }) => load.status === "completed");
  const operationalRows = rows.filter(({ load }) => load.status !== "completed");

  const liveLoads = operationalRows.filter(
    ({ load }) =>
      load.status !== "rejected" &&
      load.status !== "cancelled",
  );

  const problemLoads = operationalRows.filter(
    ({ load }) => load.status === "rejected" || load.status === "cancelled",
  );

  const requestedView = firstParam(searchParams?.view);
  const view = requestedView === "completed" ? "completed" : "live";
  const visibleRows = view === "completed" ? completedRows : operationalRows;

  const success = firstParam(searchParams?.success);
  const error = firstParam(searchParams?.error);
  const isToday = selectedDate === londonDateInput();

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <DailyOperationsScrollKeeper />
      <div className="mx-auto max-w-[1750px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-black px-7 py-6 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-orange-400">
                Operations // Daily Operations
              </p>

              <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                {formatDay(selectedDate)}
              </h1>

              <p className="mt-2 max-w-3xl text-sm text-white/45">
                One row per load. Accept the arrival, capture weight and complete
                without reopening the job.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href={`/home/worksheet?date=${shiftDate(selectedDate, -1)}`}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/65 transition hover:border-orange-400 hover:text-orange-400"
              >
                ← Previous
              </Link>

              {!isToday && (
                <Link
                  href="/home/worksheet"
                  className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-2.5 text-xs font-semibold text-orange-400"
                >
                  Today
                </Link>
              )}

              <Link
                href={`/home/worksheet?date=${shiftDate(selectedDate, 1)}`}
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/65 transition hover:border-orange-400 hover:text-orange-400"
              >
                Next →
              </Link>

              <Link
                href="/home/jobs/new"
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black"
              >
                + Job
              </Link>
            </div>
          </div>
        </section>

        <WorksheetToast
          type={error ? "error" : success ? "success" : null}
          message={
            error
              ? errorMessages[error] ?? `Operation failed: ${error}`
              : success
                ? successMessages[success] ?? "Daily Operations updated."
                : ""
          }
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Loads" value={rows.length} />
          <MetricCard label="Live" value={liveLoads.length} highlight />
          <MetricCard label="Incoming" value={incomingLoads.length} />
          <MetricCard label="Outgoing" value={outgoingLoads.length} />
          <MetricCard
            label="Done / exceptions"
            value={`${completedRows.length} / ${problemLoads.length}`}
          />
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border border-black/10 bg-white p-2 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <Link
              href={`/home/worksheet?date=${selectedDate}&view=live`}
              className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                view === "live"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/5 hover:text-black"
              }`}
            >
              Live loads
              <span className="ml-2 rounded-md bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-black">
                {operationalRows.length}
              </span>
            </Link>

            <Link
              href={`/home/worksheet?date=${selectedDate}&view=completed`}
              className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                view === "completed"
                  ? "bg-black text-white"
                  : "text-black/45 hover:bg-black/5 hover:text-black"
              }`}
            >
              Completed
              <span className="ml-2 rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                {completedRows.length}
              </span>
            </Link>
          </div>

          <WorksheetSearch
            date={selectedDate}
            view={view}
            totalRows={visibleRows.length}
          />
        </section>

        {rows.length === 0 ? (
          <section className="rounded-[26px] border border-dashed border-black/15 bg-white p-12 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-black">
              Nothing booked for this date
            </h2>

            <p className="mx-auto mt-2 max-w-xl text-sm text-black/45">
              Book work once. Its loads will appear here automatically for the
              operational team.
            </p>

            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link
                href="/home/jobs/new"
                className="rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-black"
              >
                + Book incoming job
              </Link>

              <Link
                href="/home/movements/outgoing/new"
                className="rounded-xl bg-black px-5 py-2.5 text-sm font-semibold text-white"
              >
                + Book outgoing
              </Link>
            </div>
          </section>
        ) : visibleRows.length === 0 ? (
          <section className="rounded-[26px] border border-dashed border-black/15 bg-white p-12 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-black">
              {view === "completed"
                ? "No completed loads for this date"
                : "No live loads for this date"}
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-black/45">
              {view === "completed"
                ? "Completed loads will move here automatically, keeping them separate from the live board."
                : "All loads for this date have been completed. Open Completed to view tickets and final weights."}
            </p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  {view === "completed" ? "Completed loads" : "Live load board"}
                </p>

                <h2 className="mt-1 text-lg font-semibold text-black">
                  {visibleRows.length} load{visibleRows.length === 1 ? "" : "s"}
                </h2>
              </div>

              <p className="hidden text-xs text-black/35 xl:block">
                {view === "completed"
                  ? "Final weights and weighbridge/load tickets"
                  : "Normal path: Accept / arrive → Weight → Complete"}
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1500px] border-collapse text-left">
                <thead className="bg-[#fbfaf7]">
                  <tr className="border-b border-black/5">
                    <Th>Job / load</Th>
                    <Th>Customer / route</Th>
                    <Th>Waste</Th>
                    <Th>Transport</Th>
                    <Th>Time</Th>
                    <Th>Quick weight</Th>
                    <Th>Status</Th>
                    <Th alignRight>Action</Th>
                  </tr>
                </thead>

                <tbody>
                  {visibleRows.map(({ job, load }) => {
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

                    const firstLoad = job.loads[0]?.id === load.id;

                    const route =
                      load.direction === "incoming"
                        ? `${job.clientSite?.name ?? "Origin"} → ${
                            load.ownSite?.name ??
                            job.ownSite?.name ??
                            "Receiving site"
                          }`
                        : `${
                            load.ownSite?.name ??
                            job.ownSite?.name ??
                            "Your site"
                          } → ${
                            load.thirdPartyDestinationSite?.name ??
                            job.thirdPartyDestinationSite?.name ??
                            "External facility"
                          }`;

                    /*
                      This search text deliberately contains both booking-level and
                      factual load-level information. Searching a Job/customer/source
                      therefore keeps all matching Loads together, while searching a
                      specific driver or registration can narrow to that exact Load.
                    */
                    const rowSearchText = [
                      job.jobNumber,
                      job.purchaseOrder,
                      job.customerReference,
                      job.client?.name,
                      job.client?.accountReference,
                      job.clientSite?.name,
                      job.clientSite?.fullAddress,
                      job.clientSite?.postcode,
                      route,
                      load.direction,
                      load.status,
                      load.ewcCodeSnapshot,
                      load.wasteDescriptionSnapshot,
                      load.haulier?.name,
                      load.haulier?.carrierRegistrationNumber,
                      load.driver?.name,
                      load.vehicle?.registrationNumber,
                      load.vehicle?.vehicleType,
                      load.ticketNumber,
                      load.notes,
                      load.ownSite?.name,
                      load.ownSite?.fullAddress,
                      load.ownSite?.postcode,
                      load.thirdPartyDestinationSite?.name,
                      load.thirdPartyDestinationSite?.fullAddress,
                      load.thirdPartyDestinationSite?.postcode,
                      load.thirdPartyDestinationSite?.counterparty?.name,
                    ]
                      .filter((value): value is string => Boolean(value))
                      .join(" ")
                      .toLowerCase();

                    return (
                      <tr
                        key={load.id}
                        id={`load-${load.id}`}
                        data-worksheet-row="true"
                        data-search={rowSearchText}
                        className="scroll-mt-32 border-b border-black/5 align-top last:border-b-0 hover:bg-orange-50/25"
                      >
                        <Td>
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/home/jobs/${job.id}`}
                              className="max-w-[180px] truncate text-sm font-semibold text-black hover:text-orange-700"
                            >
                              {job.jobNumber}
                            </Link>

                            <span className="rounded-md bg-black px-1.5 py-0.5 text-[10px] font-bold text-orange-400">
                              {load.loadNumber}
                            </span>
                          </div>

                          <div className="mt-1.5 flex items-center gap-2">
                            <span
                              className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                                load.direction === "incoming"
                                  ? "text-orange-700"
                                  : "text-blue-700"
                              }`}
                            >
                              {load.direction}
                            </span>

                            {firstLoad && !terminal && (
                              <form action={addExtraLoadAction}>
                                <input type="hidden" name="jobId" value={job.id} />
                                <input
                                  type="hidden"
                                  name="returnDate"
                                  value={selectedDate}
                                />

                                <button
                                  type="submit"
                                  className="text-[10px] font-semibold text-black/35 underline decoration-black/15 underline-offset-2 hover:text-orange-700"
                                >
                                  + load
                                </button>
                              </form>
                            )}
                          </div>
                        </Td>

                        <Td>
                          <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">
                            {load.direction === "incoming"
                              ? job.client?.name ?? "No client"
                              : load.thirdPartyDestinationSite?.counterparty?.name ??
                                job.thirdPartyDestinationSite?.counterparty?.name ??
                                "External operator"}
                          </p>

                          <p
                            title={route}
                            className="mt-1 max-w-[260px] truncate text-xs text-black/35"
                          >
                            {route}
                          </p>
                        </Td>

                        <Td>
                          <p className="text-xs font-semibold text-black/55">
                            {load.ewcCodeSnapshot ?? "No EWC"}
                          </p>

                          <p
                            title={
                              load.wasteDescriptionSnapshot ??
                              "Waste description not confirmed"
                            }
                            className="mt-1 max-w-[260px] truncate text-xs text-black/40"
                          >
                            {load.wasteDescriptionSnapshot ??
                              "Waste description not confirmed"}
                          </p>
                        </Td>

                        <Td>
                          <p className="max-w-[180px] truncate text-sm font-semibold text-black/70">
                            {load.haulier?.name ?? "Own transport"}
                          </p>

                          <p className="mt-1 max-w-[180px] truncate text-xs text-black/35">
                            {load.driver?.name ?? "No driver"}
                            {" · "}
                            {load.vehicle?.registrationNumber ?? "No vehicle"}
                          </p>

                          {!terminal && (
                            <TransportAssignmentPopover
                              load={load}
                              hauliers={activeHauliers}
                              drivers={activeDrivers}
                              vehicles={activeVehicles}
                              returnDate={selectedDate}
                            />
                          )}
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black/65">
                            {formatTime(
                              load.direction === "incoming"
                                ? load.receivedAt
                                : load.movementAt,
                            )}
                          </p>

                          <p className="mt-1 text-xs text-black/35">
                            {load.direction === "incoming" ? "Arrived" : "Moved"}
                          </p>
                        </Td>

                        <Td>
                          {terminal ? (
                            <div>
                              <p className="text-sm font-semibold text-black/70">
                                {load.netWeight
                                  ? `${load.netWeight} ${load.weightMetric}`
                                  : "—"}
                              </p>

                              <p className="mt-1 text-xs text-black/35">Final</p>
                            </div>
                          ) : (
                            <QuickWeightForm
                              load={load}
                              returnDate={selectedDate}
                            />
                          )}
                        </Td>

                        <Td>
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses(
                              load.status,
                            )}`}
                          >
                            {formatStatus(load.status)}
                          </span>

                          {load.netWeight && (
                            <p className="mt-2 text-xs font-medium text-black/40">
                              Net {load.netWeight} {load.weightMetric}
                            </p>
                          )}
                        </Td>

                        <Td>
                          <div className="flex min-w-[160px] flex-col items-end gap-2">
                            {load.status === "completed" ? (
                              <TicketActions loadId={load.id} />
                            ) : (
                              <PrimaryAction load={load} returnDate={selectedDate} />
                            )}

                            {!terminal && (
                              <details className="w-full">
                                <summary className="cursor-pointer list-none text-right text-[11px] font-semibold text-black/40 hover:text-orange-700">
                                  More / edit
                                </summary>

                                <div className="mt-2 rounded-xl border border-black/10 bg-[#fbfaf7] p-3">
                                  <form
                                    action={saveLoadDetailsAction}
                                    className="grid gap-2"
                                  >
                                    <input
                                      type="hidden"
                                      name="loadId"
                                      value={load.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="returnDate"
                                      value={selectedDate}
                                    />

                                    <label>
                                      <FieldLabel>Waste description</FieldLabel>
                                      <input
                                        name="wasteDescription"
                                        defaultValue={
                                          load.wasteDescriptionSnapshot ?? ""
                                        }
                                        required
                                        className="mt-1 h-9 w-full min-w-[270px] rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-orange-400"
                                      />
                                    </label>

                                    <div className="grid grid-cols-2 gap-2">
                                      <label>
                                        <FieldLabel>Driver</FieldLabel>
                                        <select
                                          name="driverId"
                                          defaultValue={load.driverId ?? ""}
                                          className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs outline-none"
                                        >
                                          <option value="">None</option>
                                          {availableDrivers.map((driver) => (
                                            <option key={driver.id} value={driver.id}>
                                              {driver.name}
                                            </option>
                                          ))}
                                        </select>
                                      </label>

                                      <label>
                                        <FieldLabel>Vehicle</FieldLabel>
                                        <select
                                          name="vehicleId"
                                          defaultValue={load.vehicleId ?? ""}
                                          className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs outline-none"
                                        >
                                          <option value="">None</option>
                                          {availableVehicles.map((vehicle) => (
                                            <option key={vehicle.id} value={vehicle.id}>
                                              {vehicle.registrationNumber}
                                            </option>
                                          ))}
                                        </select>
                                      </label>
                                    </div>

                                    <div className="grid grid-cols-3 gap-2">
                                      <WeightInput
                                        label="Gross"
                                        name="grossWeight"
                                        value={load.grossWeight}
                                      />

                                      {load.vehicle?.tareWeightKg !== null &&
                                      load.vehicle?.tareWeightKg !== undefined ? (
                                        <label>
                                          <FieldLabel>Tare</FieldLabel>
                                          <input
                                            type="hidden"
                                            name="tareWeight"
                                            value={
                                              load.tareWeight ??
                                              vehicleTareForMetric(
                                                load.vehicle.tareWeightKg,
                                                load.weightMetric,
                                              ) ??
                                              ""
                                            }
                                          />
                                          <div className="mt-1 flex h-9 w-full items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-xs font-semibold text-emerald-800">
                                            {formatWeight(
                                              load.tareWeight ??
                                                vehicleTareForMetric(
                                                  load.vehicle.tareWeightKg,
                                                  load.weightMetric,
                                                ) ??
                                                "0",
                                            )}{" "}
                                            {weightUnit(load.weightMetric)}
                                          </div>
                                          <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
                                            Stored vehicle tare
                                          </p>
                                        </label>
                                      ) : (
                                        <WeightInput
                                          label="Tare"
                                          name="tareWeight"
                                          value={load.tareWeight}
                                        />
                                      )}

                                      <WeightInput
                                        label="Net"
                                        name="netWeight"
                                        value={load.netWeight}
                                      />
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <label>
                                        <FieldLabel>Unit</FieldLabel>
                                        <select
                                          name="weightMetric"
                                          defaultValue={load.weightMetric}
                                          className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"
                                        >
                                          <option value="Tonnes">Tonnes</option>
                                          <option value="Kilograms">Kilograms</option>
                                          <option value="Grams">Grams</option>
                                        </select>
                                      </label>

                                      <label>
                                        <FieldLabel>Ticket</FieldLabel>
                                        <input
                                          name="ticketNumber"
                                          defaultValue={load.ticketNumber ?? ""}
                                          className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs"
                                        />
                                      </label>
                                    </div>

                                    <label>
                                      <FieldLabel>Notes</FieldLabel>
                                      <input
                                        name="notes"
                                        defaultValue={load.notes ?? ""}
                                        className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs"
                                      />
                                    </label>

                                    <label className="flex items-center gap-2 text-[11px] font-medium text-black/50">
                                      <input
                                        type="checkbox"
                                        name="weightIsEstimate"
                                        defaultChecked={load.weightIsEstimate}
                                        className="size-3.5 accent-orange-500"
                                      />
                                      Estimated weight
                                    </label>

                                    <button
                                      type="submit"
                                      className="h-9 rounded-lg bg-black px-3 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black"
                                    >
                                      Save details
                                    </button>
                                  </form>

                                  {load.direction === "incoming" &&
                                    load.status === "arrived" && (
                                      <form
                                        action={rejectLoadAction}
                                        className="mt-2 border-t border-black/5 pt-2"
                                      >
                                        <input
                                          type="hidden"
                                          name="loadId"
                                          value={load.id}
                                        />
                                        <input
                                          type="hidden"
                                          name="returnDate"
                                          value={selectedDate}
                                        />

                                        <input
                                          name="reason"
                                          required
                                          minLength={3}
                                          placeholder="Rejection reason"
                                          className="h-9 w-full rounded-lg border border-red-200 bg-white px-2.5 text-xs outline-none"
                                        />

                                        <button
                                          type="submit"
                                          className="mt-1.5 h-9 w-full rounded-lg bg-red-600 px-3 text-xs font-semibold text-white"
                                        >
                                          Reject load
                                        </button>
                                      </form>
                                    )}

                                  {load.status === "planned" && (
                                    <form
                                      action={cancelPlannedLoadAction}
                                      className="mt-2 border-t border-black/5 pt-2"
                                    >
                                      <input
                                        type="hidden"
                                        name="loadId"
                                        value={load.id}
                                      />
                                      <input
                                        type="hidden"
                                        name="returnDate"
                                        value={selectedDate}
                                      />

                                      <input
                                        name="reason"
                                        placeholder="Optional cancellation reason"
                                        className="h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none"
                                      />

                                      <button
                                        type="submit"
                                        className="mt-1.5 h-9 w-full rounded-lg border border-black/10 px-3 text-xs font-semibold text-black/50"
                                      >
                                        Cancel load
                                      </button>
                                    </form>
                                  )}
                                </div>
                              </details>
                            )}
                          </div>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}

function PrimaryAction({
  load,
  returnDate,
}: {
  load: {
    id: string;
    direction: string;
    status: string;
    driverId: string | null;
    vehicleId: string | null;
  };
  returnDate: string;
}) {
  if (load.direction === "incoming" && load.status === "planned") {
    if (!load.driverId || !load.vehicleId) {
      return (
        <span className="inline-flex w-full justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] font-semibold text-amber-800">
          Assign driver + vehicle first
        </span>
      );
    }

    return (
      <form action={markLoadArrivedAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-orange-400">
          Accept / mark arrived
        </button>
      </form>
    );
  }

  if (load.direction === "incoming" && load.status === "arrived") {
    if (!load.driverId || !load.vehicleId) {
      return (
        <span className="inline-flex w-full justify-center rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-[10px] font-semibold text-amber-800">
          Assign driver + vehicle first
        </span>
      );
    }

    return (
      <form action={acceptLoadAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-bold text-black hover:bg-orange-400">
          Accept
        </button>
      </form>
    );
  }

  if (load.direction === "incoming" && load.status === "accepted") {
    return (
      <form action={completeIncomingLoadAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-500">
          Complete
        </button>
      </form>
    );
  }

  if (
    load.direction === "outgoing" &&
    load.status !== "completed" &&
    load.status !== "rejected" &&
    load.status !== "cancelled"
  ) {
    return (
      <form action={completeOutgoingLoadAction}>
        <input type="hidden" name="loadId" value={load.id} />
        <input type="hidden" name="returnDate" value={returnDate} />
        <button className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-blue-500">
          Complete
        </button>
      </form>
    );
  }

  if (load.status === "completed") {
    return (
      <span className="inline-flex w-full justify-center rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
        ✓ Done
      </span>
    );
  }

  if (load.status === "rejected") {
    return (
      <span className="inline-flex w-full justify-center rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        Rejected
      </span>
    );
  }

  return (
    <span className="inline-flex w-full justify-center rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold text-black/40">
      {formatStatus(load.status)}
    </span>
  );
}

function TicketActions({ loadId }: { loadId: string }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <a
        href={`/api/operations/weighbridge-tickets/${loadId}/print?auto=1`}
        target="_blank"
        rel="noreferrer"
        className="inline-flex w-full justify-center rounded-lg bg-black px-3 py-2 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black"
      >
        Print another ticket
      </a>
      <a
        href={`/api/operations/weighbridge-tickets/${loadId}/pdf`}
        className="inline-flex w-full justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/55 hover:border-orange-300 hover:text-orange-700"
      >
        Download PDF
      </a>
    </div>
  );
}

function QuickWeightForm({
  load,
  returnDate,
}: {
  load: {
    id: string;
    driverId: string | null;
    vehicleId: string | null;
    wasteDescriptionSnapshot: string | null;
    grossWeight: string | null;
    tareWeight: string | null;
    netWeight: string | null;
    weightMetric: WeightMetric;
    weightIsEstimate: boolean;
    ticketNumber: string | null;
    notes: string | null;
    vehicle: {
      tareWeightKg: string | null;
    } | null;
  };
  returnDate: string;
}) {
  /*
    Vehicle master tare is stored in kilograms.

    If this load already has a tare snapshot, keep using that historical value.
    Otherwise use the vehicle's stored tare automatically.

    When the vehicle has no stored tare, the operator can enter tare manually
    for this load.
  */
  const storedVehicleTare = vehicleTareForMetric(
    load.vehicle?.tareWeightKg,
    load.weightMetric,
  );

  const effectiveTare = load.tareWeight ?? storedVehicleTare;
  const hasStoredVehicleTare =
    load.vehicle?.tareWeightKg !== null &&
    load.vehicle?.tareWeightKg !== undefined &&
    storedVehicleTare !== null;

  return (
    <form action={saveLoadDetailsAction} className="min-w-[250px]">
      <input type="hidden" name="loadId" value={load.id} />
      <input type="hidden" name="returnDate" value={returnDate} />
      <input type="hidden" name="driverId" value={load.driverId ?? ""} />
      <input type="hidden" name="vehicleId" value={load.vehicleId ?? ""} />
      <input
        type="hidden"
        name="wasteDescription"
        value={load.wasteDescriptionSnapshot ?? ""}
      />
      <input type="hidden" name="weightMetric" value={load.weightMetric} />
      <input type="hidden" name="netWeight" value={load.netWeight ?? ""} />
      <input type="hidden" name="ticketNumber" value={load.ticketNumber ?? ""} />
      <input type="hidden" name="notes" value={load.notes ?? ""} />

      {load.weightIsEstimate && (
        <input type="hidden" name="weightIsEstimate" value="on" />
      )}

      {hasStoredVehicleTare && effectiveTare !== null ? (
        <>
          <input type="hidden" name="tareWeight" value={effectiveTare} />

          <div className="grid grid-cols-[82px_108px_auto] items-end gap-1.5">
            <label>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">
                Gross
              </span>

              <input
                type="number"
                min="0"
                step="0.001"
                name="grossWeight"
                defaultValue={load.grossWeight ?? ""}
                placeholder="0"
                className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs font-semibold outline-none focus:border-orange-400"
              />
            </label>

            <div>
              <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">
                Tare
              </span>

              <div className="mt-1 flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2">
                <span className="truncate text-xs font-semibold text-emerald-800">
                  {formatWeight(effectiveTare)} {weightUnit(load.weightMetric)}
                </span>
              </div>

              <p className="mt-1 text-[8px] font-semibold uppercase tracking-[0.1em] text-emerald-700">
                Vehicle tare
              </p>
            </div>

            <button
              type="submit"
              className="h-9 rounded-lg border border-black/10 bg-black px-3 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black"
            >
              Save
            </button>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-[82px_82px_auto] items-end gap-1.5">
          <label>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">
              Gross
            </span>

            <input
              type="number"
              min="0"
              step="0.001"
              name="grossWeight"
              defaultValue={load.grossWeight ?? ""}
              placeholder="0"
              className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs font-semibold outline-none focus:border-orange-400"
            />
          </label>

          <label>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">
              Tare
            </span>

            <input
              type="number"
              min="0"
              step="0.001"
              name="tareWeight"
              defaultValue={load.tareWeight ?? ""}
              placeholder="0"
              className="mt-1 h-9 w-full rounded-lg border border-orange-200 bg-orange-50 px-2 text-xs font-semibold outline-none focus:border-orange-400"
            />

            <p className="mt-1 text-[8px] font-medium text-orange-700">
              Enter tare
            </p>
          </label>

          <button
            type="submit"
            className="h-9 rounded-lg border border-black/10 bg-black px-3 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black"
          >
            Save
          </button>
        </div>
      )}
    </form>
  );
}

function MetricCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number | string;
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
      {children}
    </span>
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
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        min="0"
        step="0.001"
        name={name}
        defaultValue={value ?? ""}
        className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs outline-none focus:border-orange-400"
      />
    </label>
  );
}
