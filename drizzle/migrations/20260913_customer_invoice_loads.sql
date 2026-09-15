-- WASTE X — PER-LOAD CUSTOMER INVOICING
-- Additive migration. Existing Job-level invoices remain valid.

CREATE TABLE IF NOT EXISTS "bb_customer_invoice_load" (
  "organisationId" text NOT NULL
    REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "invoiceId" text NOT NULL
    REFERENCES "bb_customer_invoice"("id") ON DELETE CASCADE,
  "jobId" text NOT NULL
    REFERENCES "bb_job"("id") ON DELETE RESTRICT,
  "jobLoadId" text NOT NULL
    REFERENCES "bb_job_load"("id") ON DELETE RESTRICT,
  "createdAt" timestamp DEFAULT now(),
  CONSTRAINT "bb_customer_invoice_load_pk"
    PRIMARY KEY ("invoiceId", "jobLoadId")
);

CREATE INDEX IF NOT EXISTS "customer_invoice_load_org_idx"
  ON "bb_customer_invoice_load" ("organisationId");

CREATE INDEX IF NOT EXISTS "customer_invoice_load_invoice_idx"
  ON "bb_customer_invoice_load" ("invoiceId");

CREATE INDEX IF NOT EXISTS "customer_invoice_load_job_idx"
  ON "bb_customer_invoice_load" ("jobId");

CREATE UNIQUE INDEX IF NOT EXISTS "customer_invoice_load_unique"
  ON "bb_customer_invoice_load" ("organisationId", "jobLoadId");

ALTER TABLE "bb_customer_invoice_line"
  ADD COLUMN IF NOT EXISTS "jobLoadId" text
    REFERENCES "bb_job_load"("id") ON DELETE SET NULL;

ALTER TABLE "bb_customer_invoice_line"
  ADD COLUMN IF NOT EXISTS "loadNumberSnapshot" integer;

CREATE INDEX IF NOT EXISTS "customer_invoice_line_load_idx"
  ON "bb_customer_invoice_line" ("jobLoadId");
