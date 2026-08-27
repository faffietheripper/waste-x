import Link from "next/link";
/* WASTE_X_JOB_SPECIFIC_PRICING_V2 */
import type { ReactNode } from "react";
import { and, desc, eq, inArray, isNull, ne } from "drizzle-orm";

import {
  commercialSettings,
  customerInvoiceJobs,
  customerInvoices,
  jobCommercialLines,
} from "@/db/commercial-schema";
import { database } from "@/db/database";
import { jobs } from "@/db/schema";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import { calculateJobCommercials } from "@/modules/commercial/jobCommercials";

import {
  addCustomJobCommercialLineAction,
  archiveJobCommercialLineAction,
  createDraftInvoiceAction,
  issueInvoiceAction,
  markInvoicePaidAction,
  saveCommercialSettingsAction,
  saveCoreJobPricingAction,
  sendInvoiceEmailAction,
  useLegacyPriceSuggestionAction,
  voidDraftInvoiceAction,
} from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = {
  success?: string | string[];
  error?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function money(value: number | string) {
  const amount = Number(value);
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number.isFinite(amount) ? amount : 0);
}

function tonnes(value: number) {
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)} t`;
}

function date(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(value);
}

function unitLabel(unit: string) {
  if (unit === "tonne") return "tonne";
  if (unit === "load") return "load";
  return "job";
}

const SUCCESS_MESSAGES: Record<string, string> = {
  job_pricing_saved: "Job-specific pricing saved.",
  commercial_line_added: "Commercial line added to the Job.",
  commercial_line_archived: "Commercial line removed from future calculations.",
  legacy_price_applied: "Legacy Rate/Load price copied as this Job's confirmed price.",
  invoice_draft_created: "Draft customer invoice created.",
  invoice_issued: "Invoice issued with a sequential invoice number.",
  invoice_paid: "Invoice marked as paid.",
  invoice_voided: "Draft invoice voided.",
  invoice_emailed: "Invoice emailed to the customer.",
  commercial_settings_saved: "Invoice identity and commercial defaults saved.",
};

const ERROR_MESSAGES: Record<string, string> = {
  job_required: "Choose a Job first.",
  job_not_found: "That Job could not be found.",
  customer_unit_required: "Choose whether the customer price is per tonne, load or Job.",
  haulage_unit_required: "Choose a unit for the haulage cost.",
  tipping_unit_required: "Choose a unit for the tipping cost.",
  invalid_vat_rate: "VAT must be between 0 and 100%.",
  invalid_amount: "Enter a valid non-zero commercial amount.",
  description_required: "Enter a description for the commercial line.",
  invalid_commercial_kind: "Choose whether the line is revenue or a direct cost.",
  invalid_commercial_category: "Choose a valid commercial line type.",
  commercial_line_missing: "That commercial line could not be found.",
  unit_required: "Choose tonne, load or Job.",
  no_legacy_price: "This Job does not have an old Rate or Load price to copy.",
  select_jobs_to_invoice: "Select at least one completed Job to invoice.",
  invalid_payment_terms: "Payment terms must be between 0 and 365 days.",
  invoice_jobs_must_be_completed: "Only completed Jobs can be invoiced.",
  invoice_one_customer_only: "One invoice can only contain Jobs for the same customer.",
  job_already_invoiced: "One of those Jobs already belongs to an active invoice.",
  job_missing_customer_price: "A selected Job has no customer/revenue price.",
  job_missing_invoice_quantity: "A selected per-tonne/per-load charge has no completed quantity yet.",
  invoice_party_missing: "Supplier or customer details are missing.",
  invoice_not_found: "That invoice could not be found.",
  only_draft_can_issue: "Only a draft invoice can be issued.",
  only_draft_can_void: "Only a draft invoice can be voided. Issued invoices need a credit-note workflow.",
  invoice_must_be_issued: "The invoice must be issued before this action is available.",
  customer_address_required: "Add the customer's billing address before issuing this invoice.",
  vat_number_required: "A VAT number is required before issuing an invoice that charges VAT.",
  invoice_email_required: "Enter an invoice and recipient email address.",
  invoice_email_not_configured:
    "Invoice email is not configured. Add RESEND_API_KEY and INVOICE_FROM_EMAIL to the server environment.",
  invoice_email_failed: "The invoice email could not be sent.",
  job_pricing_locked: "This Job is already attached to an active invoice. Void the draft first, or use the proper credit-note/correction workflow after issue.",
};

async function loadJobs(organisationId: string) {
  return database.query.jobs.findMany({
    where: and(
      eq(jobs.organisationId, organisationId),
      ne(jobs.status, "cancelled"),
    ),
    with: {
      client: true,
      clientSite: true,
      rate: true,
      loads: true,
    },
    orderBy: [desc(jobs.jobDate), desc(jobs.createdAt)],
    limit: 100,
  });
}

async function loadCompletedUnbilledJobs(organisationId: string) {
  return database.query.jobs.findMany({
    where: and(
      eq(jobs.organisationId, organisationId),
      eq(jobs.status, "completed"),
      isNull(jobs.customerInvoicedAt),
    ),
    with: {
      client: true,
      clientSite: true,
      rate: true,
      loads: true,
    },
    orderBy: [desc(jobs.completedAt), desc(jobs.jobDate)],
  });
}

export default async function CommercialPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireAdminValueAccess();

  const [jobRows, unbilledCompletedJobs, invoiceRows, settings] = await Promise.all([
    loadJobs(access.organisationId),
    loadCompletedUnbilledJobs(access.organisationId),
    database.query.customerInvoices.findMany({
      where: eq(customerInvoices.organisationId, access.organisationId),
      orderBy: [desc(customerInvoices.createdAt)],
      limit: 100,
    }),
    database.query.commercialSettings.findFirst({
      where: eq(commercialSettings.organisationId, access.organisationId),
    }),
  ]);

  const relevantJobsById = new Map(
    [...jobRows, ...unbilledCompletedJobs].map((job) => [job.id, job]),
  );
  const relevantJobs = Array.from(relevantJobsById.values());
  const jobIds = relevantJobs.map((job) => job.id);

  const [commercialLines, activeInvoiceLinks] = await Promise.all([
    jobIds.length
      ? database.query.jobCommercialLines.findMany({
          where: and(
            eq(jobCommercialLines.organisationId, access.organisationId),
            inArray(jobCommercialLines.jobId, jobIds),
            eq(jobCommercialLines.isActive, true),
          ),
        })
      : Promise.resolve([]),
    jobIds.length
      ? database
          .select({
            jobId: customerInvoiceJobs.jobId,
            invoiceId: customerInvoiceJobs.invoiceId,
            status: customerInvoices.status,
          })
          .from(customerInvoiceJobs)
          .innerJoin(
            customerInvoices,
            eq(customerInvoiceJobs.invoiceId, customerInvoices.id),
          )
          .where(
            and(
              eq(customerInvoiceJobs.organisationId, access.organisationId),
              inArray(customerInvoiceJobs.jobId, jobIds),
              ne(customerInvoices.status, "void"),
            ),
          )
      : Promise.resolve([]),
  ]);

  const linesByJob = new Map<string, typeof commercialLines>();
  for (const line of commercialLines) {
    const existing = linesByJob.get(line.jobId) ?? [];
    existing.push(line);
    linesByJob.set(line.jobId, existing);
  }

  const activeInvoiceByJob = new Map(
    activeInvoiceLinks.map((link) => [link.jobId, link]),
  );

  function mapCommercialJob(job: (typeof relevantJobs)[number]) {
    const lines = linesByJob.get(job.id) ?? [];
    const summary = calculateJobCommercials({ lines, loads: job.loads });

    return {
      job,
      lines,
      summary,
      activeInvoice: activeInvoiceByJob.get(job.id) ?? null,
    };
  }

  const commercialJobs = relevantJobs.map(mapCommercialJob);

  const invoiceReady = unbilledCompletedJobs
    .map(mapCommercialJob)
    .filter(
      ({ job, summary, activeInvoice }) =>
        Boolean(job.clientCounterpartyId) &&
        summary.hasRevenue &&
        !summary.missingQuantity &&
        !activeInvoice,
    );

  const readyByCustomer = new Map<string, typeof invoiceReady>();
  for (const row of invoiceReady) {
    if (!row.job.clientCounterpartyId) continue;
    const current = readyByCustomer.get(row.job.clientCounterpartyId) ?? [];
    current.push(row);
    readyByCustomer.set(row.job.clientCounterpartyId, current);
  }

  const draftInvoices = invoiceRows.filter((invoice) => invoice.status === "draft");
  const issuedInvoices = invoiceRows.filter((invoice) => invoice.status === "issued");
  const paidInvoices = invoiceRows.filter((invoice) => invoice.status === "paid");

  const pricingNeeded = commercialJobs.filter(
    ({ lines, activeInvoice }) => lines.length === 0 && !activeInvoice,
  ).length;

  const success = first(searchParams.success);
  const error = first(searchParams.error);

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-8 pb-24 pt-[15vh] pl-[24vw] text-black">
      <div className="mx-auto max-w-[1750px] space-y-7">
        <section className="relative overflow-hidden rounded-[30px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-20 -top-24 size-80 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-400">
                Commercial // Job pricing // Customer invoicing
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight">
                Commercial & Invoicing
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">
                The Job is now the pricing authority. Confirm what was actually agreed,
                let completed Loads provide the actual tonnes/load count, then create,
                issue, PDF and email the customer invoice from the same page.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Link
                href="/home/rates"
                className="rounded-xl border border-white/15 px-4 py-2.5 text-xs font-semibold text-white/65 hover:border-orange-400 hover:text-orange-400"
              >
                Rate Library / history
              </Link>
              <Link
                href="/home/accounts"
                className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-black"
              >
                Legacy billing & exports
              </Link>
            </div>
          </div>
        </section>

        {(success || error) && (
          <section
            className={`rounded-2xl border px-5 py-4 text-sm font-semibold ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error
              ? ERROR_MESSAGES[error] ?? `Commercial action failed: ${error}`
              : SUCCESS_MESSAGES[success] ?? "Commercial data updated."}
          </section>
        )}

        <section id="invoice-settings" className="scroll-mt-32 rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Invoice identity & defaults
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Set this once, use it on every customer invoice</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
                Legal/business identity is snapshotted onto each draft and refreshed once more when the draft is issued.
                This keeps old invoices historically stable even if your organisation settings later change.
              </p>
            </div>
            <span className={`rounded-full px-3 py-2 text-xs font-semibold ${settings?.vatNumber ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-800"}`}>
              {settings?.vatNumber ? "VAT identity configured" : "VAT number not configured"}
            </span>
          </div>

          <form action={saveCommercialSettingsAction} className="mt-5 grid gap-3 xl:grid-cols-6">
            <Field label="Legal / trading name">
              <input name="legalName" defaultValue={settings?.legalName ?? access.organisationName} className={inputClass} />
            </Field>
            <Field label="Company number">
              <input name="companyNumber" defaultValue={settings?.companyNumber ?? ""} placeholder="Optional" className={inputClass} />
            </Field>
            <Field label="VAT number">
              <input name="vatNumber" defaultValue={settings?.vatNumber ?? ""} placeholder="GB123456789" className={inputClass} />
            </Field>
            <Field label="Invoice prefix">
              <input name="invoicePrefix" defaultValue={settings?.invoicePrefix ?? "INV"} className={inputClass} />
            </Field>
            <Field label="Default terms days">
              <input name="defaultPaymentTermsDays" type="number" min="0" max="365" defaultValue={settings?.defaultPaymentTermsDays ?? 30} className={inputClass} />
            </Field>
            <div className="flex items-end">
              <button className="h-10 w-full rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                Save invoice settings
              </button>
            </div>

            <label className="xl:col-span-3">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.13em] text-black/35">Registered / invoice address</span>
              <input name="registeredAddress" defaultValue={settings?.registeredAddress ?? ""} placeholder="Leave blank to use the organisation address" className={inputClass} />
            </label>
            <label className="xl:col-span-3">
              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.13em] text-black/35">Payment instructions</span>
              <input name="paymentInstructions" defaultValue={settings?.paymentInstructions ?? ""} placeholder="Bank details / remittance instructions / payment reference guidance" className={inputClass} />
            </label>
          </form>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Pricing needed" value={pricingNeeded} warning={pricingNeeded > 0} />
          <Metric label="Ready to invoice" value={invoiceReady.length} highlight />
          <Metric label="Draft invoices" value={draftInvoices.length} />
          <Metric label="Issued" value={issuedInvoices.length} />
          <Metric label="Paid" value={paidInvoices.length} />
        </section>

        <section id="job-pricing" className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-black/10 p-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                1 · Job-specific commercial terms
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Price the Job, not the customer master record</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
                Existing Rates remain available as suggestions/history. They no longer have to be the commercial truth.
                A Job can also carry additional revenue or cost lines such as haulage charges, surcharges and discounts.
              </p>
            </div>
            <span className="rounded-full bg-black/5 px-3 py-2 text-xs font-semibold text-black/50">
              {commercialJobs.length} relevant Jobs
            </span>
          </div>

          <div className="divide-y divide-black/5">
            {commercialJobs.map(({ job, lines, summary, activeInvoice }) => {
              const revenueCategory =
                job.direction === "outgoing"
                  ? "material_sale"
                  : "customer_charge";
              const revenueLine = lines.find(
                (line) => line.category === revenueCategory,
              );
              const haulageCostLine = lines.find((line) => line.category === "haulage_cost");
              const tippingCostLine = lines.find((line) => line.category === "tipping_cost");
              const legacyLoad = job.loads.find(
                (load) => load.customerChargeAmount && load.customerChargeUnit,
              );
              const legacyAmount = job.rate?.amount ?? legacyLoad?.customerChargeAmount ?? null;
              const legacyUnit = job.rate?.unit ?? legacyLoad?.customerChargeUnit ?? null;

              return (
                <article id={`job-${job.id}`} key={job.id} className="relative scroll-mt-32 p-5">
                  <div className="grid gap-5 xl:grid-cols-[1.1fr_1fr_0.8fr_auto] xl:items-start">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/home/jobs/${job.id}`} className="font-semibold hover:text-orange-700">
                          {job.jobNumber}
                        </Link>
                        <span className="rounded-full bg-black/5 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-black/45">
                          {job.status.replaceAll("_", " ")}
                        </span>
                        {activeInvoice && (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] text-emerald-700">
                            Invoice {activeInvoice.status}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm font-semibold text-black/65">
                        {job.client?.name ?? "No client"}
                      </p>
                      <p className="mt-1 text-xs text-black/35">
                        {job.clientSite?.name ?? "No source site"} · {date(job.jobDate)}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">Agreed commercial terms</p>
                      {lines.length === 0 ? (
                        <p className="mt-2 text-sm font-semibold text-amber-700">No Job-specific pricing yet</p>
                      ) : (
                        <div className="mt-2 space-y-1.5">
                          {lines.map((line) => (
                            <div key={line.id} className="flex items-center justify-between gap-3 text-xs">
                              <span className="min-w-0 truncate text-black/55">
                                {line.kind === "revenue" ? "+" : "−"} {line.description}
                              </span>
                              <span className="shrink-0 font-semibold">
                                {money(line.amount)} / {unitLabel(line.unit)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">Actuals so far</p>
                      <p className="mt-2 text-sm font-semibold">{summary.completedLoads} completed loads · {tonnes(summary.tonnes)}</p>
                      <p className="mt-1 text-xs text-black/40">
                        Revenue {money(summary.revenue)} · Cost {money(summary.directCost)} · Margin {money(summary.margin)}
                      </p>
                    </div>

                    {activeInvoice ? (
                      <div className="w-full rounded-xl border border-black/10 bg-black/5 px-4 py-2.5 text-center text-[10px] font-semibold text-black/45 xl:w-[160px]">
                        Pricing locked by invoice
                      </div>
                    ) : (
                    <details className="w-full xl:w-[160px]">
                      <summary className="cursor-pointer list-none rounded-xl bg-black px-4 py-2.5 text-center text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                        Set / edit pricing
                      </summary>
                      <div className="mt-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 xl:absolute xl:right-[5vw] xl:z-20 xl:w-[700px] xl:shadow-2xl">
                        <form action={saveCoreJobPricingAction} className="grid gap-4">
                          <input type="hidden" name="jobId" value={job.id} />

                          <div className="grid gap-3 md:grid-cols-[1.2fr_0.55fr_0.55fr_0.45fr]">
                            <Field
                              label={
                                job.direction === "outgoing"
                                  ? "Revenue / material sale description"
                                  : "Customer description"
                              }
                            >
                              <input
                                name="customerChargeDescription"
                                defaultValue={
                                  revenueLine?.description ??
                                  (job.direction === "outgoing"
                                    ? "Material sale / outgoing service"
                                    : "Waste acceptance / disposal")
                                }
                                className={inputClass}
                              />
                            </Field>
                            <Field
                              label={
                                job.direction === "outgoing"
                                  ? "Revenue £"
                                  : "Customer price £"
                              }
                            >
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                name="customerChargeAmount"
                                defaultValue={revenueLine?.amount ?? ""}
                                className={inputClass}
                              />
                            </Field>
                            <Field label="Unit">
                              <RateUnitSelect name="customerChargeUnit" value={revenueLine?.unit ?? "tonne"} />
                            </Field>
                            <Field label="VAT %">
                              <input
                                type="number"
                                min="0"
                                max="100"
                                step="0.01"
                                name="customerVatRate"
                                defaultValue={revenueLine?.vatRate ?? "20.00"}
                                className={inputClass}
                              />
                            </Field>
                          </div>

                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="grid grid-cols-[1fr_120px] gap-2 rounded-xl border border-black/5 bg-white p-3">
                              <Field label="Haulage cost £">
                                <input type="number" min="0" step="0.01" name="haulageCostAmount" defaultValue={haulageCostLine?.amount ?? ""} className={inputClass} />
                              </Field>
                              <Field label="Unit">
                                <RateUnitSelect name="haulageCostUnit" value={haulageCostLine?.unit ?? "load"} />
                              </Field>
                            </div>
                            <div className="grid grid-cols-[1fr_120px] gap-2 rounded-xl border border-black/5 bg-white p-3">
                              <Field label="Tipping cost £">
                                <input type="number" min="0" step="0.01" name="tippingCostAmount" defaultValue={tippingCostLine?.amount ?? ""} className={inputClass} />
                              </Field>
                              <Field label="Unit">
                                <RateUnitSelect name="tippingCostUnit" value={tippingCostLine?.unit ?? "tonne"} />
                              </Field>
                            </div>
                          </div>

                          <button className="h-11 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                            Save this Job's pricing
                          </button>
                        </form>

                        {legacyAmount && legacyUnit && (
                          <form action={useLegacyPriceSuggestionAction} className="mt-3 rounded-xl border border-orange-200 bg-orange-50 p-3">
                            <input type="hidden" name="jobId" value={job.id} />
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-orange-700">Old Rate / Load snapshot suggestion</p>
                                <p className="mt-1 text-xs text-orange-900/70">{money(legacyAmount)} / {unitLabel(legacyUnit)} — use only if it is correct for this Job.</p>
                              </div>
                              <button className="rounded-lg border border-orange-300 bg-white px-3 py-2 text-xs font-semibold text-orange-800">
                                Use suggestion
                              </button>
                            </div>
                          </form>
                        )}

                        <div className="mt-4 border-t border-black/10 pt-4">
                          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-black/35">Additional revenue / cost line</p>
                          <form action={addCustomJobCommercialLineAction} className="mt-3 grid gap-2 md:grid-cols-[110px_145px_1fr_110px_105px_90px_auto]">
                            <input type="hidden" name="jobId" value={job.id} />
                            <select name="kind" defaultValue="revenue" className={inputClass}>
                              <option value="revenue">Revenue</option>
                              <option value="cost">Cost</option>
                            </select>
                            <select name="category" defaultValue="surcharge" className={inputClass}>
                              <option value="haulage_charge">Haulage charge</option>
                              <option value="material_sale">Material sale</option>
                              <option value="surcharge">Surcharge</option>
                              <option value="discount">Discount</option>
                              <option value="other">Other</option>
                              <option value="haulage_cost">Haulage cost</option>
                              <option value="tipping_cost">Tipping cost</option>
                            </select>
                            <input name="description" required placeholder="Description" className={inputClass} />
                            <input name="amount" type="number" step="0.01" required placeholder="£" className={inputClass} />
                            <RateUnitSelect name="unit" value="job" />
                            <input name="vatRate" type="number" min="0" max="100" step="0.01" defaultValue="20.00" className={inputClass} />
                            <button className="rounded-lg bg-orange-500 px-3 text-xs font-bold text-black">Add</button>
                          </form>
                        </div>

                        {lines.filter((line) => !["customer_charge", "material_sale", "haulage_cost", "tipping_cost"].includes(line.category)).length > 0 && (
                          <div className="mt-4 space-y-2">
                            {lines
                              .filter((line) => !["customer_charge", "material_sale", "haulage_cost", "tipping_cost"].includes(line.category))
                              .map((line) => (
                                <div key={line.id} className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2 text-xs">
                                  <span>{line.description} · {money(line.amount)} / {unitLabel(line.unit)}</span>
                                  <form action={archiveJobCommercialLineAction}>
                                    <input type="hidden" name="lineId" value={line.id} />
                                    <input type="hidden" name="jobId" value={job.id} />
                                    <button className="font-semibold text-red-600">Remove</button>
                                  </form>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </details>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section id="to-invoice" className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
            2 · To invoice
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Completed, priced Jobs</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
            Jobs are grouped by customer so one invoice can contain several Jobs for the same customer.
            The actual completed load count and weighbridge/net tonnage determine per-load and per-tonne quantities.
          </p>

          {readyByCustomer.size === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/40">
              No completed, priced Jobs are waiting for a native Waste X invoice.
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              {Array.from(readyByCustomer.entries()).map(([customerId, rows]) => {
                const customer = rows[0]?.job.client;
                const totalReady = rows.reduce((sum, row) => sum + row.summary.revenue, 0);

                return (
                  <form key={customerId} action={createDraftInvoiceAction} className="overflow-hidden rounded-2xl border border-black/10">
                    <div className="flex flex-col gap-3 bg-[#fbfaf7] p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">{customer?.name ?? "Customer"}</p>
                        <p className="mt-1 text-xs text-black/40">{rows.length} invoice-ready Job{rows.length === 1 ? "" : "s"} · {money(totalReady)} net operational value</p>
                      </div>
                      <div className="flex flex-wrap items-end gap-2">
                        <label>
                          <span className="block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">Terms days</span>
                          <input name="paymentTermsDays" type="number" min="0" max="365" defaultValue={customer?.paymentTermsDays ?? settings?.defaultPaymentTermsDays ?? 30} className="mt-1 h-9 w-24 rounded-lg border border-black/10 bg-white px-2 text-xs" />
                        </label>
                        <button className="h-9 rounded-lg bg-black px-4 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                          Create draft invoice
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="border-y border-black/5 bg-white text-[9px] uppercase tracking-[0.14em] text-black/35">
                          <tr>
                            <th className="px-4 py-3">Select</th>
                            <th className="px-4 py-3">Job</th>
                            <th className="px-4 py-3">Source</th>
                            <th className="px-4 py-3">Loads / tonnes</th>
                            <th className="px-4 py-3">Customer value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-black/5">
                          {rows.map(({ job, summary }) => (
                            <tr key={job.id}>
                              <td className="px-4 py-3"><input type="checkbox" name="jobIds" value={job.id} className="size-4 accent-orange-500" /></td>
                              <td className="px-4 py-3"><Link href={`/home/jobs/${job.id}`} className="font-semibold hover:text-orange-700">{job.jobNumber}</Link><p className="mt-1 text-xs text-black/35">{date(job.completedAt ?? job.jobDate)}</p></td>
                              <td className="px-4 py-3 text-black/55">{job.clientSite?.name ?? "—"}</td>
                              <td className="px-4 py-3 text-black/55">{summary.completedLoads} / {tonnes(summary.tonnes)}</td>
                              <td className="px-4 py-3 font-semibold">{money(summary.revenue)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="border-t border-black/5 p-3">
                      <input name="notes" placeholder="Optional invoice note / customer reference" className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs outline-none focus:border-orange-400" />
                    </div>
                  </form>
                );
              })}
            </div>
          )}
        </section>

        <section id="invoices" className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
            3 · Waste X customer invoices
          </p>
          <h2 className="mt-2 text-2xl font-semibold">Draft → issue → email → paid</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">
            Drafts have no legal invoice number yet. Issuing allocates the next sequential number for the organisation/year,
            freezes the invoice line values and updates the existing Job billing marker for backwards compatibility.
          </p>

          {invoiceRows.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-black/15 p-8 text-center text-sm text-black/40">
              No native customer invoices yet.
            </div>
          ) : (
            <div className="mt-5 grid gap-4 xl:grid-cols-2">
              {invoiceRows.map((invoice) => (
                <article id={`invoice-${invoice.id}`} key={invoice.id} className="scroll-mt-32 rounded-2xl border border-black/10 bg-[#fbfaf7] p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold">{invoice.invoiceNumber ?? `Draft ${invoice.id.slice(0, 8).toUpperCase()}`}</p>
                        <InvoiceStatus status={invoice.status} />
                      </div>
                      <p className="mt-2 text-sm text-black/60">{invoice.customerNameSnapshot}</p>
                      <p className="mt-1 text-xs text-black/35">Supply {date(invoice.supplyDate)} · Total {money(invoice.total)}</p>
                    </div>
                    <a
                      href={`/api/commercial/invoices/${invoice.id}/pdf`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-black/10 bg-white px-3 py-2 text-xs font-semibold text-black/55 hover:border-orange-300 hover:text-orange-700"
                    >
                      {invoice.status === "draft" ? "Preview PDF" : "Download PDF"}
                    </a>
                  </div>

                  {invoice.status === "draft" && (
                    <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                      <div className="rounded-xl border border-black/5 bg-white px-3 py-2 text-[10px] text-black/45">
                        {Number(invoice.vatTotal) > 0
                          ? invoice.supplierVatNumber || settings?.vatNumber
                            ? `VAT number: ${invoice.supplierVatNumber ?? settings?.vatNumber}`
                            : "VAT number required before issue"
                          : "No VAT charged on this draft"}
                      </div>
                      <form action={issueInvoiceAction}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <button className="h-10 w-full rounded-xl bg-orange-500 px-4 text-xs font-bold text-black">Issue invoice</button>
                      </form>
                      <form action={voidDraftInvoiceAction}>
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <button className="h-10 rounded-xl border border-red-200 bg-white px-3 text-xs font-semibold text-red-700">Void draft</button>
                      </form>
                    </div>
                  )}

                  {invoice.status === "issued" && (
                    <div className="mt-4 space-y-2">
                      <form action={sendInvoiceEmailAction} className="flex gap-2">
                        <input type="hidden" name="invoiceId" value={invoice.id} />
                        <input
                          type="email"
                          name="recipient"
                          required
                          defaultValue={invoice.customerEmailSnapshot ?? invoice.lastEmailedTo ?? ""}
                          placeholder="Customer email"
                          className="h-10 min-w-0 flex-1 rounded-xl border border-black/10 bg-white px-3 text-xs outline-none focus:border-orange-400"
                        />
                        <button className="h-10 rounded-xl bg-black px-4 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">Email PDF</button>
                      </form>
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[10px] text-black/35">
                          {invoice.lastEmailedAt ? `Last emailed ${date(invoice.lastEmailedAt)} to ${invoice.lastEmailedTo ?? "customer"}` : "Not emailed from Waste X yet"}
                        </p>
                        <form action={markInvoicePaidAction}>
                          <input type="hidden" name="invoiceId" value={invoice.id} />
                          <button className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Mark paid</button>
                        </form>
                      </div>
                    </div>
                  )}

                  {invoice.status === "paid" && (
                    <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                      Paid {date(invoice.paidAt)}
                    </div>
                  )}

                  {invoice.status === "void" && (
                    <div className="mt-4 rounded-xl border border-black/10 bg-black/5 px-3 py-2 text-xs font-semibold text-black/45">
                      Voided draft — its Jobs can be selected for a new invoice.
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <InfoCard
            title="What changed about Rates"
            text="The old Rate Library is kept. Waste X can show/copy those values as suggestions, but the commercial lines saved against each Job are the source of truth for native invoices."
          />
          <InfoCard
            title="What Waste X now owns"
            text="Job terms, completed Load quantities, invoice lines, sequential invoice number, PDF, email status and manual payment status. Accounting exports remain available."
          />
          <InfoCard
            title="What still belongs in Xero / Sage"
            text="General ledger, bank reconciliation, payroll, corporation tax and statutory accounts. A later API sync can push Waste X invoices there without rebuilding those functions here."
          />
        </section>
      </div>
    </main>
  );
}

const inputClass =
  "h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs outline-none focus:border-orange-400";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label>
      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.13em] text-black/35">{label}</span>
      {children}
    </label>
  );
}

function RateUnitSelect({ name, value }: { name: string; value: string }) {
  return (
    <select name={name} defaultValue={value} className={inputClass}>
      <option value="tonne">Per tonne</option>
      <option value="load">Per load</option>
      <option value="job">Per Job</option>
    </select>
  );
}

function Metric({
  label,
  value,
  highlight = false,
  warning = false,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-[20px] border p-4 shadow-sm ${
        warning
          ? "border-amber-200 bg-amber-50"
          : highlight
            ? "border-orange-200 bg-orange-50"
            : "border-black/10 bg-white"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/35">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function InvoiceStatus({ status }: { status: string }) {
  const classes =
    status === "paid"
      ? "bg-emerald-100 text-emerald-800"
      : status === "issued"
        ? "bg-blue-100 text-blue-800"
        : status === "void"
          ? "bg-black/5 text-black/40"
          : "bg-orange-100 text-orange-800";

  return (
    <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] ${classes}`}>
      {status}
    </span>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="rounded-[24px] border border-black/10 bg-white p-5 shadow-sm">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </article>
  );
}
