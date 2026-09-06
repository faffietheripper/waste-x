/* WASTE_X_WORKSHEET_RECEIVING_FLOW_V3 */
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

import {
  acceptLoadAction,
  addExtraLoadAction,
  cancelPlannedLoadAction,
  completeIncomingLoadAction,
  completeOutgoingLoadAction,
  markLoadArrivedAction,
  saveLoadDetailsAction,
} from "./actions";
import { issueReceivingSiteTicketAction } from "./ticket-actions";
import DailyOperationsScrollKeeper from "./DailyOperationsScrollKeeper";
import RejectLoadModal from "./RejectLoadModal";
import TransportAssignmentPopover from "./TransportAssignmentPopover";
import WorksheetSearch from "./WorksheetSearch";
import WorksheetToast from "./WorksheetToast";

export const dynamic = "force-dynamic";

type SearchParams = {
  date?: string | string[];
  view?: string | string[];
  success?: string | string[];
  error?: string | string[];
};

type WeightMetric = "Grams" | "Kilograms" | "Tonnes";
type WorksheetView = "live" | "rejected" | "completed" | "cancelled";

type RejectionSummary = {
  authority: "RECEIVING_SITE" | "DRIVER";
  categoryLabel: string;
  reason: string;
};

const SITE_REJECTION_LABELS: Record<string, string> = {
  WASTE_MISMATCH: "Waste does not match booking",
  CONTAMINATION: "Contamination / unacceptable material",
  PERMIT_OR_COMPLIANCE: "Permit / compliance issue",
  UNSAFE_LOAD: "Unsafe load",
  DOCUMENTATION: "Missing / incorrect paperwork",
  SITE_CAPACITY: "Site cannot receive this load",
  OTHER: "Other",
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
  return !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());
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

function vehicleTareForMetric(
  tareWeightKg: string | null | undefined,
  metric: WeightMetric,
) {
  if (tareWeightKg === null || tareWeightKg === undefined) return null;
  const kilograms = Number(tareWeightKg);
  if (!Number.isFinite(kilograms) || kilograms < 0) return null;
  if (metric === "Grams") return Number((kilograms * 1000).toFixed(3)).toString();
  if (metric === "Tonnes") return Number((kilograms / 1000).toFixed(3)).toString();
  return Number(kilograms.toFixed(3)).toString();
}

function weightUnit(metric: WeightMetric) {
  if (metric === "Grams") return "g";
  if (metric === "Tonnes") return "t";
  return "kg";
}

function formatWeight(value: string | number) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
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

function rejectionSummary(notes: string | null): RejectionSummary | null {
  if (!notes?.trim()) return null;
  const lines = notes.split("\n").map((line) => line.trim()).filter(Boolean).reverse();
  for (const line of lines) {
    const site = line.match(/^\[SITE REJECTED · ([A-Z_]+) · [^\]]+\]\s*(.+)$/);
    if (site) {
      return {
        authority: "RECEIVING_SITE",
        categoryLabel: SITE_REJECTION_LABELS[site[1] ?? ""] ?? SITE_REJECTION_LABELS.OTHER,
        reason: (site[2] ?? "").trim(),
      };
    }

    const driver = line.match(/^\[DRIVER COLLECTION REJECTED · [^\]]+\]\s*(.+)$/);
    if (driver) {
      return {
        authority: "DRIVER",
        categoryLabel: "Driver refused collection",
        reason: (driver[1] ?? "").trim(),
      };
    }

    const legacy = line.match(/^\[REJECTED · [^\]]+\]\s*(.+)$/);
    if (legacy) {
      const detail = (legacy[1] ?? "").trim();
      const tagged = detail.match(/^\[CATEGORY:([A-Z_]+)\]\s*(.+)$/);
      const category = tagged?.[1] ?? "OTHER";
      return {
        authority: "RECEIVING_SITE",
        categoryLabel: SITE_REJECTION_LABELS[category] ?? SITE_REJECTION_LABELS.OTHER,
        reason: (tagged?.[2] ?? detail).trim(),
      };
    }
  }
  return null;
}

