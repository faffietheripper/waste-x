"use server";

import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Resend } from "resend";

import {
  commercialSettings,
  customerInvoiceCounters,
  customerInvoiceJobs,
  customerInvoiceLines,
  customerInvoices,
  jobCommercialLines,
  type JobCommercialCategory,
  type JobCommercialKind,
  type JobCommercialUnit,
} from "@/db/commercial-schema";
import { database } from "@/db/database";
import {
  counterparties,
  jobLoads,
  jobs,
  organisations,
} from "@/db/schema";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import {
  calculateJobCommercials,
  roundMoney,
} from "@/modules/commercial/jobCommercials";
import { getCustomerInvoiceDocument } from "@/modules/commercial/invoiceDocument";
import { buildCustomerInvoicePdf } from "@/modules/commercial/invoicePdf";

const COMMERCIAL_UNITS: JobCommercialUnit[] = ["tonne", "load", "job"];
const COMMERCIAL_KINDS: JobCommercialKind[] = ["revenue", "cost"];
const COMMERCIAL_CATEGORIES: JobCommercialCategory[] = [
  "customer_charge",
  "haulage_charge",
  "haulage_cost",
  "tipping_cost",
  "material_sale",
  "surcharge",
  "discount",
  "other",
];

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function parseMoney(
  value: FormDataEntryValue | null,
  options: { allowNegative?: boolean } = {},
) {
  const cleaned = cleanString(value).replace(/,/g, "");
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) return null;
  if (!options.allowNegative && parsed < 0) return null;

  return parsed.toFixed(2);
}

function parseVatRate(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  if (!cleaned) return "20.00";

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) return null;
  return parsed.toFixed(2);
}

