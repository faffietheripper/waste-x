import { relations } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  counterparties,
  jobs,
  organisations,
  users,
} from "./schema";

export type JobCommercialKind = "revenue" | "cost";
export type JobCommercialUnit = "tonne" | "load" | "job";
export type JobCommercialCategory =
  | "customer_charge"
  | "haulage_charge"
  | "haulage_cost"
  | "tipping_cost"
  | "material_sale"
  | "surcharge"
  | "discount"
  | "other";

export type CustomerInvoiceStatus =
  | "draft"
  | "issued"
  | "paid"
  | "void";


/* Organisation-level defaults used when producing customer invoices. */
export const commercialSettings = pgTable(
  "bb_commercial_settings",
  {
    organisationId: text("organisationId")
      .primaryKey()
      .references(() => organisations.id, { onDelete: "cascade" }),

    legalName: text("legalName"),
    companyNumber: text("companyNumber"),
    vatNumber: text("vatNumber"),
    registeredAddress: text("registeredAddress"),

    invoicePrefix: text("invoicePrefix").notNull().default("INV"),
    defaultPaymentTermsDays: integer("defaultPaymentTermsDays")
      .notNull()
      .default(30),

    paymentInstructions: text("paymentInstructions"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
);

/*
  Job-specific commercial truth.

  The existing bb_rate table remains available as a legacy/reference library,
  but these lines are the commercial terms actually agreed for this Job.
*/
export const jobCommercialLines = pgTable(
  "bb_job_commercial_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    jobId: text("jobId")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    kind: text("kind").$type<JobCommercialKind>().notNull(),

    category: text("category")
      .$type<JobCommercialCategory>()
      .notNull(),

    description: text("description").notNull(),

    amount: numeric("amount", {
      precision: 14,
      scale: 2,
    }).notNull(),

    unit: text("unit").$type<JobCommercialUnit>().notNull(),

    currency: text("currency").notNull().default("GBP"),

    vatRate: numeric("vatRate", {
      precision: 5,
      scale: 2,
    })
      .notNull()
      .default("20.00"),

    sortOrder: integer("sortOrder").notNull().default(0),
    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_commercial_line_org_idx").on(table.organisationId),
    jobIdx: index("job_commercial_line_job_idx").on(table.jobId),
    activeIdx: index("job_commercial_line_active_idx").on(
      table.organisationId,
      table.jobId,
      table.isActive,
    ),
  }),
);

/* Atomic per-organisation/year counter for sequential invoice numbers. */
export const customerInvoiceCounters = pgTable(
  "bb_customer_invoice_counter",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    year: integer("year").notNull(),
    lastNumber: integer("lastNumber").notNull().default(0),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.organisationId, table.year] }),
  }),
);

/*
  These are customer operational invoices.
  They are deliberately separate from bb_invoice / bb_payment, which are used
  for Waste X platform subscription billing.
*/
export const customerInvoices = pgTable(
  "bb_customer_invoice",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    customerId: text("customerId")
      .notNull()
      .references(() => counterparties.id, { onDelete: "restrict" }),

    invoiceNumber: text("invoiceNumber"),

    status: text("status")
      .$type<CustomerInvoiceStatus>()
      .notNull()
      .default("draft"),

    currency: text("currency").notNull().default("GBP"),

    issueDate: timestamp("issueDate", { mode: "date" }),
    supplyDate: timestamp("supplyDate", { mode: "date" }),
    dueDate: timestamp("dueDate", { mode: "date" }),
    paymentTermsDays: integer("paymentTermsDays").notNull().default(30),

    supplierNameSnapshot: text("supplierNameSnapshot").notNull(),
    supplierAddressSnapshot: text("supplierAddressSnapshot").notNull(),
    supplierCompanyNumber: text("supplierCompanyNumber"),
    supplierVatNumber: text("supplierVatNumber"),
    paymentInstructionsSnapshot: text("paymentInstructionsSnapshot"),

    customerNameSnapshot: text("customerNameSnapshot").notNull(),
    customerAddressSnapshot: text("customerAddressSnapshot"),
    customerEmailSnapshot: text("customerEmailSnapshot"),

    subtotal: numeric("subtotal", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0.00"),

    vatTotal: numeric("vatTotal", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0.00"),

    total: numeric("total", {
      precision: 14,
      scale: 2,
    })
      .notNull()
      .default("0.00"),

    notes: text("notes"),

    externalAccountingProvider: text("externalAccountingProvider"),
    externalAccountingReference: text("externalAccountingReference"),

    lastEmailedTo: text("lastEmailedTo"),
    lastEmailedAt: timestamp("lastEmailedAt", { mode: "date" }),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    issuedAt: timestamp("issuedAt", { mode: "date" }),
    paidAt: timestamp("paidAt", { mode: "date" }),
    voidedAt: timestamp("voidedAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("customer_invoice_org_idx").on(table.organisationId),
    customerIdx: index("customer_invoice_customer_idx").on(table.customerId),
    statusIdx: index("customer_invoice_status_idx").on(
      table.organisationId,
      table.status,
    ),
    numberUnique: uniqueIndex("customer_invoice_number_unique").on(
      table.organisationId,
      table.invoiceNumber,
    ),
  }),
);

export const customerInvoiceJobs = pgTable(
  "bb_customer_invoice_job",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    invoiceId: text("invoiceId")
      .notNull()
      .references(() => customerInvoices.id, { onDelete: "cascade" }),

    jobId: text("jobId")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.invoiceId, table.jobId] }),
    orgIdx: index("customer_invoice_job_org_idx").on(table.organisationId),
    jobIdx: index("customer_invoice_job_job_idx").on(table.jobId),
  }),
);

