-- WASTE X — JOB-SPECIFIC COMMERCIALS + CUSTOMER INVOICING
-- Additive migration. It does not drop or rename the existing bb_rate,
-- bb_invoice, bb_payment or Job/Load commercial snapshot columns.


CREATE TABLE IF NOT EXISTS "bb_commercial_settings" (
  "organisationId" text PRIMARY KEY NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "legalName" text,
  "companyNumber" text,
  "vatNumber" text,
  "registeredAddress" text,
  "invoicePrefix" text NOT NULL DEFAULT 'INV',
  "defaultPaymentTermsDays" integer NOT NULL DEFAULT 30,
  "paymentInstructions" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "bb_job_commercial_line" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "jobId" text NOT NULL REFERENCES "bb_job"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "category" text NOT NULL,
  "description" text NOT NULL,
  "amount" numeric(14,2) NOT NULL,
  "unit" text NOT NULL,
  "currency" text NOT NULL DEFAULT 'GBP',
  "vatRate" numeric(5,2) NOT NULL DEFAULT '20.00',
  "sortOrder" integer NOT NULL DEFAULT 0,
  "isActive" boolean NOT NULL DEFAULT true,
  "notes" text,
  "createdByUserId" text REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "job_commercial_line_org_idx"
  ON "bb_job_commercial_line" ("organisationId");
CREATE INDEX IF NOT EXISTS "job_commercial_line_job_idx"
  ON "bb_job_commercial_line" ("jobId");
CREATE INDEX IF NOT EXISTS "job_commercial_line_active_idx"
  ON "bb_job_commercial_line" ("organisationId", "jobId", "isActive");

CREATE TABLE IF NOT EXISTS "bb_customer_invoice_counter" (
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "year" integer NOT NULL,
  "lastNumber" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "bb_customer_invoice_counter_pk"
    PRIMARY KEY ("organisationId", "year")
);

CREATE TABLE IF NOT EXISTS "bb_customer_invoice" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "customerId" text NOT NULL REFERENCES "bb_counterparty"("id") ON DELETE RESTRICT,
  "invoiceNumber" text,
  "status" text NOT NULL DEFAULT 'draft',
  "currency" text NOT NULL DEFAULT 'GBP',
  "issueDate" timestamp,
  "supplyDate" timestamp,
  "dueDate" timestamp,
  "paymentTermsDays" integer NOT NULL DEFAULT 30,
  "supplierNameSnapshot" text NOT NULL,
  "supplierAddressSnapshot" text NOT NULL,
  "supplierCompanyNumber" text,
  "supplierVatNumber" text,
  "paymentInstructionsSnapshot" text,
  "customerNameSnapshot" text NOT NULL,
  "customerAddressSnapshot" text,
  "customerEmailSnapshot" text,
  "subtotal" numeric(14,2) NOT NULL DEFAULT '0.00',
  "vatTotal" numeric(14,2) NOT NULL DEFAULT '0.00',
  "total" numeric(14,2) NOT NULL DEFAULT '0.00',
  "notes" text,
  "externalAccountingProvider" text,
  "externalAccountingReference" text,
  "lastEmailedTo" text,
  "lastEmailedAt" timestamp,
  "createdByUserId" text REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "issuedAt" timestamp,
  "paidAt" timestamp,
  "voidedAt" timestamp,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "customer_invoice_org_idx"
  ON "bb_customer_invoice" ("organisationId");
CREATE INDEX IF NOT EXISTS "customer_invoice_customer_idx"
  ON "bb_customer_invoice" ("customerId");
CREATE INDEX IF NOT EXISTS "customer_invoice_status_idx"
  ON "bb_customer_invoice" ("organisationId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "customer_invoice_number_unique"
  ON "bb_customer_invoice" ("organisationId", "invoiceNumber");

CREATE TABLE IF NOT EXISTS "bb_customer_invoice_job" (
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "invoiceId" text NOT NULL REFERENCES "bb_customer_invoice"("id") ON DELETE CASCADE,
  "jobId" text NOT NULL REFERENCES "bb_job"("id") ON DELETE RESTRICT,
  "createdAt" timestamp DEFAULT now(),
  CONSTRAINT "bb_customer_invoice_job_pk" PRIMARY KEY ("invoiceId", "jobId")
);

CREATE INDEX IF NOT EXISTS "customer_invoice_job_org_idx"
  ON "bb_customer_invoice_job" ("organisationId");
CREATE INDEX IF NOT EXISTS "customer_invoice_job_job_idx"
  ON "bb_customer_invoice_job" ("jobId");

CREATE TABLE IF NOT EXISTS "bb_customer_invoice_line" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "invoiceId" text NOT NULL REFERENCES "bb_customer_invoice"("id") ON DELETE CASCADE,
  "jobId" text REFERENCES "bb_job"("id") ON DELETE SET NULL,
  "jobCommercialLineId" text REFERENCES "bb_job_commercial_line"("id") ON DELETE SET NULL,
  "description" text NOT NULL,
  "jobNumberSnapshot" text,
  "quantity" numeric(14,3) NOT NULL,
  "unit" text NOT NULL,
  "unitPrice" numeric(14,2) NOT NULL,
  "vatRate" numeric(5,2) NOT NULL,
  "netAmount" numeric(14,2) NOT NULL,
  "vatAmount" numeric(14,2) NOT NULL,
  "grossAmount" numeric(14,2) NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "customer_invoice_line_org_idx"
  ON "bb_customer_invoice_line" ("organisationId");
CREATE INDEX IF NOT EXISTS "customer_invoice_line_invoice_idx"
  ON "bb_customer_invoice_line" ("invoiceId");
CREATE INDEX IF NOT EXISTS "customer_invoice_line_job_idx"
  ON "bb_customer_invoice_line" ("jobId");