function parsePositiveInt(
  value: FormDataEntryValue | null,
  fallback: number,
  min: number,
  max: number,
) {
  const cleaned = cleanString(value);
  if (!cleaned) return fallback;

  const parsed = Number(cleaned);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function parseUnit(value: FormDataEntryValue | null): JobCommercialUnit | null {
  const cleaned = cleanString(value) as JobCommercialUnit;
  return COMMERCIAL_UNITS.includes(cleaned) ? cleaned : null;
}

function commercialRedirect(
  key: "success" | "error",
  code: string,
  focus?: string,
): never {
  redirect(
    `/home/commercial?${key}=${encodeURIComponent(code)}${
      focus ? `#${encodeURIComponent(focus)}` : ""
    }`,
  );
}

async function requireJob(organisationId: string, jobId: string) {
  return database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, jobId),
      eq(jobs.organisationId, organisationId),
    ),
    with: {
      client: true,
      clientSite: true,
      rate: true,
      loads: true,
    },
  });
}

async function jobHasActiveInvoice(organisationId: string, jobId: string) {
  const [row] = await database
    .select({ invoiceId: customerInvoiceJobs.invoiceId })
    .from(customerInvoiceJobs)
    .innerJoin(
      customerInvoices,
      eq(customerInvoiceJobs.invoiceId, customerInvoices.id),
    )
    .where(
      and(
        eq(customerInvoiceJobs.organisationId, organisationId),
        eq(customerInvoiceJobs.jobId, jobId),
        ne(customerInvoices.status, "void"),
      ),
    )
    .limit(1);

  return Boolean(row);
}

async function ensurePricingUnlocked(organisationId: string, jobId: string) {
  if (await jobHasActiveInvoice(organisationId, jobId)) {
    commercialRedirect("error", "job_pricing_locked", `job-${jobId}`);
  }
}

function revalidateCommercial(jobIds: string[] = []) {
  revalidatePath("/home/commercial");
  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");

  for (const jobId of jobIds) {
    revalidatePath(`/home/jobs/${jobId}`);
  }
}

export async function saveCommercialSettingsAction(formData: FormData) {
  const access = await requireAdminValueAccess();

  const legalName = optionalString(formData.get("legalName"));
  const companyNumber = optionalString(formData.get("companyNumber"));
  const vatNumber = optionalString(formData.get("vatNumber"));
  const registeredAddress = optionalString(formData.get("registeredAddress"));
  const rawPrefix = cleanString(formData.get("invoicePrefix")).toUpperCase();
  const invoicePrefix = (rawPrefix || "INV")
    .replace(/[^A-Z0-9_-]+/g, "-")
    .slice(0, 12);
  const defaultPaymentTermsDays = parsePositiveInt(
    formData.get("defaultPaymentTermsDays"),
    30,
    0,
    365,
  );

  if (defaultPaymentTermsDays === null) {
    commercialRedirect("error", "invalid_payment_terms", "invoice-settings");
  }

  await database
    .insert(commercialSettings)
    .values({
      organisationId: access.organisationId,
      legalName,
      companyNumber,
      vatNumber,
      registeredAddress,
      invoicePrefix,
      defaultPaymentTermsDays,
      paymentInstructions: optionalString(formData.get("paymentInstructions")),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: commercialSettings.organisationId,
      set: {
        legalName,
        companyNumber,
        vatNumber,
        registeredAddress,
        invoicePrefix,
        defaultPaymentTermsDays,
        paymentInstructions: optionalString(formData.get("paymentInstructions")),
        updatedAt: new Date(),
      },
    });

  revalidateCommercial();
  commercialRedirect("success", "commercial_settings_saved", "invoice-settings");
}

export async function saveCoreJobPricingAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = cleanString(formData.get("jobId"));

  if (!jobId) commercialRedirect("error", "job_required");

  const job = await requireJob(access.organisationId, jobId);
  if (!job) commercialRedirect("error", "job_not_found");
  await ensurePricingUnlocked(access.organisationId, jobId);

  const customerAmount = parseMoney(formData.get("customerChargeAmount"));
  const customerUnit = parseUnit(formData.get("customerChargeUnit"));
  const customerDescription =
    cleanString(formData.get("customerChargeDescription")) ||
    "Waste acceptance / disposal";
  const customerVatRate = parseVatRate(formData.get("customerVatRate"));

  const haulageCostAmount = parseMoney(formData.get("haulageCostAmount"));
  const haulageCostUnit = parseUnit(formData.get("haulageCostUnit"));

  const tippingCostAmount = parseMoney(formData.get("tippingCostAmount"));
  const tippingCostUnit = parseUnit(formData.get("tippingCostUnit"));

  if (customerAmount && !customerUnit) {
    commercialRedirect("error", "customer_unit_required", `job-${jobId}`);
  }

  if (customerAmount && !customerVatRate) {
    commercialRedirect("error", "invalid_vat_rate", `job-${jobId}`);
  }

  if (haulageCostAmount && !haulageCostUnit) {
    commercialRedirect("error", "haulage_unit_required", `job-${jobId}`);
  }

  if (tippingCostAmount && !tippingCostUnit) {
    commercialRedirect("error", "tipping_unit_required", `job-${jobId}`);
  }

  const now = new Date();
  const coreCategories: JobCommercialCategory[] = [
    "customer_charge",
    "haulage_cost",
    "tipping_cost",
  ];

  await database.transaction(async (tx) => {
    const currentCore = await tx
      .select({ id: jobCommercialLines.id })
      .from(jobCommercialLines)
      .where(
        and(
          eq(jobCommercialLines.organisationId, access.organisationId),
          eq(jobCommercialLines.jobId, jobId),
          inArray(jobCommercialLines.category, coreCategories),
          eq(jobCommercialLines.isActive, true),
        ),
      );

    if (currentCore.length > 0) {
      await tx
        .update(jobCommercialLines)
        .set({ isActive: false, updatedAt: now })
        .where(inArray(jobCommercialLines.id, currentCore.map((row) => row.id)));
    }

    const newLines: Array<typeof jobCommercialLines.$inferInsert> = [];

    if (customerAmount && customerUnit && customerVatRate) {
      newLines.push({
        organisationId: access.organisationId,
        jobId,
        kind: "revenue",
        category: "customer_charge",
        description: customerDescription,
        amount: customerAmount,
        unit: customerUnit,
        vatRate: customerVatRate,
        currency: "GBP",
        sortOrder: 10,
        isActive: true,
        createdByUserId: access.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (haulageCostAmount && haulageCostUnit) {
      newLines.push({
        organisationId: access.organisationId,
        jobId,
        kind: "cost",
        category: "haulage_cost",
        description: "Haulage cost",
        amount: haulageCostAmount,
        unit: haulageCostUnit,
        vatRate: "0.00",
        currency: "GBP",
        sortOrder: 100,
        isActive: true,
        createdByUserId: access.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (tippingCostAmount && tippingCostUnit) {
      newLines.push({
        organisationId: access.organisationId,
        jobId,
        kind: "cost",
        category: "tipping_cost",
        description: "External facility / tipping cost",
        amount: tippingCostAmount,
        unit: tippingCostUnit,
        vatRate: "0.00",
        currency: "GBP",
        sortOrder: 110,
        isActive: true,
        createdByUserId: access.userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    if (newLines.length > 0) {
      await tx.insert(jobCommercialLines).values(newLines);
    }

    /*
      Backwards compatibility: the existing Accounts/Exports engine reads the
      core customer/haulage/tipping snapshots from Job Loads. Keep those core
      fields aligned with the newly confirmed Job pricing so existing reports
      continue to make sense while native invoicing uses bb_job_commercial_line.
    */
    await tx
      .update(jobLoads)
      .set({
        customerChargeAmount: customerAmount,
        customerChargeUnit: customerAmount ? customerUnit : null,
        haulageCostAmount,
        haulageCostUnit: haulageCostAmount ? haulageCostUnit : null,
        tippingCostAmount,
        tippingCostUnit: tippingCostAmount ? tippingCostUnit : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoads.organisationId, access.organisationId),
          eq(jobLoads.jobId, jobId),
        ),
      );
  });

  revalidateCommercial([jobId]);
  commercialRedirect("success", "job_pricing_saved", `job-${jobId}`);
}

export async function addCustomJobCommercialLineAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = cleanString(formData.get("jobId"));
  const kind = cleanString(formData.get("kind")) as JobCommercialKind;
  const category = cleanString(formData.get("category")) as JobCommercialCategory;
  const description = cleanString(formData.get("description"));
  const unit = parseUnit(formData.get("unit"));
  const vatRate = parseVatRate(formData.get("vatRate"));

  if (!jobId) commercialRedirect("error", "job_required");
  if (!COMMERCIAL_KINDS.includes(kind)) {
    commercialRedirect("error", "invalid_commercial_kind", `job-${jobId}`);
  }
  if (!COMMERCIAL_CATEGORIES.includes(category)) {
    commercialRedirect("error", "invalid_commercial_category", `job-${jobId}`);
  }
  if (!description) {
    commercialRedirect("error", "description_required", `job-${jobId}`);
  }
  if (!unit) {
    commercialRedirect("error", "unit_required", `job-${jobId}`);
  }
  if (!vatRate) {
    commercialRedirect("error", "invalid_vat_rate", `job-${jobId}`);
  }

  const allowNegative = category === "discount";
  const amount = parseMoney(formData.get("amount"), { allowNegative });

  if (amount === null || Number(amount) === 0) {
    commercialRedirect("error", "invalid_amount", `job-${jobId}`);
  }

  if (!(await requireJob(access.organisationId, jobId))) {
    commercialRedirect("error", "job_not_found");
  }
  await ensurePricingUnlocked(access.organisationId, jobId);

  await database.insert(jobCommercialLines).values({
    organisationId: access.organisationId,
    jobId,
    kind,
    category,
    description,
    amount,
    unit,
    vatRate: kind === "revenue" ? vatRate : "0.00",
    currency: "GBP",
    sortOrder: kind === "revenue" ? 50 : 150,
    isActive: true,
    notes: optionalString(formData.get("notes")),
    createdByUserId: access.userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidateCommercial([jobId]);
  commercialRedirect("success", "commercial_line_added", `job-${jobId}`);
}

export async function archiveJobCommercialLineAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const lineId = cleanString(formData.get("lineId"));
  const jobId = cleanString(formData.get("jobId"));

  if (!lineId || !jobId) commercialRedirect("error", "commercial_line_missing");
  await ensurePricingUnlocked(access.organisationId, jobId);

  await database
    .update(jobCommercialLines)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(jobCommercialLines.id, lineId),
        eq(jobCommercialLines.jobId, jobId),
        eq(jobCommercialLines.organisationId, access.organisationId),
      ),
    );

  revalidateCommercial([jobId]);
  commercialRedirect("success", "commercial_line_archived", `job-${jobId}`);
}

export async function useLegacyPriceSuggestionAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = cleanString(formData.get("jobId"));

  if (!jobId) commercialRedirect("error", "job_required");

  const job = await requireJob(access.organisationId, jobId);
  if (!job) commercialRedirect("error", "job_not_found");
  await ensurePricingUnlocked(access.organisationId, jobId);

  const legacyLoad = job.loads.find(
    (load) => load.customerChargeAmount && load.customerChargeUnit,
  );

  const amount = job.rate?.amount ?? legacyLoad?.customerChargeAmount ?? null;
  const unit = job.rate?.unit ?? legacyLoad?.customerChargeUnit ?? null;

  if (!amount || !unit) {
    commercialRedirect("error", "no_legacy_price", `job-${jobId}`);
  }

  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(jobCommercialLines)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(jobCommercialLines.organisationId, access.organisationId),
          eq(jobCommercialLines.jobId, jobId),
          eq(jobCommercialLines.category, "customer_charge"),
          eq(jobCommercialLines.isActive, true),
        ),
      );

    await tx.insert(jobCommercialLines).values({
      organisationId: access.organisationId,
      jobId,
      kind: "revenue",
      category: "customer_charge",
      description: "Waste acceptance / disposal",
      amount,
      unit,
      vatRate: "20.00",
      currency: "GBP",
      sortOrder: 10,
      isActive: true,
      notes: "Copied from the legacy Rate / Load snapshot as a suggestion. Confirmed at Job level.",
      createdByUserId: access.userId,
      createdAt: now,
      updatedAt: now,
    });

    await tx
      .update(jobLoads)
      .set({
        customerChargeAmount: amount,
        customerChargeUnit: unit,
        updatedAt: now,
      })
      .where(
        and(
          eq(jobLoads.organisationId, access.organisationId),
          eq(jobLoads.jobId, jobId),
        ),
      );
  });

  revalidateCommercial([jobId]);
  commercialRedirect("success", "legacy_price_applied", `job-${jobId}`);
}

function organisationAddress(org: {
  streetAddress: string;
  city: string;
  region: string;
  postCode: string;
  country: string;
}) {
  return [org.streetAddress, org.city, org.region, org.postCode, org.country]
    .filter(Boolean)
    .join(", ");
}

function customerAddress(customer: {
  fullAddress: string | null;
  postcode: string | null;
}) {
  return [customer.fullAddress, customer.postcode].filter(Boolean).join(", ");
}

export async function createDraftInvoiceAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobIds = Array.from(
    new Set(
      formData
        .getAll("jobIds")
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  );

  if (jobIds.length === 0) {
    commercialRedirect("error", "select_jobs_to_invoice", "to-invoice");
  }

  const paymentTermsDays = parsePositiveInt(
    formData.get("paymentTermsDays"),
    30,
    0,
    365,
  );

  if (paymentTermsDays === null) {
    commercialRedirect("error", "invalid_payment_terms", "to-invoice");
  }

  const selectedJobs = await database.query.jobs.findMany({
    where: and(
      eq(jobs.organisationId, access.organisationId),
      inArray(jobs.id, jobIds),
    ),
    with: {
      client: true,
      clientSite: true,
      loads: true,
    },
  });

  if (selectedJobs.length !== jobIds.length) {
    commercialRedirect("error", "job_not_found", "to-invoice");
  }

  if (selectedJobs.some((job) => job.status !== "completed")) {
    commercialRedirect("error", "invoice_jobs_must_be_completed", "to-invoice");
  }

  const customerIds = new Set(selectedJobs.map((job) => job.clientCounterpartyId));
  if (customerIds.size !== 1 || !selectedJobs[0]?.clientCounterpartyId) {
    commercialRedirect("error", "invoice_one_customer_only", "to-invoice");
  }

  const customerId = selectedJobs[0].clientCounterpartyId;

  const alreadyInvoiced = await database
    .select({ jobId: customerInvoiceJobs.jobId })
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
    );

  if (alreadyInvoiced.length > 0) {
    commercialRedirect("error", "job_already_invoiced", "to-invoice");
  }

  const commercialLines = await database.query.jobCommercialLines.findMany({
    where: and(
      eq(jobCommercialLines.organisationId, access.organisationId),
      inArray(jobCommercialLines.jobId, jobIds),
      eq(jobCommercialLines.isActive, true),
      eq(jobCommercialLines.kind, "revenue"),
    ),
  });

  const linesByJob = new Map<string, typeof commercialLines>();
  for (const line of commercialLines) {
    const current = linesByJob.get(line.jobId) ?? [];
    current.push(line);
    linesByJob.set(line.jobId, current);
  }

  const invoiceLineValues: Array<typeof customerInvoiceLines.$inferInsert> = [];
  let subtotal = 0;
  let vatTotal = 0;
  let sortOrder = 0;

  for (const job of selectedJobs) {
    const lines = linesByJob.get(job.id) ?? [];
    const summary = calculateJobCommercials({
      lines,
      loads: job.loads,
    });

    if (!summary.hasRevenue) {
      commercialRedirect("error", "job_missing_customer_price", `job-${job.id}`);
    }

    if (summary.missingQuantity) {
      commercialRedirect("error", "job_missing_invoice_quantity", `job-${job.id}`);
    }

    for (const line of summary.revenueLines) {
      subtotal += line.netAmount;
      vatTotal += line.vatAmount;
      sortOrder += 10;

      invoiceLineValues.push({
        id: crypto.randomUUID(),
        organisationId: access.organisationId,
        invoiceId: "__PENDING__",
        jobId: job.id,
        jobCommercialLineId: line.id,
        description: line.description,
        jobNumberSnapshot: job.jobNumber,
        quantity: line.quantity.toFixed(3),
        unit: line.unit,
        unitPrice: line.unitPrice.toFixed(2),
        vatRate: line.vatRate.toFixed(2),
        netAmount: line.netAmount.toFixed(2),
        vatAmount: line.vatAmount.toFixed(2),
        grossAmount: line.grossAmount.toFixed(2),
        sortOrder,
        createdAt: new Date(),
      });
    }
  }

  const [organisation, customer, settings] = await Promise.all([
    database.query.organisations.findFirst({
      where: eq(organisations.id, access.organisationId),
    }),
    database.query.counterparties.findFirst({
      where: and(
        eq(counterparties.id, customerId),
        eq(counterparties.organisationId, access.organisationId),
      ),
    }),
    database.query.commercialSettings.findFirst({
      where: eq(commercialSettings.organisationId, access.organisationId),
    }),
  ]);

  if (!organisation || !customer) {
    commercialRedirect("error", "invoice_party_missing", "to-invoice");
  }

  const supplyDate = selectedJobs.reduce<Date | null>((latest, job) => {
    const candidate = job.completedAt ?? job.jobDate;
    if (!candidate) return latest;
    if (!latest || candidate > latest) return candidate;
    return latest;
  }, null);

  const invoiceId = crypto.randomUUID();
  const now = new Date();

  await database.transaction(async (tx) => {
    await tx.insert(customerInvoices).values({
      id: invoiceId,
      organisationId: access.organisationId,
      customerId,
      invoiceNumber: null,
      status: "draft",
      currency: "GBP",
      issueDate: null,
      supplyDate,
      dueDate: null,
      paymentTermsDays,
      supplierNameSnapshot: settings?.legalName ?? organisation.teamName,
      supplierAddressSnapshot:
        settings?.registeredAddress ?? organisationAddress(organisation),
      supplierCompanyNumber: settings?.companyNumber ?? null,
      supplierVatNumber: settings?.vatNumber ?? null,
      paymentInstructionsSnapshot: settings?.paymentInstructions ?? null,
      customerNameSnapshot: customer.name,
      customerAddressSnapshot: customerAddress(customer) || null,
      customerEmailSnapshot: customer.email,
      subtotal: roundMoney(subtotal).toFixed(2),
      vatTotal: roundMoney(vatTotal).toFixed(2),
      total: roundMoney(subtotal + vatTotal).toFixed(2),
      notes: optionalString(formData.get("notes")),
      createdByUserId: access.userId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(customerInvoiceJobs).values(
      selectedJobs.map((job) => ({
        organisationId: access.organisationId,
        invoiceId,
        jobId: job.id,
        createdAt: now,
      })),
    );

    await tx.insert(customerInvoiceLines).values(
      invoiceLineValues.map((line) => ({
        ...line,
        invoiceId,
      })),
    );
  });

  revalidateCommercial(jobIds);
  commercialRedirect("success", "invoice_draft_created", `invoice-${invoiceId}`);
}

export async function issueInvoiceAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const invoiceId = cleanString(formData.get("invoiceId"));

  if (!invoiceId) commercialRedirect("error", "invoice_required");

  const invoice = await database.query.customerInvoices.findFirst({
    where: and(
      eq(customerInvoices.id, invoiceId),
      eq(customerInvoices.organisationId, access.organisationId),
    ),
  });

  if (!invoice) commercialRedirect("error", "invoice_not_found");
  if (invoice.status !== "draft") {
    commercialRedirect("error", "only_draft_can_issue", `invoice-${invoiceId}`);
  }

  const [settings, currentCustomer] = await Promise.all([
    database.query.commercialSettings.findFirst({
      where: eq(commercialSettings.organisationId, access.organisationId),
    }),
    database.query.counterparties.findFirst({
      where: and(
        eq(counterparties.id, invoice.customerId),
        eq(counterparties.organisationId, access.organisationId),
      ),
    }),
  ]);

  const currentCustomerAddress = currentCustomer
    ? customerAddress(currentCustomer)
    : "";
  const resolvedCustomerAddress =
    currentCustomerAddress || invoice.customerAddressSnapshot || null;

  if (!resolvedCustomerAddress) {
    commercialRedirect("error", "customer_address_required", `invoice-${invoiceId}`);
  }

  const supplierVatNumber = invoice.supplierVatNumber ?? settings?.vatNumber ?? null;

  if (Number(invoice.vatTotal) !== 0 && !supplierVatNumber) {
    commercialRedirect("error", "vat_number_required", `invoice-${invoiceId}`);
  }

  const now = new Date();
  const issueYear = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      year: "numeric",
    }).format(now),
  );
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + invoice.paymentTermsDays);

  const linkedJobs = await database.query.customerInvoiceJobs.findMany({
    where: and(
      eq(customerInvoiceJobs.invoiceId, invoiceId),
      eq(customerInvoiceJobs.organisationId, access.organisationId),
    ),
  });

  try {
    await database.transaction(async (tx) => {
      /*
        Lock this draft before allocating a sequence number. If two users click
        Issue at the same time, the second transaction waits and then sees that
        the invoice is no longer a draft, so it does not consume another number.
      */
      await tx.execute(sql`
        SELECT "id"
        FROM "bb_customer_invoice"
        WHERE "id" = ${invoiceId}
          AND "organisationId" = ${access.organisationId}
        FOR UPDATE
      `);

      const lockedInvoice = await tx.query.customerInvoices.findFirst({
        where: and(
          eq(customerInvoices.id, invoiceId),
          eq(customerInvoices.organisationId, access.organisationId),
        ),
        columns: { status: true },
      });

      if (!lockedInvoice || lockedInvoice.status !== "draft") {
        throw new Error("INVOICE_ALREADY_ISSUED");
      }

      /*
        Atomic organisation/year counter. PostgreSQL performs the increment inside
        the upsert so two different invoices issued at the same time cannot receive
        the same sequence number.
      */
      const [counter] = await tx
      .insert(customerInvoiceCounters)
      .values({
        organisationId: access.organisationId,
        year: issueYear,
        lastNumber: 1,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          customerInvoiceCounters.organisationId,
          customerInvoiceCounters.year,
        ],
        set: {
          lastNumber: sql`${customerInvoiceCounters.lastNumber} + 1`,
          updatedAt: now,
        },
      })
      .returning({ lastNumber: customerInvoiceCounters.lastNumber });

    if (!counter) throw new Error("INVOICE_COUNTER_FAILED");

    const prefix = settings?.invoicePrefix || "INV";
    const generated = `${prefix}-${issueYear}-${String(counter.lastNumber).padStart(6, "0")}`;

    await tx
      .update(customerInvoices)
      .set({
        invoiceNumber: generated,
        status: "issued",
        issueDate: now,
        dueDate,
        supplierNameSnapshot: settings?.legalName ?? invoice.supplierNameSnapshot,
        supplierAddressSnapshot:
          settings?.registeredAddress ?? invoice.supplierAddressSnapshot,
        supplierCompanyNumber:
          settings?.companyNumber ?? invoice.supplierCompanyNumber,
        supplierVatNumber,
        paymentInstructionsSnapshot:
          settings?.paymentInstructions ?? invoice.paymentInstructionsSnapshot,
        customerNameSnapshot:
          currentCustomer?.name ?? invoice.customerNameSnapshot,
        customerAddressSnapshot: resolvedCustomerAddress,
        customerEmailSnapshot:
          currentCustomer?.email ?? invoice.customerEmailSnapshot,
        issuedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(customerInvoices.id, invoiceId),
          eq(customerInvoices.organisationId, access.organisationId),
        ),
      );

    if (linkedJobs.length > 0) {
      await tx
        .update(jobs)
        .set({
          customerInvoiceReference: generated,
          customerInvoicedAt: now,
          updatedAt: now,
        })
        .where(
          and(
            eq(jobs.organisationId, access.organisationId),
            inArray(jobs.id, linkedJobs.map((row) => row.jobId)),
          ),
        );
    }

      return generated;
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INVOICE_ALREADY_ISSUED") {
      commercialRedirect("error", "only_draft_can_issue", `invoice-${invoiceId}`);
    }

    throw error;
  }

  revalidateCommercial(linkedJobs.map((row) => row.jobId));
  commercialRedirect("success", "invoice_issued", `invoice-${invoiceId}`);
}

export async function markInvoicePaidAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const invoiceId = cleanString(formData.get("invoiceId"));

  if (!invoiceId) commercialRedirect("error", "invoice_required");

  const invoice = await database.query.customerInvoices.findFirst({
    where: and(
      eq(customerInvoices.id, invoiceId),
      eq(customerInvoices.organisationId, access.organisationId),
    ),
  });

  if (!invoice) commercialRedirect("error", "invoice_not_found");
  if (invoice.status !== "issued") {
    commercialRedirect("error", "invoice_must_be_issued", `invoice-${invoiceId}`);
  }

  await database
    .update(customerInvoices)
    .set({
      status: "paid",
      paidAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customerInvoices.id, invoiceId),
        eq(customerInvoices.organisationId, access.organisationId),
      ),
    );

  revalidateCommercial();
  commercialRedirect("success", "invoice_paid", `invoice-${invoiceId}`);
}

export async function voidDraftInvoiceAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const invoiceId = cleanString(formData.get("invoiceId"));

  if (!invoiceId) commercialRedirect("error", "invoice_required");

  const invoice = await database.query.customerInvoices.findFirst({
    where: and(
      eq(customerInvoices.id, invoiceId),
      eq(customerInvoices.organisationId, access.organisationId),
    ),
  });

  if (!invoice) commercialRedirect("error", "invoice_not_found");
  if (invoice.status !== "draft") {
    commercialRedirect("error", "only_draft_can_void", `invoice-${invoiceId}`);
  }

  await database
    .update(customerInvoices)
    .set({
      status: "void",
      voidedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customerInvoices.id, invoiceId),
        eq(customerInvoices.organisationId, access.organisationId),
      ),
    );

  revalidateCommercial();
  commercialRedirect("success", "invoice_voided");
}

export async function sendInvoiceEmailAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const invoiceId = cleanString(formData.get("invoiceId"));
  const recipient = cleanString(formData.get("recipient"));

  if (!invoiceId || !recipient) {
    commercialRedirect("error", "invoice_email_required", `invoice-${invoiceId}`);
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.INVOICE_FROM_EMAIL;

  if (!apiKey || !from) {
    commercialRedirect("error", "invoice_email_not_configured", `invoice-${invoiceId}`);
  }

  const document = await getCustomerInvoiceDocument({
    organisationId: access.organisationId,
    invoiceId,
  });

  if (!document) commercialRedirect("error", "invoice_not_found");
  if (document.invoice.status !== "issued" || !document.invoice.invoiceNumber) {
    commercialRedirect("error", "invoice_must_be_issued", `invoice-${invoiceId}`);
  }

  const bytes = await buildCustomerInvoicePdf(document);
  const resend = new Resend(apiKey);

  const result = await resend.emails.send({
    from,
    to: recipient,
    subject: `${document.invoice.invoiceNumber} · ${document.invoice.supplierNameSnapshot}`,
    html: `
      <p>Hello,</p>
      <p>Please find attached invoice <strong>${document.invoice.invoiceNumber}</strong>
      from ${document.invoice.supplierNameSnapshot}.</p>
      <p>Total: <strong>£${Number(document.invoice.total).toFixed(2)}</strong></p>
      <p>Due: ${document.invoice.dueDate ? document.invoice.dueDate.toLocaleDateString("en-GB") : "see invoice"}</p>
      <p>Regards,<br />${document.invoice.supplierNameSnapshot}</p>
    `,
    attachments: [
      {
        filename: `${document.invoice.invoiceNumber}.pdf`,
        content: Buffer.from(bytes),
      },
    ],
  });

  if (result.error) {
    commercialRedirect("error", "invoice_email_failed", `invoice-${invoiceId}`);
  }

  await database
    .update(customerInvoices)
    .set({
      lastEmailedTo: recipient,
      lastEmailedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(customerInvoices.id, invoiceId),
        eq(customerInvoices.organisationId, access.organisationId),
      ),
    );

  revalidateCommercial();
  commercialRedirect("success", "invoice_emailed", `invoice-${invoiceId}`);
}
