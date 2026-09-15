-- WASTE_X_PERMIT_EWC_EQUIVALENCE_V1
-- Controlled EWC equivalence / legacy-code acceptance.
-- This does not create a generic permit override.

CREATE TABLE "bb_permit_ewc_equivalence" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL,
  "permitId" text NOT NULL,
  "permittedEwcCodeId" text NOT NULL,
  "acceptedEwcCodeId" text NOT NULL,
  "basis" text NOT NULL,
  "reference" text NOT NULL,
  "validFrom" timestamp,
  "validUntil" timestamp,
  "notes" text,
  "documentKey" text,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdByUserId" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

ALTER TABLE "bb_permit_ewc_equivalence"
  ADD CONSTRAINT "bb_permit_ewc_equivalence_organisationId_bb_organisation_id_fk"
  FOREIGN KEY ("organisationId") REFERENCES "public"."bb_organisation"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "bb_permit_ewc_equivalence"
  ADD CONSTRAINT "bb_permit_ewc_equivalence_permitId_bb_site_permit_id_fk"
  FOREIGN KEY ("permitId") REFERENCES "public"."bb_site_permit"("id")
  ON DELETE cascade ON UPDATE no action;

ALTER TABLE "bb_permit_ewc_equivalence"
  ADD CONSTRAINT "bb_permit_ewc_equivalence_permittedEwcCodeId_bb_ewc_code_id_fk"
  FOREIGN KEY ("permittedEwcCodeId") REFERENCES "public"."bb_ewc_code"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "bb_permit_ewc_equivalence"
  ADD CONSTRAINT "bb_permit_ewc_equivalence_acceptedEwcCodeId_bb_ewc_code_id_fk"
  FOREIGN KEY ("acceptedEwcCodeId") REFERENCES "public"."bb_ewc_code"("id")
  ON DELETE restrict ON UPDATE no action;

ALTER TABLE "bb_permit_ewc_equivalence"
  ADD CONSTRAINT "bb_permit_ewc_equivalence_createdByUserId_bb_user_id_fk"
  FOREIGN KEY ("createdByUserId") REFERENCES "public"."bb_user"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "permit_ewc_equivalence_org_idx"
  ON "bb_permit_ewc_equivalence" ("organisationId");
CREATE INDEX "permit_ewc_equivalence_permit_idx"
  ON "bb_permit_ewc_equivalence" ("permitId");
CREATE INDEX "permit_ewc_equivalence_accepted_idx"
  ON "bb_permit_ewc_equivalence" ("acceptedEwcCodeId");
CREATE INDEX "permit_ewc_equivalence_active_idx"
  ON "bb_permit_ewc_equivalence" ("permitId", "isActive");

ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcMatchType" text;
ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcEquivalenceId" text;
ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcBasis" text;
ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcReference" text;
ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcCodeSnapshot" text;
ALTER TABLE "bb_job_load" ADD COLUMN "permitEwcCheckedAt" timestamp;

ALTER TABLE "bb_job_load"
  ADD CONSTRAINT "bb_job_load_permitEwcEquivalenceId_bb_permit_ewc_equivalence_id_fk"
  FOREIGN KEY ("permitEwcEquivalenceId")
  REFERENCES "public"."bb_permit_ewc_equivalence"("id")
  ON DELETE set null ON UPDATE no action;

CREATE INDEX "job_load_permit_ewc_equivalence_idx"
  ON "bb_job_load" ("permitEwcEquivalenceId");
