import Link from "next/link";
/* WASTE_X_JOB_SPECIFIC_PRICING_V2 */
import { and, asc, eq, inArray } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { jobCommercialLines } from "@/db/commercial-schema";
import { syncEventInbox } from "@/db/client-sync-schema";
import { database } from "@/db/database";
import { jobLoadFieldStates } from "@/db/mobile-field-schema";
import {
  counterparties,
  counterpartySites,
  drivers,
  jobLoads,
  jobs,
  materialProfiles,
  sitePermits,
  sites,
  users,
  vehicles,
} from "@/db/schema";

import { calculateJobCommercials } from "@/modules/commercial/jobCommercials";
import { createTemplateFromJobAction } from "../templates/actions";

const DRIVER_ACTIVITY_EVENT_TYPES = [
  "FIELD_COLLECTION_REJECTED",
  "FIELD_COLLECTED",
  "FIELD_IN_TRANSIT",
  "FIELD_ARRIVED_DESTINATION",
  "FIELD_DELIVERY_NOTE_ADDED",
  "FIELD_ISSUE_REPORTED",
];

const DRIVER_WORKFLOW_STEPS = [
  { key: "ASSIGNED", label: "Assigned" },
  { key: "COLLECTED", label: "Collected" },
  { key: "IN_TRANSIT", label: "In transit" },
  { key: "ARRIVED_DESTINATION", label: "At destination" },
] as const;

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function formatDateTime(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function money(value: string | null, currency: string) {
  if (!value) return "—";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return value;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(amount);
}

function human(value: string) {
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function driverStepLabel(value: string | null | undefined) {
  switch (value) {
    case "COLLECTED":
      return "Collected";
    case "IN_TRANSIT":
      return "In transit";
    case "ARRIVED_DESTINATION":
      return "At destination";
    default:
      return "Assigned";
  }
}

function payloadText(payload: unknown, key: string) {
  if (!payload || typeof payload !== "object") return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function driverEventLabel(eventType: string) {
  switch (eventType) {
    case "FIELD_COLLECTION_REJECTED":
      return "Collection rejected by Driver";
    case "FIELD_COLLECTED":
      return "Driver marked collected";
    case "FIELD_IN_TRANSIT":
      return "Driver marked in transit";
    case "FIELD_ARRIVED_DESTINATION":
      return "Driver arrived at destination";
    case "FIELD_DELIVERY_NOTE_ADDED":
      return "Driver arrival note";
    case "FIELD_ISSUE_REPORTED":
      return "Driver reported an issue";
    default:
      return human(eventType);
  }
}

function driverEventDetail(eventType: string, payload: unknown) {
  if (eventType === "FIELD_COLLECTION_REJECTED") {
    return payloadText(payload, "reason");
  }
  if (eventType === "FIELD_DELIVERY_NOTE_ADDED") {
    return payloadText(payload, "note");
  }
  if (eventType === "FIELD_ISSUE_REPORTED") {
    const issueType = payloadText(payload, "issueType");
    const summary = payloadText(payload, "summary");
    return [issueType ? human(issueType) : null, summary].filter(Boolean).join(" · ") || null;
  }
  return null;
}

function latestRejectionNote(notes: string | null) {
  if (!notes) return null;
  const lines = notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(
      (line) =>
        line.startsWith("[DRIVER COLLECTION REJECTED ·") ||
        line.startsWith("[REJECTED ·"),
    );
  return lines.at(-1) ?? null;
}

function siteControlLabel(input: {
  direction: string;
  status: string;
  haulierCounterpartyId: string | null;
  ticketNumber: string | null;
}) {
  if (input.direction !== "incoming") return human(input.status);

  switch (input.status) {
    case "planned":
      return input.haulierCounterpartyId
        ? "Waiting for carrier arrival"
        : "Waiting for Driver arrival";
    case "arrived":
      return "Awaiting site accept / reject";
    case "accepted":
      return "Accepted · finalise weight";
    case "rejected":
      return "Rejected";
    case "completed":
      return input.ticketNumber
        ? "Completed · site ticket issued"
        : "Completed · site ticket ready";
    case "cancelled":
      return "Cancelled";
    default:
      return human(input.status);
  }
}

function statusTone(status: string) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "accepted":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "arrived":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "rejected":
    case "cancelled":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-black/10 bg-black/5 text-black/55";
  }
}

export default async function JobDetailPage({
  params,
  searchParams,
}: {
  params: { jobId: string };
  searchParams?: {
    templateSaved?: string | string[];
    templateError?: string | string[];
  };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { organisationId: true },
  });

  if (!currentUser?.organisationId) redirect("/home/settings/organisation");

  const [job] = await database
    .select({
      id: jobs.id,
      jobNumber: jobs.jobNumber,
      jobDate: jobs.jobDate,
      status: jobs.status,
      direction: jobs.direction,
      plannedLoads: jobs.plannedLoads,
      purchaseOrder: jobs.purchaseOrder,
      customerReference: jobs.customerReference,
      notes: jobs.notes,
      thirdPartyDestinationSiteId: jobs.thirdPartyDestinationSiteId,
      clientName: counterparties.name,
      clientSiteName: counterpartySites.name,
      clientSitePostcode: counterpartySites.postcode,
      receivingSiteName: sites.name,
      permitNumber: sitePermits.permitNumber,
      materialName: materialProfiles.name,
      driverName: drivers.name,
      vehicleRegistration: vehicles.registrationNumber,
    })
    .from(jobs)
    .leftJoin(counterparties, eq(jobs.clientCounterpartyId, counterparties.id))
    .leftJoin(counterpartySites, eq(jobs.clientSiteId, counterpartySites.id))
    .leftJoin(sites, eq(jobs.ownSiteId, sites.id))
    .leftJoin(sitePermits, eq(jobs.sitePermitId, sitePermits.id))
    .leftJoin(materialProfiles, eq(jobs.materialProfileId, materialProfiles.id))
    .leftJoin(drivers, eq(jobs.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobs.vehicleId, vehicles.id))
    .where(
      and(
        eq(jobs.id, params.jobId),
        eq(jobs.organisationId, currentUser.organisationId),
      ),
    )
    .limit(1);

  if (!job) notFound();

  const [haulier] = await database
    .select({ name: counterparties.name })
    .from(jobs)
    .leftJoin(counterparties, eq(jobs.haulierCounterpartyId, counterparties.id))
    .where(
      and(
        eq(jobs.id, params.jobId),
        eq(jobs.organisationId, currentUser.organisationId),
      ),
    )
    .limit(1);

  const loads = await database
    .select({
      id: jobLoads.id,
      loadNumber: jobLoads.loadNumber,
      direction: jobLoads.direction,
      status: jobLoads.status,
      ewcCode: jobLoads.ewcCodeSnapshot,
      wasteDescription: jobLoads.wasteDescriptionSnapshot,
      customerChargeAmount: jobLoads.customerChargeAmount,
      customerChargeUnit: jobLoads.customerChargeUnit,
      haulageCostAmount: jobLoads.haulageCostAmount,
      haulageCostUnit: jobLoads.haulageCostUnit,
      currency: jobLoads.currency,
      ticketNumber: jobLoads.ticketNumber,
      grossWeight: jobLoads.grossWeight,
      tareWeight: jobLoads.tareWeight,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
      weightSource: jobLoads.weightSource,
      movementAt: jobLoads.movementAt,
      receivedAt: jobLoads.receivedAt,
      completedAt: jobLoads.completedAt,
      notes: jobLoads.notes,
      haulierCounterpartyId: jobLoads.haulierCounterpartyId,
      driverName: drivers.name,
      vehicleRegistration: vehicles.registrationNumber,
      haulierName: counterparties.name,
    })
    .from(jobLoads)
    .leftJoin(drivers, eq(jobLoads.driverId, drivers.id))
    .leftJoin(vehicles, eq(jobLoads.vehicleId, vehicles.id))
    .leftJoin(counterparties, eq(jobLoads.haulierCounterpartyId, counterparties.id))
    .where(
      and(
        eq(jobLoads.jobId, job.id),
        eq(jobLoads.organisationId, currentUser.organisationId),
      ),
    )
    .orderBy(asc(jobLoads.loadNumber));

  const loadIds = loads.map((load) => load.id);

  const fieldStates = loadIds.length
    ? await database
        .select({
          jobLoadId: jobLoadFieldStates.jobLoadId,
          step: jobLoadFieldStates.step,
          lastEventType: jobLoadFieldStates.lastEventType,
          occurredAt: jobLoadFieldStates.occurredAt,
          updatedAt: jobLoadFieldStates.updatedAt,
        })
        .from(jobLoadFieldStates)
        .where(
          and(
            eq(jobLoadFieldStates.organisationId, currentUser.organisationId),
            inArray(jobLoadFieldStates.jobLoadId, loadIds),
          ),
        )
    : [];

  const fieldEvents = loadIds.length
    ? await database
        .select({
          entityId: syncEventInbox.entityId,
          eventType: syncEventInbox.eventType,
          payload: syncEventInbox.payload,
          occurredAt: syncEventInbox.occurredAt,
        })
        .from(syncEventInbox)
        .where(
          and(
            eq(syncEventInbox.organisationId, currentUser.organisationId),
            eq(syncEventInbox.entityType, "job_load"),
            eq(syncEventInbox.resultStatus, "APPLIED"),
            inArray(syncEventInbox.entityId, loadIds),
            inArray(syncEventInbox.eventType, DRIVER_ACTIVITY_EVENT_TYPES),
          ),
        )
        .orderBy(asc(syncEventInbox.occurredAt))
    : [];

  const fieldStateByLoadId = new Map(
    fieldStates.map((state) => [state.jobLoadId, state]),
  );
  const fieldEventsByLoadId = new Map<
    string,
    Array<(typeof fieldEvents)[number]>
  >();
  for (const event of fieldEvents) {
    const existing = fieldEventsByLoadId.get(event.entityId) ?? [];
    existing.push(event);
    fieldEventsByLoadId.set(event.entityId, existing);
  }

  const commercialLines = await database.query.jobCommercialLines.findMany({
    where: and(
      eq(jobCommercialLines.organisationId, currentUser.organisationId),
      eq(jobCommercialLines.jobId, job.id),
      eq(jobCommercialLines.isActive, true),
    ),
    orderBy: (line, { asc: lineAsc }) => [
      lineAsc(line.sortOrder),
      lineAsc(line.createdAt),
    ],
  });

  const commercialSummary = calculateJobCommercials({
    lines: commercialLines,
    loads,
  });

  const outgoingDestination =
    job.direction === "outgoing" && job.thirdPartyDestinationSiteId
      ? await database.query.counterpartySites.findFirst({
          where: and(
            eq(counterpartySites.id, job.thirdPartyDestinationSiteId),
            eq(
              counterpartySites.organisationId,
              currentUser.organisationId,
            ),
          ),
          columns: {
            name: true,
            postcode: true,
          },
          with: {
            counterparty: {
              columns: {
                name: true,
              },
            },
          },
        })
      : null;

  const originLabel =
    job.direction === "outgoing"
      ? job.receivingSiteName ?? "Own site"
      : [job.clientSiteName, job.clientSitePostcode]
          .filter(Boolean)
          .join(" · ") || "—";

  const destinationLabel =
    job.direction === "outgoing"
      ? [outgoingDestination?.name, outgoingDestination?.postcode]
          .filter(Boolean)
          .join(" · ") || "—"
      : job.receivingSiteName ?? "—";

  const completedLoads = loads.filter((load) => load.status === "completed").length;
  const arrivedLoads = loads.filter((load) => load.status === "arrived").length;
  const rejectedLoads = loads.filter((load) => load.status === "rejected").length;
  const issuedTickets = loads.filter((load) => Boolean(load.ticketNumber)).length;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 py-32 pl-[24vw]">
      <div className="mx-auto max-w-7xl space-y-7">
        <section className="relative overflow-hidden rounded-[2rem] bg-black p-8 text-white">
          <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-orange-400">
                Booked Job
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                {job.jobNumber}
              </h1>
              <p className="mt-3 text-sm text-white/55">
                {formatDate(job.jobDate)} · {job.clientName ?? "No client"}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <span className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-black">
                {job.status.replaceAll("_", " ")}
              </span>
              <Link
                href={`/home/jobs/new?repeat=${job.id}`}
                className="rounded-full bg-orange-500 px-4 py-2 text-xs font-bold text-black transition hover:bg-orange-400"
              >
                Repeat job
              </Link>
              <Link
                href={`/home/jobs/new?duplicate=${job.id}`}
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                Duplicate
              </Link>
              <Link
                href="/home/jobs/templates"
                className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/80 transition hover:bg-white/10"
              >
                Templates
              </Link>
            </div>
          </div>
        </section>

        {(searchParams?.templateSaved || searchParams?.templateError) && (
          <section
            className={`rounded-2xl border px-5 py-4 text-sm ${
              searchParams.templateSaved
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-red-200 bg-red-50 text-red-800"
            }`}
          >
            {searchParams.templateSaved
              ? "✓ Job template saved. You can now reuse it from Book a Job."
              : "The template could not be saved. Use a unique template name and try again."}
          </section>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Origin" value={originLabel} />
          <Info label="Destination" value={destinationLabel} />
          <Info label="Transport" value={haulier?.name ?? "Own transport"} />
          <Info label="Vehicle" value={job.vehicleRegistration ?? "Assign later"} />
          <Info label="Driver" value={job.driverName ?? "Assign later"} />
          <Info label="Material" value={job.materialName ?? "—"} />
          <Info label="Permit" value={job.permitNumber ?? "—"} />
          <Info label="Planned loads" value={String(job.plannedLoads)} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Operational journey
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-black">
                Driver hand-off → receiving site
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                Driver Mobile records collection, transit and destination arrival. The receiving site then owns acceptance or rejection, final weight, completion and the site ticket. Any Driver collection refusal or field note remains attached to the load.
              </p>
            </div>

            <Link
              href={`/home/worksheet?date=${job.jobDate.toISOString().slice(0, 10)}`}
              className="inline-flex shrink-0 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Open Daily Operations
            </Link>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Completed loads" value={String(completedLoads)} />
            <Metric label="Awaiting site decision" value={String(arrivedLoads)} />
            <Metric label="Rejected loads" value={String(rejectedLoads)} />
            <Metric label="Site tickets issued" value={String(issuedTickets)} />
          </div>

          <div className="mt-6 space-y-4">
            {loads.map((load) => {
              const fieldState = fieldStateByLoadId.get(load.id);
              const events = fieldEventsByLoadId.get(load.id) ?? [];
              const collectionRejectionEvent = events.find(
                (event) => event.eventType === "FIELD_COLLECTION_REJECTED",
              );
              const rejectionNote = latestRejectionNote(load.notes);
              const driverRejected = Boolean(collectionRejectionEvent);
              const driverStep = fieldState?.step ?? "ASSIGNED";
              const driverStepIndex = DRIVER_WORKFLOW_STEPS.findIndex(
                (step) => step.key === driverStep,
              );
              const actualTransport =
                load.haulierName ??
                (load.haulierCounterpartyId ? "External carrier" : "Own transport");

              return (
                <article
                  key={load.id}
                  className="rounded-[1.5rem] border border-black/10 bg-[#faf8f4] p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.18em] text-black/35">
                        Load {load.loadNumber} · {actualTransport}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <h3 className="text-lg font-semibold text-black">
                          {load.ewcCode ?? "EWC pending"}
                        </h3>
                        <span
                          className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${statusTone(load.status)}`}
                        >
                          {human(load.status)}
                        </span>
                      </div>
                      <p className="mt-2 max-w-2xl text-sm text-black/50">
                        {load.wasteDescription ?? "Waste description pending"}
                      </p>
                    </div>

                    <div className="grid min-w-full gap-2 sm:grid-cols-2 lg:min-w-[520px] lg:grid-cols-4">
                      <MiniInfo
                        label="Driver progress"
                        value={
                          driverRejected
                            ? "Collection rejected"
                            : load.haulierCounterpartyId
                              ? "External carrier"
                              : driverStepLabel(driverStep)
                        }
                      />
                      <MiniInfo
                        label="Site control"
                        value={siteControlLabel(load)}
                      />
                      <MiniInfo
                        label="Final weight"
                        value={
                          load.netWeight
                            ? `${load.netWeight} ${load.weightMetric}`
                            : "Pending"
                        }
                      />
                      <MiniInfo
                        label="Site ticket"
                        value={load.ticketNumber ?? "Not issued"}
                      />
                    </div>
                  </div>

                  {!load.haulierCounterpartyId && !driverRejected ? (
                    <div className="mt-5 grid gap-2 sm:grid-cols-4">
                      {DRIVER_WORKFLOW_STEPS.map((step, index) => {
                        const reached = index <= driverStepIndex;
                        const current = index === driverStepIndex;
                        return (
                          <div
                            key={step.key}
                            className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                              current
                                ? "border-orange-300 bg-orange-50 text-orange-800"
                                : reached
                                  ? "border-black bg-black text-white"
                                  : "border-black/10 bg-white text-black/30"
                            }`}
                          >
                            {step.label}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <MiniInfo
                      label="Driver"
                      value={load.driverName ?? job.driverName ?? "Not assigned"}
                    />
                    <MiniInfo
                      label="Vehicle"
                      value={
                        load.vehicleRegistration ??
                        job.vehicleRegistration ??
                        "Not assigned"
                      }
                    />
                    <MiniInfo
                      label="Arrived / received"
                      value={formatDateTime(load.receivedAt)}
                    />
                    <MiniInfo
                      label="Completed"
                      value={formatDateTime(load.completedAt)}
                    />
                  </div>

                  {(load.grossWeight || load.tareWeight || load.netWeight) && (
                    <div className="mt-3 grid gap-3 sm:grid-cols-4">
                      <MiniInfo
                        label="Gross"
                        value={
                          load.grossWeight
                            ? `${load.grossWeight} ${load.weightMetric}`
                            : "—"
                        }
                      />
                      <MiniInfo
                        label="Tare"
                        value={
                          load.tareWeight
                            ? `${load.tareWeight} ${load.weightMetric}`
                            : "—"
                        }
                      />
                      <MiniInfo
                        label="Net"
                        value={
                          load.netWeight
                            ? `${load.netWeight} ${load.weightMetric}`
                            : "—"
                        }
                      />
                      <MiniInfo
                        label="Weight source"
                        value={human(load.weightSource)}
                      />
                    </div>
                  )}

                  {(driverRejected || (load.status === "rejected" && rejectionNote)) && (
                    <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-red-700">
                        {driverRejected
                          ? "Driver pre-collection refusal"
                          : "Receiving-site rejection"}
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-red-900">
                        {collectionRejectionEvent
                          ? payloadText(collectionRejectionEvent.payload, "reason") ??
                            rejectionNote ??
                            "Reason recorded with the load."
                          : rejectionNote}
                      </p>
                    </div>
                  )}

                  {events.length > 0 && (
                    <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">
                          Driver activity
                        </p>
                        <p className="text-[10px] text-black/35">
                          Mobile field record
                        </p>
                      </div>
                      <div className="mt-3 divide-y divide-black/5">
                        {events.map((event, index) => {
                          const detail = driverEventDetail(
                            event.eventType,
                            event.payload,
                          );
                          return (
                            <div
                              key={`${event.eventType}-${event.occurredAt.toISOString()}-${index}`}
                              className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between sm:gap-5"
                            >
                              <div>
                                <p className="text-xs font-semibold text-black/75">
                                  {driverEventLabel(event.eventType)}
                                </p>
                                {detail && (
                                  <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-black/50">
                                    {detail}
                                  </p>
                                )}
                              </div>
                              <p className="shrink-0 text-[10px] text-black/35">
                                {formatDateTime(event.occurredAt)}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {load.notes && (
                    <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-black/35">
                        Operational notes
                      </p>
                      <p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-black/55">
                        {load.notes}
                      </p>
                    </div>
                  )}

                  {load.ticketNumber && (
                    <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-emerald-700">
                          Receiving-site ticket
                        </p>
                        <p className="mt-1 text-sm font-semibold text-emerald-950">
                          {load.ticketNumber}
                        </p>
                        <p className="mt-1 text-xs text-emerald-800/70">
                          Issued by the receiving site. Driver Mobile receives this ticket read-only.
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`/api/operations/weighbridge-tickets/${load.id}/print`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-xl bg-black px-4 py-2 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black"
                        >
                          Open / print
                        </a>
                        <a
                          href={`/api/operations/weighbridge-tickets/${load.id}/pdf`}
                          className="rounded-xl border border-emerald-300 bg-white px-4 py-2 text-xs font-semibold text-emerald-900"
                        >
                          Download PDF
                        </a>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}

            {!loads.length && (
              <div className="rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] p-5 text-sm text-black/45">
                No loads have been created for this job yet.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Job-specific commercial terms
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-black">
                This Job&apos;s price
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                These terms belong to {job.jobNumber} only. A Rate Library value
                may have been used as a suggestion, but the Job lines below are
                the commercial authority and can be changed before invoicing.
              </p>
            </div>

            <Link
              href={`/home/commercial#job-${job.id}`}
              className="inline-flex shrink-0 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Set / edit Job pricing
            </Link>
          </div>

          {commercialLines.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] p-5 text-sm text-black/45">
              No Job-specific commercial terms have been set yet. This does not
              block operations; add them here or from Commercial & Invoicing.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {commercialLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-black/10 bg-[#faf8f4] p-4"
                >
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">
                    {line.kind === "revenue" ? "Revenue" : "Direct cost"} ·{" "}
                    {line.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {line.description}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-black">
                    {money(line.amount, line.currency)} / {line.unit}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Info
              label="Completed loads"
              value={String(commercialSummary.completedLoads)}
              compact
            />
            <Info
              label="Actual tonnes"
              value={String(commercialSummary.tonnes)}
              compact
            />
            <Info
              label="Revenue"
              value={money(commercialSummary.revenue.toFixed(2), "GBP")}
              compact
            />
            <Info
              label="Margin"
              value={money(commercialSummary.margin.toFixed(2), "GBP")}
              compact
            />
          </div>
        </section>

        <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-6">
          <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-700">
                Reuse this setup
              </p>
              <h2 className="mt-2 text-xl font-semibold text-black">
                Save as a job template
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-black/50">
                Templates keep the recurring client, origin, material, transport and load defaults.
                The next booking still opens for review before anything is created.
              </p>
            </div>

            <form
              action={createTemplateFromJobAction}
              className="flex w-full max-w-xl flex-col gap-3 sm:flex-row"
            >
              <input type="hidden" name="jobId" value={job.id} />
              <input
                name="name"
                required
                minLength={2}
                maxLength={120}
                defaultValue={`${job.clientName ?? job.jobNumber} · ${job.materialName ?? "Job"}`}
                className="h-11 min-w-0 flex-1 rounded-2xl border border-orange-200 bg-white px-4 text-sm text-black outline-none focus:border-orange-500"
              />
              <button
                type="submit"
                className="h-11 rounded-2xl bg-black px-5 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
              >
                Save template
              </button>
            </form>
          </div>
        </section>

        {(job.purchaseOrder || job.customerReference || job.notes) && (
          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-black">Booking notes</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Info label="PO" value={job.purchaseOrder ?? "—"} compact />
              <Info
                label="Customer reference"
                value={job.customerReference ?? "—"}
                compact
              />
            </div>
            {job.notes && (
              <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-black/60">
                {job.notes}
              </p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Info({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? ""
          : "rounded-2xl border border-black/10 bg-white p-5 shadow-sm"
      }
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#faf8f4] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}

function MiniInfo({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5">
      <p className="text-[8px] font-semibold uppercase tracking-[0.13em] text-black/30">
        {label}
      </p>
      <p className="mt-1 text-xs font-semibold leading-5 text-black/70">{value}</p>
    </div>
  );
}