const successMessages: Record<string, string> = {
  load_arrived: "External carrier marked as arrived. Site acceptance is still required.",
  load_details_saved: "Receiving-site details saved.",
  load_accepted: "Load accepted by the receiving site.",
  load_rejected: "Load rejected by the receiving site and moved to Rejected.",
  load_completed: "Incoming receiving-site transaction completed.",
  outgoing_load_completed: "Outgoing movement completed.",
  load_cancelled: "Planned load cancelled.",
  extra_load_added: "Extra planned load added to the job.",
  transport_assigned: "Transport details updated.",
  site_ticket_ready: "Receiving-site ticket issued. Print and PDF are now available.",
};

const errorMessages: Record<string, string> = {
  unauthorised: "You do not have access to operate the worksheet.",
  load_required: "A load was not supplied.",
  load_not_found: "That load could not be found in your organisation.",
  incoming_only_action: "That action is only available for incoming loads.",
  outgoing_only_action: "That action is only available for outgoing loads.",
  load_not_planned: "Only a planned incoming load can be marked as arrived.",
  load_must_be_arrived: "The Driver or external carrier must arrive before the site can decide this load.",
  driver_destination_arrival_required: "Wait for the assigned Driver to mark Arrived at destination on Mobile.",
  load_must_be_accepted: "The receiving site must accept the load before completion.",
  load_is_terminal: "That load is already finished and cannot be edited.",
  waste_description_required: "Confirm the actual waste description before continuing.",
  weight_after_arrival_only: "Receiving-site weight can only be entered after the load arrives.",
  invalid_weight_metric: "Choose a valid weight unit.",
  invalid_gross_weight: "Gross weight must be zero or greater.",
  invalid_tare_weight: "Tare weight must be zero or greater.",
  invalid_net_weight: "Net weight must be zero or greater.",
  gross_below_tare: "Gross weight cannot be lower than tare weight.",
  net_weight_required: "A positive final net weight is required before completion.",
  received_time_missing: "The incoming load does not have an arrival time.",
  permit_mismatch: "This EWC is not currently allowed by the selected receiving permit.",
  external_facility_permit_mismatch:
    "The selected third-party facility does not have an active authorisation for this EWC.",
  rejection_category_required: "Choose a rejection category before refusing the load.",
  rejection_reason_required: "Enter a reason before rejecting the load.",
  driver_required: "Choose a driver before continuing.",
  vehicle_required: "Choose a vehicle before continuing.",
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
  site_ticket_requires_completed_load: "Complete the receiving-site transaction before issuing its ticket.",
};

