import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { notFound, redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
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

import { createTemplateFromJobAction } from "../templates/actions";

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
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
      status: jobLoads.status,
      ewcCode: jobLoads.ewcCodeSnapshot,
      wasteDescription: jobLoads.wasteDescriptionSnapshot,
      customerChargeAmount: jobLoads.customerChargeAmount,
      customerChargeUnit: jobLoads.customerChargeUnit,
      haulageCostAmount: jobLoads.haulageCostAmount,
      haulageCostUnit: jobLoads.haulageCostUnit,
      currency: jobLoads.currency,
      ticketNumber: jobLoads.ticketNumber,
      netWeight: jobLoads.netWeight,
      weightMetric: jobLoads.weightMetric,
    })
    .from(jobLoads)
    .where(
      and(
        eq(jobLoads.jobId, job.id),
        eq(jobLoads.organisationId, currentUser.organisationId),
      ),
    )
    .orderBy(asc(jobLoads.loadNumber));

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
          <Info label="Origin" value={[job.clientSiteName, job.clientSitePostcode].filter(Boolean).join(" · ") || "—"} />
          <Info label="Destination" value={job.receivingSiteName ?? "—"} />
          <Info label="Transport" value={haulier?.name ?? "Own transport"} />
          <Info label="Vehicle" value={job.vehicleRegistration ?? "Assign later"} />
          <Info label="Driver" value={job.driverName ?? "Assign later"} />
          <Info label="Material" value={job.materialName ?? "—"} />
          <Info label="Permit" value={job.permitNumber ?? "—"} />
          <Info label="Planned loads" value={String(job.plannedLoads)} />
        </section>

        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">
                Planned movements
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-black">Loads</h2>
            </div>
            <p className="text-xs text-black/40">
              Actual weights, receipt times and DWT are completed during operations.
            </p>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-black/35">
                  <th className="px-3 py-3 font-semibold">Load</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">EWC</th>
                  <th className="px-3 py-3 font-semibold">Customer rate</th>
                  <th className="px-3 py-3 font-semibold">Haulage cost</th>
                  <th className="px-3 py-3 font-semibold">Actual weight</th>
                  <th className="px-3 py-3 font-semibold">Ticket</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((load) => (
                  <tr key={load.id} className="border-b border-black/5 last:border-0">
                    <td className="px-3 py-4 font-semibold text-black">#{load.loadNumber}</td>
                    <td className="px-3 py-4">
                      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-semibold text-black/55">
                        {load.status}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <p className="font-medium text-black">{load.ewcCode ?? "—"}</p>
                      <p className="mt-1 max-w-xs truncate text-xs text-black/40">
                        {load.wasteDescription ?? ""}
                      </p>
                    </td>
                    <td className="px-3 py-4 text-black/65">
                      {load.customerChargeAmount
                        ? `${money(load.customerChargeAmount, load.currency)} / ${load.customerChargeUnit ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-4 text-black/65">
                      {load.haulageCostAmount
                        ? `${money(load.haulageCostAmount, load.currency)} / ${load.haulageCostUnit ?? "—"}`
                        : "—"}
                    </td>
                    <td className="px-3 py-4 text-black/45">
                      {load.netWeight ? `${load.netWeight} ${load.weightMetric}` : "Pending"}
                    </td>
                    <td className="px-3 py-4 text-black/45">{load.ticketNumber ?? "Pending"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <Info label="Customer reference" value={job.customerReference ?? "—"} compact />
            </div>
            {job.notes && <p className="mt-5 whitespace-pre-wrap text-sm leading-6 text-black/60">{job.notes}</p>}
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
    <div className={compact ? "" : "rounded-2xl border border-black/10 bg-white p-5 shadow-sm"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>
      <p className="mt-2 text-sm font-semibold text-black">{value}</p>
    </div>
  );
}
