-- WASTE_X_REGULATORY_ACCEPTANCE_V1
-- WASTE_X_REGULATORY_RULE_SCOPE_V1
--
-- IMPORTANT:
-- Regulatory authority activation alone authorises no waste.
-- A site must explicitly enable a specific library rule.
-- This prevents a broad RPS from becoming a generic permit bypass.

ALTER TABLE "bb_ewc_code"
  ADD COLUMN IF NOT EXISTS "classificationUsable" boolean NOT NULL DEFAULT true;

ALTER TABLE "bb_ewc_code"
  ADD COLUMN IF NOT EXISTS "authorisationUsable" boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS "ewc_classification_usable_idx"
  ON "bb_ewc_code" ("classificationUsable");

CREATE INDEX IF NOT EXISTS "ewc_authorisation_usable_idx"
  ON "bb_ewc_code" ("authorisationUsable");

-- EWC reference rows are deliberately not hard-coded here.
-- The DB apply runner populates/normalises prerequisite EWC rows from the
-- repository's existing src/ewc-codes.json in the same transaction.
--
-- classificationUsable and authorisationUsable are independent flags.
-- Do not globally disable factual classification for `99` codes.

DO $$
DECLARE
  missing_codes text;
BEGIN
  SELECT string_agg(required.code, ', ' ORDER BY required.code)
  INTO missing_codes
  FROM (
    VALUES
      ('020106'),('020199'),('020201'),('020202'),('020203'),('020299'),
      ('020301'),('020304'),('020399'),('020499'),('020501'),('020599'),
      ('020601'),('020699'),('020704'),('020799'),('101399'),('150101'),
      ('150102'),('150103'),('150104'),('150105'),('150106'),('150107'),
      ('150109'),('160304'),('160306'),('161002'),('190503'),('190599'),
      ('190805'),('190899'),('190999'),('200108'),('200199'),('200399')
  ) AS required(code)
  LEFT JOIN "bb_ewc_code" ewc
    ON ewc."code" = required.code
  WHERE ewc."id" IS NULL;

  IF missing_codes IS NOT NULL THEN
    RAISE EXCEPTION
      'Regulatory acceptance migration requires canonical EWC catalogue rows: %',
      missing_codes;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "bb_regulatory_acceptance_authority" (
  "id" text PRIMARY KEY,
  "code" text NOT NULL,
  "name" text NOT NULL,
  "regulator" text NOT NULL,
  "jurisdiction" text NOT NULL,
  "authorityType" text NOT NULL,
  "ruleType" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "sourceUrl" text,
  "validFrom" timestamp,
  "validUntil" timestamp,
  "reviewAt" timestamp,
  "conditionsSummary" text,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "reg_acceptance_authority_code_unique"
  ON "bb_regulatory_acceptance_authority" ("code");

CREATE TABLE IF NOT EXISTS "bb_regulatory_acceptance_rule" (
  "id" text PRIMARY KEY,
  "authorityId" text NOT NULL
    REFERENCES "bb_regulatory_acceptance_authority"("id") ON DELETE CASCADE,
  "ruleKey" text NOT NULL,
  "legacyWasteDescription" text,
  "actualWasteDescription" text,
  "qualifyingAuthorisationRefs" text[],
  "originSubChapterCode" text,
  "specialConditions" text,
  "actualEwcCodeId" text NOT NULL
    REFERENCES "bb_ewc_code"("id") ON DELETE RESTRICT,
  "underlyingAuthorisationEwcCodeId" text
    REFERENCES "bb_ewc_code"("id") ON DELETE RESTRICT,
  "requiresUnderlyingPermitCode" boolean NOT NULL DEFAULT false,
  "requiresManualConfirmation" boolean NOT NULL DEFAULT true,
  "ruleNote" text,
  "sourceLocator" text,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "reg_acceptance_rule_unique"
  ON "bb_regulatory_acceptance_rule" ("authorityId", "ruleKey");

CREATE INDEX IF NOT EXISTS "reg_acceptance_rule_actual_ewc_idx"
  ON "bb_regulatory_acceptance_rule" ("actualEwcCodeId");

CREATE INDEX IF NOT EXISTS "reg_acceptance_rule_underlying_ewc_idx"
  ON "bb_regulatory_acceptance_rule" ("underlyingAuthorisationEwcCodeId");

CREATE TABLE IF NOT EXISTS "bb_site_regulatory_authority" (
  "id" text PRIMARY KEY,
  "organisationId" text NOT NULL
    REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "siteId" text NOT NULL
    REFERENCES "bb_sites"("id") ON DELETE CASCADE,
  "permitId" text
    REFERENCES "bb_site_permit"("id") ON DELETE CASCADE,
  "authorityId" text NOT NULL
    REFERENCES "bb_regulatory_acceptance_authority"("id") ON DELETE RESTRICT,
  "reference" text NOT NULL,
  "notes" text,
  "documentKey" text,
  "validFrom" timestamp,
  "validUntil" timestamp,
  "conditionsConfirmedAt" timestamp,
  "conditionsConfirmedByUserId" text
    REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdByUserId" text
    REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_reg_authority_unique"
  ON "bb_site_regulatory_authority" ("siteId", "permitId", "authorityId");

CREATE TABLE IF NOT EXISTS "bb_site_regulatory_authority_rule" (
  "id" text PRIMARY KEY,
  "organisationId" text NOT NULL
    REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "siteId" text NOT NULL
    REFERENCES "bb_sites"("id") ON DELETE CASCADE,
  "permitId" text NOT NULL
    REFERENCES "bb_site_permit"("id") ON DELETE CASCADE,
  "activationId" text NOT NULL
    REFERENCES "bb_site_regulatory_authority"("id") ON DELETE CASCADE,
  "ruleId" text NOT NULL
    REFERENCES "bb_regulatory_acceptance_rule"("id") ON DELETE RESTRICT,
  "qualifyingAuthorisationRef" text,
  "evidenceNote" text,
  "confirmedAt" timestamp NOT NULL DEFAULT now(),
  "confirmedByUserId" text
    REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "isActive" boolean NOT NULL DEFAULT true,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "site_reg_rule_unique"
  ON "bb_site_regulatory_authority_rule" ("activationId", "ruleId");

CREATE INDEX IF NOT EXISTS "reg_acceptance_authority_regulator_idx"
  ON "bb_regulatory_acceptance_authority" ("regulator");

CREATE INDEX IF NOT EXISTS "reg_acceptance_authority_status_idx"
  ON "bb_regulatory_acceptance_authority" ("status");

CREATE INDEX IF NOT EXISTS "reg_acceptance_rule_authority_idx"
  ON "bb_regulatory_acceptance_rule" ("authorityId");

CREATE INDEX IF NOT EXISTS "site_reg_authority_org_idx"
  ON "bb_site_regulatory_authority" ("organisationId");

CREATE INDEX IF NOT EXISTS "site_reg_authority_site_idx"
  ON "bb_site_regulatory_authority" ("siteId");

CREATE INDEX IF NOT EXISTS "site_reg_authority_permit_idx"
  ON "bb_site_regulatory_authority" ("permitId");

CREATE INDEX IF NOT EXISTS "site_reg_authority_authority_idx"
  ON "bb_site_regulatory_authority" ("authorityId");

CREATE INDEX IF NOT EXISTS "site_reg_rule_org_idx"
  ON "bb_site_regulatory_authority_rule" ("organisationId");

CREATE INDEX IF NOT EXISTS "site_reg_rule_site_idx"
  ON "bb_site_regulatory_authority_rule" ("siteId");

CREATE INDEX IF NOT EXISTS "site_reg_rule_permit_idx"
  ON "bb_site_regulatory_authority_rule" ("permitId");

CREATE INDEX IF NOT EXISTS "site_reg_rule_activation_idx"
  ON "bb_site_regulatory_authority_rule" ("activationId");

CREATE INDEX IF NOT EXISTS "site_reg_rule_rule_idx"
  ON "bb_site_regulatory_authority_rule" ("ruleId");

ALTER TABLE "bb_job_load"
  ADD COLUMN IF NOT EXISTS "regulatoryAuthorityActivationId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'bb_job_load_regulatoryAuthorityActivationId_fk'
  ) THEN
    ALTER TABLE "bb_job_load"
      ADD CONSTRAINT "bb_job_load_regulatoryAuthorityActivationId_fk"
      FOREIGN KEY ("regulatoryAuthorityActivationId")
      REFERENCES "bb_site_regulatory_authority"("id")
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "job_load_regulatory_authority_activation_idx"
  ON "bb_job_load" ("regulatoryAuthorityActivationId");

INSERT INTO "bb_regulatory_acceptance_authority" (
  "id","code","name","regulator","jurisdiction",
  "authorityType","ruleType","status",
  "sourceUrl","validFrom","reviewAt","conditionsSummary",
  "createdAt","updatedAt"
)
VALUES
(
  'regauth-rps-241',
  'RPS_241',
  'Waste codes accepted instead of specified 99 codes',
  'EA','England','RPS','code_substitution','active',
  'https://www.gov.uk/government/publications/waste-codes-you-can-accept-instead-of-those-ending-in-99-rps-241/waste-codes-you-can-accept-instead-of-those-ending-in-99-rps-241',
  '2025-05-22','2028-05-31',
  'Only Appendix 1 replacements for the same waste; the underlying permit or exemption and all RPS conditions still apply.',
  now(),now()
),
(
  'regauth-rps-273',
  'RPS_273',
  'Recovering unused waste plastics coded 16 03 06',
  'EA','England','RPS','additional_code','active',
  'https://www.gov.uk/government/publications/recovering-unused-waste-plastics-coded-16-03-06-rps-273/treating-or-using-unused-waste-plastics-for-recovery-rps-273',
  '2022-12-29','2029-07-01',
  'Applies to unused waste plastics 16 03 06 where a qualifying plastics permit or T4/U9 exemption applies and all RPS conditions are met.',
  now(),now()
),
(
  'regauth-rps-234',
  'RPS_234',
  'Accepting household packaging waste at HWRCs',
  'EA','England','RPS','additional_code','active',
  'https://www.gov.uk/government/publications/accepting-classifying-and-disposing-of-household-packaging-waste-rps-234',
  '2020-06-10','2027-01-01',
  'Applies to qualifying separately collected household packaging waste at a HWRC where the relevant 15 01 code is absent from the permit.',
  now(),now()
)
ON CONFLICT ("code") DO UPDATE SET
  "name"=EXCLUDED."name",
  "status"=EXCLUDED."status",
  "sourceUrl"=EXCLUDED."sourceUrl",
  "reviewAt"=EXCLUDED."reviewAt",
  "conditionsSummary"=EXCLUDED."conditionsSummary",
  "updatedAt"=now();

-- RPS 241 Appendix 1.
-- Descriptions below are concise operational summaries, not replacements for
-- the official RPS. Sites must select the exact applicable rule.
WITH rule_seed(
  rule_key,
  underlying_code,
  actual_code,
  legacy_scope,
  actual_scope,
  qualifying_refs,
  origin_subchapter,
  special_conditions
) AS (
VALUES
('rps241-020199-milk-161002','020199','161002','Milk from agricultural premises','Milk / agricultural liquid waste coded 16 10 02',ARRAY['SR2010 No 4','SR2010 No 17','U10','Bespoke permit containing this 99 code']::text[],'0201','Waste must originate from the WM3 02 01 sub-chapter.'),
('rps241-020199-farm-washwater-161002','020199','161002','Untreated farm fruit/vegetable wash water','Untreated wash water coded 16 10 02',ARRAY['SR2010 No 4','SR2010 No 17','U10','Bespoke permit containing this 99 code']::text[],'0201','Waste must originate from the WM3 02 01 sub-chapter.'),
('rps241-020199-slurry-020106','020199','020106','Slurry, manure and specified soiled bedding except abattoirs','Animal faeces, urine, manure and relevant bedding coded 02 01 06',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020199-bedding-020106','020199','020106','Fully biodegradable animal bedding','Fully biodegradable animal bedding coded 02 01 06',ARRAY['T23','T24','T25','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020299-abattoir-slurry-020106','020299','020106','Abattoir slurry, manure and specified soiled bedding','Relevant animal waste coded 02 01 06',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020299-abp-sludge-020201','020299','020201','ABP handling/processing wash-water sludge meeting ABPR requirements','Sludges coded 02 02 01',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,'Animal by-products regulatory requirements must be met.'),
('rps241-020299-abp-washwater-161002','020299','161002','ABP handling/processing wash water meeting ABPR requirements','Wash water coded 16 10 02',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],'0202','Waste must originate from the WM3 02 02 sub-chapter and meet ABPR requirements.'),
('rps241-020299-rendering-020202','020299','020202','Processed animal by-product material from rendering','Animal-tissue related material coded 02 02 02',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020299-catering-020203','020299','020203','Catering waste','Material unsuitable for consumption coded 02 02 03',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020399-soils-020301','020399','020301','Soils from cleaning/washing fruit and vegetables','Soils/sludges from cleaning and washing coded 02 03 01',ARRAY['SR2010 No 4','SR2010 No 17','S2','U10','U11','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020399-farm-washwater-161002','020399','161002','Untreated farm fruit/vegetable wash water','Untreated wash water coded 16 10 02',ARRAY['SR2010 No 4','SR2010 No 17','U10','Bespoke permit containing this 99 code']::text[],'0203','Waste must originate from the WM3 02 03 sub-chapter.'),
('rps241-020399-food-processing-020203','020399','020203','Biodegradable waste from relevant food processing','Biodegradable processing waste coded 02 02 03',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020399-food-processing-020304','020399','020304','Biodegradable waste from relevant food processing','Biodegradable processing waste coded 02 03 04',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020499-sugar-020304','020499','020304','Biodegradable waste from sugar processing','Biodegradable processing waste coded 02 03 04',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020599-dairy-020501','020599','020501','Biodegradable waste from dairy processing','Dairy processing waste coded 02 05 01',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020699-bakery-020601','020699','020601','Biodegradable waste from baking/confectionery processing','Processing waste coded 02 06 01',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-020799-beverage-020704','020799','020704','Biodegradable waste from beverage raw-material processing','Material unsuitable for consumption/processing coded 02 07 04',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-101399-gypsum-160304','101399','160304','Gypsum from cement/lime/plaster manufacture','Gypsum coded 16 03 04',ARRAY['SR2010 No 4','SR2010 No 5','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-190599-non-source-compost-190503','190599','190503','Compost derived from non-source-segregated biodegradable waste','Compost-like output coded 19 05 03',ARRAY['SR2010 No 5','SR2010 No 17','Bespoke permit containing this 99 code']::text[],NULL,NULL),
('rps241-190599-liquor-digestate-161002','190599','161002','Liquor/digestate from aerobic treatment of source-segregated biodegradable waste','Liquor/digestate coded 16 10 02',ARRAY['SR2010 No 4','SR2010 No 17','Bespoke permit containing this 99 code']::text[],'1905','Waste must originate from the WM3 19 05 sub-chapter.'),
('rps241-190599-t23-t26-compost-190503','190599','190503','Compost from treatment described by T23 or T26','Compost coded 19 05 03',ARRAY['T5','Bespoke permit containing this 99 code']::text[],NULL,'Treatment must be within the RPS Appendix 1 T23/T26 context.'),
('rps241-190899-effluent-161002','190899','161002','Final effluent','Effluent coded 16 10 02',ARRAY['U7','Bespoke permit containing this 99 code']::text[],'1908','Waste must originate from the WM3 19 08 sub-chapter.'),
('rps241-190899-centrate-161002','190899','161002','Centrate liquor','Centrate liquor coded 16 10 02',ARRAY['T21','Bespoke permit containing this 99 code']::text[],'1908','Waste must originate from the WM3 19 08 sub-chapter.'),
('rps241-190999-water-treatment-161002','190999','161002','Wastewater and borehole flushings','Wastewater/flushings coded 16 10 02',ARRAY['T20','Bespoke permit containing this 99 code']::text[],'1909','Waste must originate from the WM3 19 09 sub-chapter.'),
('rps241-200199-food-200108','200199','200108','Non-liquid food unsuitable for consumption/processing','Biodegradable kitchen/canteen waste coded 20 01 08',ARRAY['T13','Bespoke permit containing this 99 code']::text[],NULL,'Excludes food covered by animal-by-products controls where the RPS says so.'),
('rps241-200399-cesspool-161002','200399','161002','Cesspool waste','Cesspool waste coded 16 10 02',ARRAY['T21','Bespoke permit containing this 99 code']::text[],'2003','For mixed cesspool/sewage-sludge loads, duty-of-care documentation must identify both applicable codes.'),
('rps241-200399-sewage-sludge-190805','200399','190805','Other sewage sludge','Sewage sludge coded 19 08 05',ARRAY['T21','Bespoke permit containing this 99 code']::text[],NULL,'For mixed cesspool/sewage-sludge loads, duty-of-care documentation must identify both applicable codes.'),
('rps241-200399-railway-sanitary-161002','200399','161002','Waste from railway sanitary conveniences','Sanitary waste coded 16 10 02',ARRAY['D2','Bespoke permit containing this 99 code']::text[],'2003','Waste must originate from the WM3 20 03 sub-chapter.'),
('rps241-200399-portable-sanitary-161002','200399','161002','Waste from portable sanitary conveniences','Sanitary waste coded 16 10 02',ARRAY['D3','Bespoke permit containing this 99 code']::text[],'2003','Waste must originate from the WM3 20 03 sub-chapter.')
)
INSERT INTO "bb_regulatory_acceptance_rule" (
  "id","authorityId","ruleKey",
  "legacyWasteDescription","actualWasteDescription",
  "qualifyingAuthorisationRefs","originSubChapterCode","specialConditions",
  "actualEwcCodeId","underlyingAuthorisationEwcCodeId",
  "requiresUnderlyingPermitCode","requiresManualConfirmation",
  "ruleNote","sourceLocator","isActive","createdAt","updatedAt"
)
SELECT
  'regauth-rule-' || rule_seed.rule_key,
  'regauth-rps-241',
  rule_seed.rule_key,
  rule_seed.legacy_scope,
  rule_seed.actual_scope,
  rule_seed.qualifying_refs,
  rule_seed.origin_subchapter,
  rule_seed.special_conditions,
  actual."id",
  underlying."id",
  true,
  true,
  'Site must explicitly enable this exact Appendix 1 rule.',
  'RPS 241 Appendix 1',
  true,
  now(),
  now()
FROM rule_seed
JOIN "bb_ewc_code" actual
  ON actual."code" = rule_seed.actual_code
JOIN "bb_ewc_code" underlying
  ON underlying."code" = rule_seed.underlying_code
ON CONFLICT ("authorityId","ruleKey") DO UPDATE SET
  "legacyWasteDescription"=EXCLUDED."legacyWasteDescription",
  "actualWasteDescription"=EXCLUDED."actualWasteDescription",
  "qualifyingAuthorisationRefs"=EXCLUDED."qualifyingAuthorisationRefs",
  "originSubChapterCode"=EXCLUDED."originSubChapterCode",
  "specialConditions"=EXCLUDED."specialConditions",
  "updatedAt"=now();

-- RPS 273: additional-code authority rather than a one-to-one old/new pair.
INSERT INTO "bb_regulatory_acceptance_rule" (
  "id","authorityId","ruleKey",
  "actualWasteDescription","qualifyingAuthorisationRefs",
  "specialConditions","actualEwcCodeId",
  "underlyingAuthorisationEwcCodeId",
  "requiresUnderlyingPermitCode","requiresManualConfirmation",
  "ruleNote","sourceLocator","isActive","createdAt","updatedAt"
)
SELECT
  'regauth-rule-rps273-unused-plastics-160306',
  'regauth-rps-273',
  'rps273-unused-plastics-160306',
  'Unused waste plastics coded 16 03 06',
  ARRAY[
    'Environmental permit authorising treatment/use of waste plastics',
    'T4',
    'U9'
  ]::text[],
  'Only unused plastics within the RPS activity; permit/exemption limits and tonnage limits still apply.',
  actual."id",
  NULL,
  false,
  true,
  'Additional-code authority. Site must confirm the qualifying plastics authority.',
  'RPS 273',
  true,
  now(),
  now()
FROM "bb_ewc_code" actual
WHERE actual."code"='160306'
ON CONFLICT ("authorityId","ruleKey") DO UPDATE SET
  "qualifyingAuthorisationRefs"=EXCLUDED."qualifyingAuthorisationRefs",
  "specialConditions"=EXCLUDED."specialConditions",
  "updatedAt"=now();

-- RPS 234: one rule per factual packaging code that exists in the catalogue.
INSERT INTO "bb_regulatory_acceptance_rule" (
  "id","authorityId","ruleKey",
  "actualWasteDescription","qualifyingAuthorisationRefs",
  "specialConditions","actualEwcCodeId",
  "underlyingAuthorisationEwcCodeId",
  "requiresUnderlyingPermitCode","requiresManualConfirmation",
  "ruleNote","sourceLocator","isActive","createdAt","updatedAt"
)
SELECT
  'regauth-rule-rps234-' || actual."code",
  'regauth-rps-234',
  'rps234-' || actual."code",
  'Separately collected household packaging waste at a qualifying HWRC',
  ARRAY['Environmental permit for a qualifying HWRC']::text[],
  'The site must meet all RPS 234 conditions; this rule does not waive other legal requirements.',
  actual."id",
  NULL,
  false,
  true,
  'Additional-code authority for a qualifying HWRC.',
  'RPS 234',
  true,
  now(),
  now()
FROM "bb_ewc_code" actual
WHERE actual."code" IN (
  '150101','150102','150103','150104','150105',
  '150106','150107','150109'
)
ON CONFLICT ("authorityId","ruleKey") DO UPDATE SET
  "qualifyingAuthorisationRefs"=EXCLUDED."qualifyingAuthorisationRefs",
  "specialConditions"=EXCLUDED."specialConditions",
  "updatedAt"=now();