export const customerInvoiceLines = pgTable(
  "bb_customer_invoice_line",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    invoiceId: text("invoiceId")
      .notNull()
      .references(() => customerInvoices.id, { onDelete: "cascade" }),

    jobId: text("jobId")
      .references(() => jobs.id, { onDelete: "set null" }),

    jobCommercialLineId: text("jobCommercialLineId").references(
      () => jobCommercialLines.id,
      { onDelete: "set null" },
    ),

    description: text("description").notNull(),
    jobNumberSnapshot: text("jobNumberSnapshot"),

    quantity: numeric("quantity", {
      precision: 14,
      scale: 3,
    }).notNull(),

    unit: text("unit").$type<JobCommercialUnit>().notNull(),

    unitPrice: numeric("unitPrice", {
      precision: 14,
      scale: 2,
    }).notNull(),

    vatRate: numeric("vatRate", {
      precision: 5,
      scale: 2,
    }).notNull(),

    netAmount: numeric("netAmount", {
      precision: 14,
      scale: 2,
    }).notNull(),

    vatAmount: numeric("vatAmount", {
      precision: 14,
      scale: 2,
    }).notNull(),

    grossAmount: numeric("grossAmount", {
      precision: 14,
      scale: 2,
    }).notNull(),

    sortOrder: integer("sortOrder").notNull().default(0),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("customer_invoice_line_org_idx").on(table.organisationId),
    invoiceIdx: index("customer_invoice_line_invoice_idx").on(table.invoiceId),
    jobIdx: index("customer_invoice_line_job_idx").on(table.jobId),
  }),
);

export const commercialSettingsRelations = relations(
  commercialSettings,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [commercialSettings.organisationId],
      references: [organisations.id],
    }),
  }),
);

export const jobCommercialLinesRelations = relations(
  jobCommercialLines,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [jobCommercialLines.organisationId],
      references: [organisations.id],
    }),
    job: one(jobs, {
      fields: [jobCommercialLines.jobId],
      references: [jobs.id],
    }),
    createdBy: one(users, {
      fields: [jobCommercialLines.createdByUserId],
      references: [users.id],
    }),
  }),
);

export const customerInvoicesRelations = relations(
  customerInvoices,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [customerInvoices.organisationId],
      references: [organisations.id],
    }),
    customer: one(counterparties, {
      fields: [customerInvoices.customerId],
      references: [counterparties.id],
    }),
    createdBy: one(users, {
      fields: [customerInvoices.createdByUserId],
      references: [users.id],
    }),
    lines: many(customerInvoiceLines),
    jobs: many(customerInvoiceJobs),
  }),
);

export const customerInvoiceLinesRelations = relations(
  customerInvoiceLines,
  ({ one }) => ({
    invoice: one(customerInvoices, {
      fields: [customerInvoiceLines.invoiceId],
      references: [customerInvoices.id],
    }),
    job: one(jobs, {
      fields: [customerInvoiceLines.jobId],
      references: [jobs.id],
    }),
    commercialLine: one(jobCommercialLines, {
      fields: [customerInvoiceLines.jobCommercialLineId],
      references: [jobCommercialLines.id],
    }),
  }),
);

export const customerInvoiceJobsRelations = relations(
  customerInvoiceJobs,
  ({ one }) => ({
    invoice: one(customerInvoices, {
      fields: [customerInvoiceJobs.invoiceId],
      references: [customerInvoices.id],
    }),
    job: one(jobs, {
      fields: [customerInvoiceJobs.jobId],
      references: [jobs.id],
    }),
  }),
);