export default async function DailyOperationsPage({
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
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.isActive || currentUser.isSuspended) {
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
        thirdPartyDestinationSite: { with: { counterparty: true } },
        haulier: true,
        materialProfile: { with: { ewcCode: true } },
        loads: {
          with: {
            driver: true,
            vehicle: true,
            haulier: true,
            ownSite: true,
            thirdPartyDestinationSite: { with: { counterparty: true } },
          },
          orderBy: (load, { asc: sortAsc }) => [sortAsc(load.loadNumber)],
        },
      },
      orderBy: (job, { asc: sortAsc }) => [sortAsc(job.createdAt)],
    }),
    database
      .select({ id: drivers.id, name: drivers.name, haulierCounterpartyId: drivers.haulierCounterpartyId })
      .from(drivers)
      .where(and(eq(drivers.organisationId, currentUser.organisationId), eq(drivers.isActive, true)))
      .orderBy(asc(drivers.name)),
    database
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        haulierCounterpartyId: vehicles.haulierCounterpartyId,
      })
      .from(vehicles)
      .where(and(eq(vehicles.organisationId, currentUser.organisationId), eq(vehicles.isActive, true)))
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
      .where(and(eq(counterparties.organisationId, currentUser.organisationId), eq(counterparties.isActive, true)))
      .orderBy(asc(counterparties.name)),
  ]);

  const stableDayJobs = [...dayJobs].sort((a, b) => {
    const created = (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0);
    if (created !== 0) return created;
    const number = a.jobNumber.localeCompare(b.jobNumber);
    return number !== 0 ? number : a.id.localeCompare(b.id);
  });

  const rows = stableDayJobs.flatMap((job) =>
    [...job.loads]
      .sort((a, b) => (a.loadNumber !== b.loadNumber ? a.loadNumber - b.loadNumber : a.id.localeCompare(b.id)))
      .map((load) => ({ job, load })),
  );

  const liveRows = rows.filter(({ load }) => !["completed", "rejected", "cancelled"].includes(load.status));
  const rejectedRows = rows.filter(({ load }) => load.status === "rejected");
  const completedRows = rows.filter(({ load }) => load.status === "completed");
  const cancelledRows = rows.filter(({ load }) => load.status === "cancelled");
  const incomingLoads = rows.filter(({ load }) => load.direction === "incoming");

  const requestedView = firstParam(searchParams?.view);
  const view: WorksheetView =
    requestedView === "rejected" || requestedView === "completed" || requestedView === "cancelled"
      ? requestedView
      : "live";
  const visibleRows =
    view === "rejected"
      ? rejectedRows
      : view === "completed"
        ? completedRows
        : view === "cancelled"
          ? cancelledRows
          : liveRows;
  const success = firstParam(searchParams?.success);
  const error = firstParam(searchParams?.error);
  const isToday = selectedDate === londonDateInput();

  const viewCopy: Record<WorksheetView, { eyebrow: string; heading: string; helper: string; empty: string }> = {
    live: {
      eyebrow: "Live receiving board",
      heading: `${visibleRows.length} live load${visibleRows.length === 1 ? "" : "s"}`,
      helper: "Driver arrives → site checks → Accept or Reject → Weigh → Complete",
      empty: "No live loads for this date",
    },
    rejected: {
      eyebrow: "Rejected loads",
      heading: `${visibleRows.length} rejected load${visibleRows.length === 1 ? "" : "s"}`,
      helper: "Receiving-site and Driver refusals stay visible with their recorded reason",
      empty: "No rejected loads for this date",
    },
    completed: {
      eyebrow: "Completed loads",
      heading: `${visibleRows.length} completed load${visibleRows.length === 1 ? "" : "s"}`,
      helper: "Final weights and receiving-site tickets",
      empty: "No completed loads for this date",
    },
    cancelled: {
      eyebrow: "Cancelled loads",
      heading: `${visibleRows.length} cancelled load${visibleRows.length === 1 ? "" : "s"}`,
      helper: "Planned loads cancelled before the operational movement",
      empty: "No cancelled loads for this date",
    },
  };

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-20 pt-[15vh] pl-[24vw]">
      <DailyOperationsScrollKeeper />
      <div className="mx-auto max-w-[1750px] space-y-5">
        <section className="relative overflow-hidden rounded-[28px] bg-black px-7 py-6 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-orange-400">Operations // Daily Operations</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight">{formatDay(selectedDate)}</h1>
              <p className="mt-2 max-w-3xl text-sm text-white/45">
                Driver arrival hands the load to the site. Site staff then check, accept or refuse, weigh accepted loads, and complete the transaction.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={`/home/worksheet?date=${shiftDate(selectedDate, -1)}&view=${view}`} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/65">← Previous</Link>
              {!isToday && <Link href={`/home/worksheet?view=${view}`} className="rounded-xl border border-orange-400/30 bg-orange-400/10 px-4 py-2.5 text-xs font-semibold text-orange-400">Today</Link>}
              <Link href={`/home/worksheet?date=${shiftDate(selectedDate, 1)}&view=${view}`} className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/65">Next →</Link>
              <Link href="/home/jobs/new" className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black">+ Job</Link>
            </div>
          </div>
        </section>

        <WorksheetToast
          type={error ? "error" : success ? "success" : null}
          message={error ? errorMessages[error] ?? `Operation failed: ${error}` : success ? successMessages[success] ?? "Daily Operations updated." : ""}
        />

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Loads" value={rows.length} />
          <MetricCard label="Live" value={liveRows.length} highlight />
          <MetricCard label="Incoming" value={incomingLoads.length} />
          <MetricCard label="Rejected" value={rejectedRows.length} danger={rejectedRows.length > 0} />
          <MetricCard label="Completed" value={completedRows.length} />
        </section>

        <section className="flex flex-col gap-3 rounded-[20px] border border-black/10 bg-white p-2 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <WorksheetTab href={`/home/worksheet?date=${selectedDate}&view=live`} active={view === "live"} label="Live" count={liveRows.length} tone="orange" />
            <WorksheetTab href={`/home/worksheet?date=${selectedDate}&view=rejected`} active={view === "rejected"} label="Rejected" count={rejectedRows.length} tone="red" />
            <WorksheetTab href={`/home/worksheet?date=${selectedDate}&view=completed`} active={view === "completed"} label="Completed" count={completedRows.length} tone="green" />
            <WorksheetTab href={`/home/worksheet?date=${selectedDate}&view=cancelled`} active={view === "cancelled"} label="Cancelled" count={cancelledRows.length} tone="grey" />
          </div>
          <WorksheetSearch date={selectedDate} view={view} totalRows={visibleRows.length} />
        </section>

        {visibleRows.length === 0 ? (
          <section className="rounded-[26px] border border-dashed border-black/15 bg-white p-12 text-center shadow-sm">
            <h2 className="text-xl font-semibold text-black">{rows.length === 0 ? "Nothing booked for this date" : viewCopy[view].empty}</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-black/45">Booked loads move through Driver transport and receiving-site decisions without duplicate checkpoints.</p>
          </section>
        ) : (
          <section className="overflow-hidden rounded-[26px] border border-black/10 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
              <div>
                <p className={`text-[10px] font-semibold uppercase tracking-[0.2em] ${view === "rejected" ? "text-red-600" : "text-orange-600"}`}>{viewCopy[view].eyebrow}</p>
                <h2 className="mt-1 text-lg font-semibold text-black">{viewCopy[view].heading}</h2>
              </div>
              <p className="hidden text-xs text-black/35 xl:block">{viewCopy[view].helper}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1450px] border-collapse text-left">
                <thead className="bg-[#fbfaf7]">
                  <tr className="border-b border-black/5">
                    <Th>Job / load</Th><Th>Customer / route</Th><Th>Waste</Th><Th>Transport</Th><Th>Arrival</Th><Th>Site weight</Th><Th>Status</Th><Th alignRight>Site action</Th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map(({ job, load }) => {
                    const availableDrivers = activeDrivers.filter((driver) => driver.haulierCounterpartyId === load.haulierCounterpartyId);
                    const availableVehicles = activeVehicles.filter((vehicle) => vehicle.haulierCounterpartyId === load.haulierCounterpartyId);
                    const terminal = ["completed", "rejected", "cancelled"].includes(load.status);
                    const firstLoad = job.loads[0]?.id === load.id;
                    const ownTransport = !load.haulierCounterpartyId;
                    const rejection = load.status === "rejected" ? rejectionSummary(load.notes) : null;
                    const route = load.direction === "incoming"
                      ? `${job.clientSite?.name ?? "Origin"} → ${load.ownSite?.name ?? job.ownSite?.name ?? "Receiving site"}`
                      : `${load.ownSite?.name ?? job.ownSite?.name ?? "Your site"} → ${load.thirdPartyDestinationSite?.name ?? job.thirdPartyDestinationSite?.name ?? "External facility"}`;
                    const rowSearchText = [
                      job.jobNumber, job.purchaseOrder, job.customerReference, job.client?.name,
                      job.clientSite?.name, route, load.direction, load.status, load.ewcCodeSnapshot,
                      load.wasteDescriptionSnapshot, load.haulier?.name, load.driver?.name,
                      load.vehicle?.registrationNumber, load.ticketNumber, load.notes,
                      rejection?.categoryLabel, rejection?.reason,
                    ].filter((value): value is string => Boolean(value)).join(" ").toLowerCase();

                    return (
                      <tr key={load.id} id={`load-${load.id}`} data-worksheet-row="true" data-search={rowSearchText} className="scroll-mt-32 border-b border-black/5 align-top last:border-b-0 hover:bg-orange-50/25">
                        <Td>
                          <div className="flex items-center gap-2">
                            <Link href={`/home/jobs/${job.id}`} className="max-w-[180px] truncate text-sm font-semibold text-black hover:text-orange-700">{job.jobNumber}</Link>
                            <span className="rounded-md bg-black px-1.5 py-0.5 text-[10px] font-bold text-orange-400">{load.loadNumber}</span>
                          </div>
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700">{load.direction}</span>
                            {firstLoad && !terminal && <form action={addExtraLoadAction}><input type="hidden" name="jobId" value={job.id} /><input type="hidden" name="returnDate" value={selectedDate} /><button type="submit" className="text-[10px] font-semibold text-black/35 underline">+ load</button></form>}
                          </div>
                        </Td>

                        <Td>
                          <p className="max-w-[220px] truncate text-sm font-semibold text-black/70">{load.direction === "incoming" ? job.client?.name ?? "No client" : load.thirdPartyDestinationSite?.counterparty?.name ?? job.thirdPartyDestinationSite?.counterparty?.name ?? "External operator"}</p>
                          <p title={route} className="mt-1 max-w-[260px] truncate text-xs text-black/35">{route}</p>
                        </Td>

                        <Td>
                          <p className="text-xs font-semibold text-black/55">{load.ewcCodeSnapshot ?? "No EWC"}</p>
                          <p className="mt-1 max-w-[260px] truncate text-xs text-black/40">{load.wasteDescriptionSnapshot ?? "Waste description not confirmed"}</p>
                        </Td>

                        <Td>
                          <p className="max-w-[180px] truncate text-sm font-semibold text-black/70">{load.haulier?.name ?? "Own transport"}</p>
                          <p className="mt-1 max-w-[180px] truncate text-xs text-black/35">{load.driver?.name ?? "No driver"} · {load.vehicle?.registrationNumber ?? "No vehicle"}</p>
                          {!terminal && <TransportAssignmentPopover load={load} hauliers={activeHauliers} drivers={activeDrivers} vehicles={activeVehicles} returnDate={selectedDate} />}
                        </Td>

                        <Td>
                          <p className="text-sm font-semibold text-black/65">{formatTime(load.receivedAt)}</p>
                          <p className="mt-1 text-xs text-black/35">{load.receivedAt ? "At receiving site" : ownTransport ? "Waiting for Driver" : "Awaiting carrier"}</p>
                        </Td>

                        <Td>
                          {terminal ? (
                            <div><p className="text-sm font-semibold text-black/70">{load.netWeight ? `${load.netWeight} ${load.weightMetric}` : "—"}</p><p className="mt-1 text-xs text-black/35">{load.status === "rejected" ? "Not finalised" : "Final"}</p></div>
                          ) : load.direction === "incoming" && (load.status === "arrived" || load.status === "accepted") ? (
                            <QuickWeightForm load={load} returnDate={selectedDate} />
                          ) : (
                            <div className="rounded-lg bg-black/[0.03] px-3 py-2 text-[10px] font-semibold text-black/35">Weight unlocks after arrival</div>
                          )}
                        </Td>

                        <Td>
                          <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${statusClasses(load.status)}`}>{formatStatus(load.status)}</span>
                          {load.netWeight && <p className="mt-2 text-xs font-medium text-black/40">Net {load.netWeight} {load.weightMetric}</p>}
                          {rejection ? <p className="mt-2 max-w-[220px] text-[10px] font-semibold leading-4 text-red-700">{rejection.categoryLabel}</p> : null}
                        </Td>

                        <Td>
                          <div className="flex min-w-[210px] flex-col items-end gap-2">
                            {load.status === "completed" ? (
                              load.ticketNumber ? (
                                <TicketActions loadId={load.id} ticketNumber={load.ticketNumber} />
                              ) : (
                                <form action={issueReceivingSiteTicketAction} className="w-full">
                                  <input type="hidden" name="loadId" value={load.id} />
                                  <input type="hidden" name="returnDate" value={selectedDate} />
                                  <button className="w-full rounded-lg bg-black px-3.5 py-2 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black">Generate site ticket</button>
                                </form>
                              )
                            ) : load.direction === "incoming" && load.status === "planned" && ownTransport ? (
                              <span className="inline-flex w-full justify-center rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-center text-[10px] font-semibold text-blue-800">Waiting for Driver arrival</span>
                            ) : load.direction === "incoming" && load.status === "planned" ? (
                              <form action={markLoadArrivedAction} className="w-full"><input type="hidden" name="loadId" value={load.id} /><input type="hidden" name="returnDate" value={selectedDate} /><button className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white">Mark external carrier arrived</button></form>
                            ) : load.direction === "incoming" && load.status === "arrived" ? (
                              <div className="grid w-full gap-2">
                                <form action={acceptLoadAction} className="w-full"><input type="hidden" name="loadId" value={load.id} /><input type="hidden" name="returnDate" value={selectedDate} /><button className="w-full rounded-lg bg-orange-500 px-3.5 py-2 text-xs font-bold text-black">Accept load</button></form>
                                <RejectLoadModal loadId={load.id} returnDate={selectedDate} jobNumber={job.jobNumber} loadNumber={load.loadNumber} />
                              </div>
                            ) : load.direction === "incoming" && load.status === "accepted" ? (
                              <form action={completeIncomingLoadAction} className="w-full"><input type="hidden" name="loadId" value={load.id} /><input type="hidden" name="returnDate" value={selectedDate} /><button className="w-full rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white">Complete transaction</button></form>
                            ) : load.direction === "outgoing" && !terminal ? (
                              <form action={completeOutgoingLoadAction} className="w-full"><input type="hidden" name="loadId" value={load.id} /><input type="hidden" name="returnDate" value={selectedDate} /><button className="w-full rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white">Complete</button></form>
                            ) : load.status === "rejected" ? (
                              <div className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-left">
                                <p className="m-0 text-[9px] font-bold uppercase tracking-[0.12em] text-red-600">{rejection?.authority === "DRIVER" ? "Driver refusal" : "Receiving-site refusal"}</p>
                                <p className="mt-1 text-xs font-bold text-red-800">{rejection?.categoryLabel ?? "Rejected"}</p>
                                <p className="mt-1 line-clamp-4 text-[11px] leading-4 text-red-700">{rejection?.reason ?? "Rejection recorded in operational notes."}</p>
                              </div>
                            ) : load.status === "cancelled" ? (
                              <span className="inline-flex w-full justify-center rounded-lg bg-black/5 px-3 py-2 text-xs font-semibold text-black/45">Cancelled</span>
                            ) : null}

                            {!terminal && (load.status === "arrived" || load.status === "accepted") && (
                              <details className="w-full">
                                <summary className="cursor-pointer list-none text-right text-[11px] font-semibold text-black/40 hover:text-orange-700">Site details / weight</summary>
                                <div className="mt-2 rounded-xl border border-black/10 bg-[#fbfaf7] p-3">
                                  <form action={saveLoadDetailsAction} className="grid gap-2">
                                    <input type="hidden" name="loadId" value={load.id} />
                                    <input type="hidden" name="returnDate" value={selectedDate} />
                                    <label><FieldLabel>Waste description</FieldLabel><input name="wasteDescription" defaultValue={load.wasteDescriptionSnapshot ?? ""} required className="mt-1 h-9 w-full min-w-[270px] rounded-lg border border-black/10 bg-white px-2.5 text-xs" /></label>
                                    <div className="grid grid-cols-2 gap-2">
                                      <label><FieldLabel>Driver</FieldLabel><select name="driverId" defaultValue={load.driverId ?? ""} className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"><option value="">None</option>{availableDrivers.map((driver) => <option key={driver.id} value={driver.id}>{driver.name}</option>)}</select></label>
                                      <label><FieldLabel>Vehicle</FieldLabel><select name="vehicleId" defaultValue={load.vehicleId ?? ""} className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"><option value="">None</option>{availableVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.registrationNumber}</option>)}</select></label>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2">
                                      <WeightInput label="Gross" name="grossWeight" value={load.grossWeight} />
                                      <WeightInput label="Tare" name="tareWeight" value={load.tareWeight ?? vehicleTareForMetric(load.vehicle?.tareWeightKg, load.weightMetric)} />
                                      <WeightInput label="Net" name="netWeight" value={load.netWeight} />
                                    </div>
                                    <label><FieldLabel>Unit</FieldLabel><select name="weightMetric" defaultValue={load.weightMetric} className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs"><option value="Tonnes">Tonnes</option><option value="Kilograms">Kilograms</option><option value="Grams">Grams</option></select></label>
                                    <label><FieldLabel>Notes</FieldLabel><input name="notes" defaultValue={load.notes ?? ""} className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs" /></label>
                                    <label className="flex items-center gap-2 text-[11px] font-medium text-black/50"><input type="checkbox" name="weightIsEstimate" defaultChecked={load.weightIsEstimate} className="size-3.5 accent-orange-500" />Estimated quantity</label>
                                    <button type="submit" className="h-9 rounded-lg bg-black px-3 text-xs font-semibold text-white">Save site details</button>
                                  </form>
                                </div>
                              </details>
                            )}

                            {load.status === "planned" && (
                              <details className="w-full"><summary className="cursor-pointer list-none text-right text-[11px] font-semibold text-black/35">More</summary><form action={cancelPlannedLoadAction} className="mt-2 rounded-xl border border-black/10 bg-[#fbfaf7] p-3"><input type="hidden" name="loadId" value={load.id} /><input type="hidden" name="returnDate" value={selectedDate} /><input name="reason" placeholder="Optional cancellation reason" className="h-9 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs" /><button type="submit" className="mt-1.5 h-9 w-full rounded-lg border border-black/10 px-3 text-xs font-semibold text-black/50">Cancel load</button></form></details>
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

function WorksheetTab({
  href,
  active,
  label,
  count,
  tone,
}: {
  href: string;
  active: boolean;
  label: string;
  count: number;
  tone: "orange" | "red" | "green" | "grey";
}) {
  const countClass =
    tone === "red"
      ? "bg-red-100 text-red-800"
      : tone === "green"
        ? "bg-emerald-100 text-emerald-800"
        : tone === "grey"
          ? "bg-black/10 text-black/55"
          : "bg-orange-500 text-black";
  return (
    <Link href={href} className={`rounded-xl px-4 py-2.5 text-xs font-semibold ${active ? "bg-black text-white" : "text-black/45"}`}>
      {label} <span className={`ml-2 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${countClass}`}>{count}</span>
    </Link>
  );
}

function TicketActions({ loadId, ticketNumber }: { loadId: string; ticketNumber: string }) {
  return (
    <div className="flex w-full flex-col gap-1.5">
      <span className="truncate text-[9px] font-semibold text-emerald-700">{ticketNumber}</span>
      <a href={`/api/operations/weighbridge-tickets/${loadId}/print?auto=1`} target="_blank" rel="noreferrer" className="inline-flex w-full justify-center rounded-lg bg-black px-3 py-2 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black">Print ticket</a>
      <a href={`/api/operations/weighbridge-tickets/${loadId}/pdf`} className="inline-flex w-full justify-center rounded-lg border border-black/10 bg-white px-3 py-2 text-[10px] font-semibold text-black/55">Download PDF</a>
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
    notes: string | null;
    vehicle: { tareWeightKg: string | null } | null;
  };
  returnDate: string;
}) {
  const storedVehicleTare = vehicleTareForMetric(load.vehicle?.tareWeightKg, load.weightMetric);
  const effectiveTare = load.tareWeight ?? storedVehicleTare;
  const hasStoredVehicleTare = storedVehicleTare !== null;

  return (
    <form action={saveLoadDetailsAction} className="min-w-[250px]">
      <input type="hidden" name="loadId" value={load.id} />
      <input type="hidden" name="returnDate" value={returnDate} />
      <input type="hidden" name="driverId" value={load.driverId ?? ""} />
      <input type="hidden" name="vehicleId" value={load.vehicleId ?? ""} />
      <input type="hidden" name="wasteDescription" value={load.wasteDescriptionSnapshot ?? ""} />
      <input type="hidden" name="weightMetric" value={load.weightMetric} />
      <input type="hidden" name="netWeight" value={load.netWeight ?? ""} />
      <input type="hidden" name="notes" value={load.notes ?? ""} />
      {load.weightIsEstimate && <input type="hidden" name="weightIsEstimate" value="on" />}
      {effectiveTare !== null && <input type="hidden" name="tareWeight" value={effectiveTare} />}

      <div className="grid grid-cols-[82px_108px_auto] items-end gap-1.5">
        <label>
          <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">Gross</span>
          <input type="number" min="0" step="0.001" name="grossWeight" defaultValue={load.grossWeight ?? ""} placeholder="0" className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs font-semibold" />
        </label>
        {hasStoredVehicleTare && effectiveTare !== null ? (
          <div>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">Tare</span>
            <div className="mt-1 flex h-9 items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2"><span className="truncate text-xs font-semibold text-emerald-800">{formatWeight(effectiveTare)} {weightUnit(load.weightMetric)}</span></div>
          </div>
        ) : (
          <label>
            <span className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">Tare</span>
            <input type="number" min="0" step="0.001" name="tareWeight" defaultValue={load.tareWeight ?? ""} placeholder="0" className="mt-1 h-9 w-full rounded-lg border border-orange-200 bg-orange-50 px-2 text-xs font-semibold" />
          </label>
        )}
        <button type="submit" className="h-9 rounded-lg border border-black/10 bg-black px-3 text-[10px] font-semibold text-white hover:bg-orange-500 hover:text-black">Save</button>
      </div>
    </form>
  );
}

function WeightInput({ label, name, value }: { label: string; name: string; value: string | null }) {
  return <label><FieldLabel>{label}</FieldLabel><input type="number" min="0" step="0.001" name={name} defaultValue={value ?? ""} className="mt-1 h-9 w-full rounded-lg border border-black/10 bg-white px-2 text-xs" /></label>;
}

function MetricCard({ label, value, highlight = false, danger = false }: { label: string; value: number | string; highlight?: boolean; danger?: boolean }) {
  const cardClass = danger ? "border-red-200 bg-red-50" : highlight ? "border-orange-200 bg-orange-50" : "border-black/10 bg-white";
  return <div className={`rounded-[20px] border px-4 py-3.5 shadow-sm ${cardClass}`}><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p><p className={`mt-1.5 text-2xl font-semibold ${danger ? "text-red-700" : "text-black"}`}>{value}</p></div>;
}

function Th({ children, alignRight = false }: { children: React.ReactNode; alignRight?: boolean }) {
  return <th className={`px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35 ${alignRight ? "text-right" : ""}`}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3.5">{children}</td>;
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">{children}</span>;
}
