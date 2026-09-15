-- WASTE_X_MULTI_WASTE_ITEM_LOAD_V1
-- One physical Job Load can contain multiple identifiable waste items.
-- Additive compatibility migration: legacy bb_job_load material/EWC fields stay.

BEGIN;

CREATE TABLE IF NOT EXISTS "bb_job_load_waste_item" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "jobLoadId" text NOT NULL REFERENCES "bb_job_load"("id") ON DELETE CASCADE,
  "itemNumber" integer NOT NULL,

  "materialProfileId" text REFERENCES "bb_material_profile"("id") ON DELETE SET NULL,
  "ewcCodeId" text REFERENCES "bb_ewc_code"("id") ON DELETE SET NULL,
  "ewcCodeSnapshot" text NOT NULL,
  "wasteDescriptionSnapshot" text NOT NULL,
  "physicalFormSnapshot" text,
  "numberOfContainers" integer,
  "containerTypeSnapshot" text,

  "containsPops" boolean NOT NULL DEFAULT false,
  "popsSourceOfComponents" text,
  "popsComponents" text,

  "containsHazardous" boolean NOT NULL DEFAULT false,
  "hazardousSourceOfComponents" text,
  "hazardousHazCodes" text,
  "hazardousComponents" text,

  "disposalRecoveryCodeId" text REFERENCES "bb_disposal_recovery_code"("id") ON DELETE SET NULL,
  "disposalRecoveryCodeSnapshot" text,

  "weightMetric" text NOT NULL DEFAULT 'Tonnes',
  "weightAmount" numeric(14,3),
  "weightIsEstimate" boolean NOT NULL DEFAULT false,
  "weightSource" text NOT NULL DEFAULT 'allocation',

  "permitEwcMatchType" text,
  "regulatoryAuthorityActivationId" text REFERENCES "bb_site_regulatory_authority"("id") ON DELETE SET NULL,
  "regulatoryAcceptanceRuleId" text REFERENCES "bb_regulatory_acceptance_rule"("id") ON DELETE SET NULL,
  "regulatoryRuleKeySnapshot" text,
  "regulatoryRuleScopeSnapshot" text,
  "qualifyingAuthorisationRefSnapshot" text,
  "permitEwcBasis" text,
  "permitEwcReference" text,
  "permitEwcCodeSnapshot" text,
  "permitEwcCheckedAt" timestamp,

  "createdByUserId" text REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now(),

  CONSTRAINT "job_load_waste_item_load_number_unique"
    UNIQUE ("jobLoadId", "itemNumber")
);

CREATE INDEX IF NOT EXISTS "job_load_waste_item_org_idx"
  ON "bb_job_load_waste_item" ("organisationId");
CREATE INDEX IF NOT EXISTS "job_load_waste_item_load_idx"
  ON "bb_job_load_waste_item" ("jobLoadId");
CREATE INDEX IF NOT EXISTS "job_load_waste_item_ewc_idx"
  ON "bb_job_load_waste_item" ("ewcCodeId");
CREATE INDEX IF NOT EXISTS "job_load_waste_item_material_idx"
  ON "bb_job_load_waste_item" ("materialProfileId");
CREATE INDEX IF NOT EXISTS "job_load_waste_item_regulatory_activation_idx"
  ON "bb_job_load_waste_item" ("regulatoryAuthorityActivationId");
CREATE INDEX IF NOT EXISTS "job_load_waste_item_regulatory_rule_idx"
  ON "bb_job_load_waste_item" ("regulatoryAcceptanceRuleId");

-- Existing single-item Loads become one-item Loads without changing their identity.
INSERT INTO "bb_job_load_waste_item" (
  "id",
  "organisationId",
  "jobLoadId",
  "itemNumber",
  "materialProfileId",
  "ewcCodeId",
  "ewcCodeSnapshot",
  "wasteDescriptionSnapshot",
  "physicalFormSnapshot",
  "numberOfContainers",
  "containerTypeSnapshot",
  "containsPops",
  "popsSourceOfComponents",
  "popsComponents",
  "containsHazardous",
  "hazardousSourceOfComponents",
  "hazardousHazCodes",
  "hazardousComponents",
  "disposalRecoveryCodeId",
  "disposalRecoveryCodeSnapshot",
  "weightMetric",
  "weightAmount",
  "weightIsEstimate",
  "weightSource",
  "permitEwcMatchType",
  "regulatoryAuthorityActivationId",
  "permitEwcBasis",
  "permitEwcReference",
  "permitEwcCodeSnapshot",
  "permitEwcCheckedAt",
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'legacy-' || l."id",
  l."organisationId",
  l."id",
  1,
  l."materialProfileId",
  l."ewcCodeId",
  COALESCE(NULLIF(l."ewcCodeSnapshot", ''), 'NOT_RECORDED'),
  COALESCE(NULLIF(l."wasteDescriptionSnapshot", ''), 'Waste description not recorded'),
  l."physicalFormSnapshot",
  l."numberOfContainers",
  l."containerTypeSnapshot",
  COALESCE(l."containsPops", false),
  l."popsSourceOfComponents",
  l."popsComponents",
  COALESCE(l."containsHazardous", false),
  l."hazardousSourceOfComponents",
  l."hazardousHazCodes",
  l."hazardousComponents",
  l."disposalRecoveryCodeId",
  l."disposalRecoveryCodeSnapshot",
  COALESCE(l."weightMetric", 'Tonnes'),
  CASE
    WHEN l."netWeight" IS NOT NULL AND l."netWeight"::numeric > 0
      THEN l."netWeight"
    ELSE NULL
  END,
  COALESCE(l."weightIsEstimate", false),
  'allocation',
  l."permitEwcMatchType",
  l."regulatoryAuthorityActivationId",
  l."permitEwcBasis",
  l."permitEwcReference",
  l."permitEwcCodeSnapshot",
  l."permitEwcCheckedAt",
  l."createdByUserId",
  COALESCE(l."createdAt", now()),
  COALESCE(l."updatedAt", now())
FROM "bb_job_load" l
WHERE NOT EXISTS (
  SELECT 1
  FROM "bb_job_load_waste_item" i
  WHERE i."jobLoadId" = l."id"
);

COMMIT;
