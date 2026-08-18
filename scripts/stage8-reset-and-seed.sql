/*
  ============================================================
  WASTE X — STAGE 8 FULL TEST DATABASE RESET + SEED
  ============================================================

  ⚠️ DESTRUCTIVE
  RUN ONLY AGAINST LOCAL / DEMO / CONTROLLED TEST DATABASES
  UNLESS YOU INTENTIONALLY WANT TO RESET MAIN.

  THIS SCRIPT:

  - Clears mutable Waste X bb_* application data
  - Preserves bb_waste_tracking_reference_data
  - Resets serial identities
  - Creates Stage 8 platform admins
  - Creates carrier organisation + user
  - Creates waste manager organisation + users
  - Creates receiving site
  - Creates environmental permit
  - Seeds full Chapter 17 construction/demolition EWC catalogue
  - Seeds useful adjacent construction-site EWC codes
  - Seeds permitted EWC mappings
  - Creates clients and client sites
  - Creates external haulier
  - Creates third-party facility + authorisation
  - Creates drivers and vehicles
  - Creates realistic material profiles
  - Creates commercial rates

  INTENTIONALLY NOT CREATED:

  - Jobs
  - Job Loads
  - Waste Receipts
  - DWT submissions
  - Support tickets
  - Marketplace listings/bids
  - Test invitation users

  Those must be created through Waste X during Stage 8 testing.
*/

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;


/* ============================================================
   0. DATABASE IDENTIFICATION
============================================================ */

DO $$
BEGIN
  RAISE NOTICE
    'Running Waste X Stage 8 reset against database: %',
    current_database();
END
$$;


/* ============================================================
   1. CLEAR WASTE X APPLICATION DATA

   PRESERVED:
   ------------------------------------------------------------
   bb_waste_tracking_reference_data

   That table is the cached DWT/reference-data layer rather
   than customer/business transactional data.
============================================================ */

DO $$
DECLARE
  table_list text;
BEGIN
  SELECT string_agg(
    format('%I.%I', schemaname, tablename),
    ', '
  )
  INTO table_list
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename LIKE 'bb\_%' ESCAPE '\'
    AND tablename <> 'bb_waste_tracking_reference_data';

  IF table_list IS NOT NULL THEN
    EXECUTE
      'TRUNCATE TABLE '
      || table_list
      || ' RESTART IDENTITY CASCADE';
  END IF;
END
$$;


/* ============================================================
   2. ORGANISATIONS
============================================================ */

INSERT INTO bb_organisation (
  id,
  "teamName",
  "profilePicture",
  capabilities,
  "operatingMode",
  industry,
  telephone,
  "emailAddress",
  country,
  "streetAddress",
  city,
  region,
  "postCode",
  "isSuspended",
  "createdAt",
  "subscriptionStatus",
  "subscriptionPlan",
  "trialEndsAt",
  "billingEmail",
  status,
  "approvedAt"
)
VALUES

/* ------------------------------------------------------------
   EAST ANGLIA MOVERS
------------------------------------------------------------- */

(
  'stage8-org-east-anglia-movers',
  'East Anglia Movers',
  NULL,
  ARRAY['carrier'],
  'carrier_ops',
  'Waste transport and haulage',
  '01473 000101',
  'skyrockersltd@gmail.com',
  'United Kingdom',
  '1 Demo Haulage Park',
  'Ipswich',
  'Suffolk',
  'IP1 1AA',
  false,
  now(),
  'active',
  'pro',
  now() + interval '90 days',
  'skyrockersltd@gmail.com',
  'ACTIVE',
  now()
),

/* ------------------------------------------------------------
   SUFFOLK WASTE MANAGEMENT
------------------------------------------------------------- */

(
  'stage8-org-suffolk-waste',
  'Suffolk Waste Management',
  NULL,
  ARRAY['manager'],
  'team',
  'Waste management and recovery',
  '01473 000202',
  'wastex.hello@gmail.com',
  'United Kingdom',
  '1 Demo Recycling Way',
  'Ipswich',
  'Suffolk',
  'IP2 8XX',
  false,
  now(),
  'active',
  'pro',
  now() + interval '90 days',
  'wastex.hello@gmail.com',
  'ACTIVE',
  now()
);


/* ============================================================
   3. LEGACY / NETWORK DEPARTMENTS

   Solo does not depend on these.

   They remain useful for retained Marketplace/network
   compatibility testing.
============================================================ */

INSERT INTO bb_departments (
  id,
  "organisationId",
  name,
  type,
  "createdAt"
)
VALUES

(
  'stage8-dept-east-anglia-carrier',
  'stage8-org-east-anglia-movers',
  'Carrier Operations',
  'carrier',
  now()
),

(
  'stage8-dept-east-anglia-compliance',
  'stage8-org-east-anglia-movers',
  'Compliance',
  'compliance',
  now()
),

(
  'stage8-dept-suffolk-manager',
  'stage8-org-suffolk-waste',
  'Waste Operations',
  'manager',
  now()
),

(
  'stage8-dept-suffolk-compliance',
  'stage8-org-suffolk-waste',
  'Compliance',
  'compliance',
  now()
);


/* ============================================================
   4. USERS
============================================================ */

INSERT INTO bb_user (
  id,
  name,
  email,
  "emailVerified",
  "passwordHash",
  "organisationId",
  "departmentId",
  role,
  "soloAccessPreset",
  "isActive",
  "isSuspended",
  status,
  "createdAt"
)
VALUES

/* ------------------------------------------------------------
   WASTE X PLATFORM ADMIN
------------------------------------------------------------- */

(
  'stage8-user-platform-tafadzwa',
  'Tafadzwa Mpofu',
  'tafadzwampofu24@gmail.com',
  now(),
  crypt(
    'Tafadzwa@24',
    gen_salt('bf', 10)
  ),
  NULL,
  NULL,
  'platform_admin',
  NULL,
  true,
  false,
  'ACTIVE',
  now()
),

/* ------------------------------------------------------------
   WASTE X PLATFORM ADMIN
------------------------------------------------------------- */

(
  'stage8-user-platform-wastex',
  'Waste X Admin',
  'admin@wastextracking.com',
  now(),
  crypt(
    'Tafadzwa@24',
    gen_salt('bf', 10)
  ),
  NULL,
  NULL,
  'platform_admin',
  NULL,
  true,
  false,
  'ACTIVE',
  now()
),

/* ------------------------------------------------------------
   EAST ANGLIA MOVERS EMPLOYEE
------------------------------------------------------------- */

(
  'stage8-user-terry',
  'Terry Williams',
  'skyrockersltd@gmail.com',
  now(),
  crypt(
    'wearehere24',
    gen_salt('bf', 10)
  ),
  'stage8-org-east-anglia-movers',
  'stage8-dept-east-anglia-carrier',
  'employee',
  'operations',
  true,
  false,
  'ACTIVE',
  now()
),

/* ------------------------------------------------------------
   SUFFOLK WASTE MANAGEMENT ADMINISTRATOR
------------------------------------------------------------- */

(
  'stage8-user-matt',
  'Matt Stevens',
  'wastex.hello@gmail.com',
  now(),
  crypt(
    'tinoandjay',
    gen_salt('bf', 10)
  ),
  'stage8-org-suffolk-waste',
  'stage8-dept-suffolk-compliance',
  'administrator',
  'administrator',
  true,
  false,
  'ACTIVE',
  now()
),

/* ------------------------------------------------------------
   SUFFOLK WASTE MANAGEMENT EMPLOYEE
------------------------------------------------------------- */

(
  'stage8-user-tino',
  'Tino Demo',
  'tino@wastextracking.com',
  now(),
  crypt(
    'tinodemo',
    gen_salt('bf', 10)
  ),
  'stage8-org-suffolk-waste',
  'stage8-dept-suffolk-manager',
  'employee',
  'operations',
  true,
  false,
  'ACTIVE',
  now()
);


/* ============================================================
   5. USER PROFILES
============================================================ */

INSERT INTO bb_user_profile (
  id,
  "userId",
  "fullName",
  telephone,
  "emailAddress",
  country,
  "streetAddress",
  city,
  region,
  "postCode",
  "createdAt",
  "updatedAt"
)
VALUES

(
  'stage8-profile-tafadzwa',
  'stage8-user-platform-tafadzwa',
  'Tafadzwa Mpofu',
  NULL,
  'tafadzwampofu24@gmail.com',
  'United Kingdom',
  NULL,
  NULL,
  NULL,
  NULL,
  now(),
  now()
),

(
  'stage8-profile-wastex-admin',
  'stage8-user-platform-wastex',
  'Waste X Admin',
  NULL,
  'admin@wastextracking.com',
  'United Kingdom',
  NULL,
  NULL,
  NULL,
  NULL,
  now(),
  now()
),

(
  'stage8-profile-terry',
  'stage8-user-terry',
  'Terry Williams',
  '01473 000101',
  'skyrockersltd@gmail.com',
  'United Kingdom',
  '1 Demo Haulage Park',
  'Ipswich',
  'Suffolk',
  'IP1 1AA',
  now(),
  now()
),

(
  'stage8-profile-matt',
  'stage8-user-matt',
  'Matt Stevens',
  '01473 000202',
  'wastex.hello@gmail.com',
  'United Kingdom',
  '1 Demo Recycling Way',
  'Ipswich',
  'Suffolk',
  'IP2 8XX',
  now(),
  now()
),

(
  'stage8-profile-tino',
  'stage8-user-tino',
  'Tino Demo',
  '01473 000203',
  'tino@wastextracking.com',
  'United Kingdom',
  '1 Demo Recycling Way',
  'Ipswich',
  'Suffolk',
  'IP2 8XX',
  now(),
  now()
);


/* ============================================================
   6. OPERATIONAL SITES
============================================================ */

INSERT INTO bb_sites (
  id,
  "organisationId",
  name,
  "siteType",
  "fullAddress",
  postcode,
  "permitNumber",
  "isDefault",
  status,
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   EAST ANGLIA MOVERS
------------------------------------------------------------- */

(
  'stage8-site-east-anglia-depot',
  'stage8-org-east-anglia-movers',
  'Ipswich Depot',
  'depot',
  '1 Demo Haulage Park, Ipswich, Suffolk, United Kingdom',
  'IP1 1AA',
  NULL,
  true,
  'active',
  now(),
  now()
),

/* ------------------------------------------------------------
   SUFFOLK WASTE MANAGEMENT
------------------------------------------------------------- */

(
  'stage8-site-suffolk-receiving',
  'stage8-org-suffolk-waste',
  'Suffolk Waste Receiving Site',
  'waste_receiving_site',
  '1 Demo Recycling Way, Ipswich, Suffolk, United Kingdom',
  'IP2 8XX',
  'EPR-DEMO-SUFFOLK-001',
  true,
  'active',
  now(),
  now()
);


/* ============================================================
   7. FULL CONSTRUCTION & DEMOLITION EWC CATALOGUE

   CHAPTER 17
   Construction and demolition wastes,
   including excavated soil from contaminated sites.

   IMPORTANT:

   * is not stored in the code itself.
   Hazard status is represented by isHazardous.

   These being present in the EWC catalogue DOES NOT mean
   Suffolk Waste Management is authorised to accept them.

   Permit mappings are configured separately below.
============================================================ */

INSERT INTO bb_ewc_code (
  id,
  code,
  description,
  "chapterCode",
  "chapterDescription",
  "subChapterCode",
  "subChapterDescription",
  "entryType",
  "isHazardous",
  source,
  "sourceVersion",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES

/* ============================================================
   17 01 — CONCRETE, BRICKS, TILES AND CERAMICS
============================================================ */

(
  'stage8-ewc-170101',
  '17 01 01',
  'Concrete',
  '17',
  'Construction and demolition wastes',
  '17 01',
  'Concrete, bricks, tiles and ceramics',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170102',
  '17 01 02',
  'Bricks',
  '17',
  'Construction and demolition wastes',
  '17 01',
  'Concrete, bricks, tiles and ceramics',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170103',
  '17 01 03',
  'Tiles and ceramics',
  '17',
  'Construction and demolition wastes',
  '17 01',
  'Concrete, bricks, tiles and ceramics',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170106',
  '17 01 06',
  'Mixtures of, or separate fractions of, concrete, bricks, tiles and ceramics containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 01',
  'Concrete, bricks, tiles and ceramics',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170107',
  '17 01 07',
  'Mixtures of concrete, bricks, tiles and ceramics other than those mentioned in 17 01 06',
  '17',
  'Construction and demolition wastes',
  '17 01',
  'Concrete, bricks, tiles and ceramics',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 02 — WOOD, GLASS AND PLASTIC
============================================================ */

(
  'stage8-ewc-170201',
  '17 02 01',
  'Wood',
  '17',
  'Construction and demolition wastes',
  '17 02',
  'Wood, glass and plastic',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170202',
  '17 02 02',
  'Glass',
  '17',
  'Construction and demolition wastes',
  '17 02',
  'Wood, glass and plastic',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170203',
  '17 02 03',
  'Plastic',
  '17',
  'Construction and demolition wastes',
  '17 02',
  'Wood, glass and plastic',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170204',
  '17 02 04',
  'Glass, plastic and wood containing or contaminated with hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 02',
  'Wood, glass and plastic',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 03 — BITUMINOUS MIXTURES, COAL TAR AND TARRED PRODUCTS
============================================================ */

(
  'stage8-ewc-170301',
  '17 03 01',
  'Bituminous mixtures containing coal tar',
  '17',
  'Construction and demolition wastes',
  '17 03',
  'Bituminous mixtures, coal tar and tarred products',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170302',
  '17 03 02',
  'Bituminous mixtures other than those mentioned in 17 03 01',
  '17',
  'Construction and demolition wastes',
  '17 03',
  'Bituminous mixtures, coal tar and tarred products',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170303',
  '17 03 03',
  'Coal tar and tarred products',
  '17',
  'Construction and demolition wastes',
  '17 03',
  'Bituminous mixtures, coal tar and tarred products',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 04 — METALS INCLUDING THEIR ALLOYS
============================================================ */

(
  'stage8-ewc-170401',
  '17 04 01',
  'Copper, bronze and brass',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170402',
  '17 04 02',
  'Aluminium',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170403',
  '17 04 03',
  'Lead',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170404',
  '17 04 04',
  'Zinc',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170405',
  '17 04 05',
  'Iron and steel',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170406',
  '17 04 06',
  'Tin',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170407',
  '17 04 07',
  'Mixed metals',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170409',
  '17 04 09',
  'Metal waste contaminated with hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170410',
  '17 04 10',
  'Cables containing oil, coal tar and other hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170411',
  '17 04 11',
  'Cables other than those mentioned in 17 04 10',
  '17',
  'Construction and demolition wastes',
  '17 04',
  'Metals including their alloys',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 05 — SOIL, STONES, DREDGING SPOIL AND TRACK BALLAST
============================================================ */

(
  'stage8-ewc-170503',
  '17 05 03',
  'Soil and stones containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170504',
  '17 05 04',
  'Soil and stones other than those mentioned in 17 05 03',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170505',
  '17 05 05',
  'Dredging spoil containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170506',
  '17 05 06',
  'Dredging spoil other than those mentioned in 17 05 05',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170507',
  '17 05 07',
  'Track ballast containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170508',
  '17 05 08',
  'Track ballast other than those mentioned in 17 05 07',
  '17',
  'Construction and demolition wastes',
  '17 05',
  'Soil, stones and dredging spoil',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 06 — INSULATION AND ASBESTOS-CONTAINING MATERIALS
============================================================ */

(
  'stage8-ewc-170601',
  '17 06 01',
  'Insulation materials containing asbestos',
  '17',
  'Construction and demolition wastes',
  '17 06',
  'Insulation materials and asbestos-containing construction materials',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170603',
  '17 06 03',
  'Other insulation materials consisting of or containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 06',
  'Insulation materials and asbestos-containing construction materials',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170604',
  '17 06 04',
  'Insulation materials other than those mentioned in 17 06 01 and 17 06 03',
  '17',
  'Construction and demolition wastes',
  '17 06',
  'Insulation materials and asbestos-containing construction materials',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170605',
  '17 06 05',
  'Construction materials containing asbestos',
  '17',
  'Construction and demolition wastes',
  '17 06',
  'Insulation materials and asbestos-containing construction materials',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 08 — GYPSUM-BASED CONSTRUCTION MATERIAL
============================================================ */

(
  'stage8-ewc-170801',
  '17 08 01',
  'Gypsum-based construction materials contaminated with hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 08',
  'Gypsum-based construction material',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170802',
  '17 08 02',
  'Gypsum-based construction materials other than those mentioned in 17 08 01',
  '17',
  'Construction and demolition wastes',
  '17 08',
  'Gypsum-based construction material',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),


/* ============================================================
   17 09 — OTHER CONSTRUCTION AND DEMOLITION WASTES
============================================================ */

(
  'stage8-ewc-170901',
  '17 09 01',
  'Construction and demolition wastes containing mercury',
  '17',
  'Construction and demolition wastes',
  '17 09',
  'Other construction and demolition wastes',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170902',
  '17 09 02',
  'Construction and demolition wastes containing PCB',
  '17',
  'Construction and demolition wastes',
  '17 09',
  'Other construction and demolition wastes',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170903',
  '17 09 03',
  'Other construction and demolition wastes including mixed wastes containing hazardous substances',
  '17',
  'Construction and demolition wastes',
  '17 09',
  'Other construction and demolition wastes',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-170904',
  '17 09 04',
  'Mixed construction and demolition wastes other than those mentioned in 17 09 01, 17 09 02 and 17 09 03',
  '17',
  'Construction and demolition wastes',
  '17 09',
  'Other construction and demolition wastes',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
);


/* ============================================================
   8. COMMON CONSTRUCTION-SITE ADJACENT EWC CODES

   These are useful operationally but are not Chapter 17.
============================================================ */

INSERT INTO bb_ewc_code (
  id,
  code,
  description,
  "chapterCode",
  "chapterDescription",
  "subChapterCode",
  "subChapterDescription",
  "entryType",
  "isHazardous",
  source,
  "sourceVersion",
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   PAINTS AND VARNISHES
------------------------------------------------------------- */

(
  'stage8-ewc-080111',
  '08 01 11',
  'Waste paint and varnish containing organic solvents or other hazardous substances',
  '08',
  'Wastes from coatings, adhesives, sealants and printing inks',
  '08 01',
  'Wastes from manufacture, formulation, supply, use and removal of paint and varnish',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-080112',
  '08 01 12',
  'Waste paint and varnish other than those mentioned in 08 01 11',
  '08',
  'Wastes from coatings, adhesives, sealants and printing inks',
  '08 01',
  'Wastes from manufacture, formulation, supply, use and removal of paint and varnish',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

/* ------------------------------------------------------------
   ADHESIVES AND SEALANTS
------------------------------------------------------------- */

(
  'stage8-ewc-080409',
  '08 04 09',
  'Waste adhesives and sealants containing organic solvents or other hazardous substances',
  '08',
  'Wastes from coatings, adhesives, sealants and printing inks',
  '08 04',
  'Wastes from manufacture, formulation, supply and use of adhesives and sealants',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-080410',
  '08 04 10',
  'Waste adhesives and sealants other than those mentioned in 08 04 09',
  '08',
  'Wastes from coatings, adhesives, sealants and printing inks',
  '08 04',
  'Wastes from manufacture, formulation, supply and use of adhesives and sealants',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

/* ------------------------------------------------------------
   PACKAGING
------------------------------------------------------------- */

(
  'stage8-ewc-150101',
  '15 01 01',
  'Paper and cardboard packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150102',
  '15 01 02',
  'Plastic packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150103',
  '15 01 03',
  'Wooden packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150104',
  '15 01 04',
  'Metallic packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150106',
  '15 01 06',
  'Mixed packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150107',
  '15 01 07',
  'Glass packaging',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150110',
  '15 01 10',
  'Packaging containing residues of or contaminated by hazardous substances',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 01',
  'Packaging',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

/* ------------------------------------------------------------
   ABSORBENTS / WIPING CLOTHS / PPE
------------------------------------------------------------- */

(
  'stage8-ewc-150202',
  '15 02 02',
  'Absorbents, filter materials, wiping cloths and protective clothing contaminated by hazardous substances',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 02',
  'Absorbents, filter materials, wiping cloths and protective clothing',
  NULL,
  true,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
),

(
  'stage8-ewc-150203',
  '15 02 03',
  'Absorbents, filter materials, wiping cloths and protective clothing other than those mentioned in 15 02 02',
  '15',
  'Waste packaging, absorbents, wiping cloths, filter materials and protective clothing',
  '15 02',
  'Absorbents, filter materials, wiping cloths and protective clothing',
  NULL,
  false,
  'official',
  'WM3 / GOV.UK Stage 8 catalogue',
  true,
  now(),
  now()
);


/* ============================================================
   9. DISPOSAL / RECOVERY CODES
============================================================ */

INSERT INTO bb_disposal_recovery_code (
  id,
  code,
  type,
  description,
  "isActive",
  source,
  "sourceVersion",
  "createdAt",
  "updatedAt"
)
VALUES

(
  'stage8-r3',
  'R3',
  'recovery',
  'Recycling/reclamation of organic substances which are not used as solvents',
  true,
  'official',
  'Stage 8 test catalogue',
  now(),
  now()
),

(
  'stage8-r4',
  'R4',
  'recovery',
  'Recycling/reclamation of metals and metal compounds',
  true,
  'official',
  'Stage 8 test catalogue',
  now(),
  now()
),

(
  'stage8-r5',
  'R5',
  'recovery',
  'Recycling/reclamation of other inorganic materials',
  true,
  'official',
  'Stage 8 test catalogue',
  now(),
  now()
),

(
  'stage8-r13',
  'R13',
  'recovery',
  'Storage of waste pending a recovery operation',
  true,
  'official',
  'Stage 8 test catalogue',
  now(),
  now()
),

(
  'stage8-d1',
  'D1',
  'disposal',
  'Deposit into or on to land',
  true,
  'official',
  'Stage 8 test catalogue',
  now(),
  now()
);


/* ============================================================
   10. SUFFOLK RECEIVING-SITE PERMIT

   DEMO PERMIT ONLY.

   THIS IS NOT A REAL ENVIRONMENTAL PERMIT.
============================================================ */

INSERT INTO bb_site_permit (
  id,
  "organisationId",
  "siteId",
  "permitNumber",
  regulator,
  "authorisationType",
  status,
  "isPrimary",
  "validFrom",
  "expiresAt",
  notes,
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'stage8-permit-suffolk',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'EPR-DEMO-SUFFOLK-001',
  'EA',
  'permit',
  'active',
  true,
  now() - interval '1 year',
  now() + interval '3 years',
  'Stage 8 demonstration permit only. Not a real regulatory authorisation.',
  'stage8-user-matt',
  now(),
  now()
);


/* ============================================================
   11. SUFFOLK PERMITTED EWC CODES

   Deliberately broad NON-HAZARDOUS demo list.

   Hazardous Chapter 17 codes remain in the catalogue but
   are deliberately NOT mapped to this receiving-site permit.

   That gives Stage 8 genuine permit validation tests.
============================================================ */

INSERT INTO bb_permit_ewc_code (
  "organisationId",
  "permitId",
  "ewcCodeId",
  "isActive",
  "configuredByUserId",
  "createdAt"
)
VALUES

/* Concrete / bricks / ceramics */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170101',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170102',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170103',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170107',
  true,
  'stage8-user-matt',
  now()
),

/* Wood / glass / plastic */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170201',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170202',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170203',
  true,
  'stage8-user-matt',
  now()
),

/* Asphalt / road planings */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170302',
  true,
  'stage8-user-matt',
  now()
),

/* Metals */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170401',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170402',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170403',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170404',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170405',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170406',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170407',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170411',
  true,
  'stage8-user-matt',
  now()
),

/* Soil / dredging spoil / ballast */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170504',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170506',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170508',
  true,
  'stage8-user-matt',
  now()
),

/* Insulation */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170604',
  true,
  'stage8-user-matt',
  now()
),

/* Gypsum */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170802',
  true,
  'stage8-user-matt',
  now()
),

/* Mixed C&D */

(
  'stage8-org-suffolk-waste',
  'stage8-permit-suffolk',
  'stage8-ewc-170904',
  true,
  'stage8-user-matt',
  now()
);


/* ============================================================
   12. COUNTERPARTIES
============================================================ */

INSERT INTO bb_counterparty (
  id,
  "organisationId",
  name,
  "accountReference",
  email,
  telephone,
  "fullAddress",
  postcode,
  "carrierRegistrationNumber",
  "brokerDealerRegistrationNumber",
  "paymentTermsDays",
  notes,
  "isActive",
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   CLIENT
------------------------------------------------------------- */

(
  'stage8-cp-anglia-construction',
  'stage8-org-suffolk-waste',
  'Anglia Construction Ltd',
  'ANG-001',
  'accounts@anglia-construction.test',
  '01473 100001',
  '10 Demo Construction Road, Ipswich, Suffolk',
  'IP3 0AA',
  NULL,
  NULL,
  30,
  'Stage 8 construction client.',
  true,
  now(),
  now()
),

/* ------------------------------------------------------------
   EXTERNAL HAULIER
------------------------------------------------------------- */

(
  'stage8-cp-east-anglia-movers',
  'stage8-org-suffolk-waste',
  'East Anglia Movers',
  'EAM-001',
  'skyrockersltd@gmail.com',
  '01473 000101',
  '1 Demo Haulage Park, Ipswich, Suffolk',
  'IP1 1AA',
  'CBDU-DEMO-EAM-001',
  NULL,
  30,
  'Stage 8 external haulier.',
  true,
  now(),
  now()
),

/* ------------------------------------------------------------
   THIRD-PARTY FACILITY OPERATOR
------------------------------------------------------------- */

(
  'stage8-cp-norfolk-recovery',
  'stage8-org-suffolk-waste',
  'Norfolk Recovery Ltd',
  'NRL-001',
  'operations@norfolk-recovery.test',
  '01603 100001',
  '50 Demo Recovery Road, Norwich, Norfolk',
  'NR1 1AA',
  NULL,
  NULL,
  30,
  'Stage 8 third-party receiving facility operator.',
  true,
  now(),
  now()
);


/* ============================================================
   13. COUNTERPARTY ROLES
============================================================ */

INSERT INTO bb_counterparty_role (
  "organisationId",
  "counterpartyId",
  role,
  "createdAt"
)
VALUES

(
  'stage8-org-suffolk-waste',
  'stage8-cp-anglia-construction',
  'client',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-cp-anglia-construction',
  'producer',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-cp-east-anglia-movers',
  'haulier',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-cp-norfolk-recovery',
  'receiver',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-cp-norfolk-recovery',
  'third_party_tip',
  now()
);


/* ============================================================
   14. CLIENT + THIRD-PARTY SITES
============================================================ */

INSERT INTO bb_counterparty_site (
  id,
  "organisationId",
  "counterpartyId",
  name,
  "siteType",
  "fullAddress",
  postcode,
  "contactName",
  "contactEmail",
  "contactTelephone",
  "authorisationNumber",
  "isDefault",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   CLIENT SITE 1
------------------------------------------------------------- */

(
  'stage8-client-site-ipswich',
  'stage8-org-suffolk-waste',
  'stage8-cp-anglia-construction',
  'Ipswich City Centre Project',
  'producer_site',
  '100 Demo Project Street, Ipswich, Suffolk',
  'IP1 2AA',
  'Daniel Carter',
  'daniel@anglia-construction.test',
  '01473 100002',
  NULL,
  true,
  true,
  'Primary Stage 8 client waste origin.',
  now(),
  now()
),

/* ------------------------------------------------------------
   CLIENT SITE 2
------------------------------------------------------------- */

(
  'stage8-client-site-felixstowe',
  'stage8-org-suffolk-waste',
  'stage8-cp-anglia-construction',
  'Felixstowe Warehouse Project',
  'producer_site',
  '200 Demo Port Road, Felixstowe, Suffolk',
  'IP11 1AA',
  'Sarah Jones',
  'sarah@anglia-construction.test',
  '01394 100003',
  NULL,
  false,
  true,
  'Secondary Stage 8 client waste origin.',
  now(),
  now()
),

/* ------------------------------------------------------------
   THIRD-PARTY FACILITY
------------------------------------------------------------- */

(
  'stage8-thirdparty-site-norfolk',
  'stage8-org-suffolk-waste',
  'stage8-cp-norfolk-recovery',
  'Norfolk Recovery Facility',
  'third_party_tip',
  '50 Demo Recovery Road, Norwich, Norfolk',
  'NR1 1AA',
  'Recovery Office',
  'operations@norfolk-recovery.test',
  '01603 100001',
  'EPR-DEMO-NORFOLK-001',
  true,
  true,
  'Stage 8 external waste destination.',
  now(),
  now()
);


/* ============================================================
   15. THIRD-PARTY FACILITY AUTHORISATION
============================================================ */

INSERT INTO bb_counterparty_site_authorisation (
  id,
  "organisationId",
  "counterpartySiteId",
  "authorisationNumber",
  regulator,
  "authorisationType",
  status,
  "isPrimary",
  "validFrom",
  "expiresAt",
  "verificationSource",
  "verifiedAt",
  notes,
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
VALUES
(
  'stage8-thirdparty-auth-norfolk',
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-site-norfolk',
  'EPR-DEMO-NORFOLK-001',
  'EA',
  'permit',
  'active',
  true,
  now() - interval '1 year',
  now() + interval '3 years',
  'Stage 8 test seed',
  now(),
  'Stage 8 demonstration authorisation. Not a real environmental permit.',
  'stage8-user-matt',
  now(),
  now()
);


/* ============================================================
   16. THIRD-PARTY FACILITY EWC CODES

   Deliberately narrower than Suffolk's own receiving permit.

   This lets us test:

   Own site accepts EWC
          BUT
   selected external destination does not.
============================================================ */

INSERT INTO bb_counterparty_site_ewc_code (
  "organisationId",
  "authorisationId",
  "ewcCodeId",
  "isActive",
  "configuredByUserId",
  "createdAt"
)
VALUES

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170101',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170102',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170103',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170107',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170201',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170202',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170203',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170302',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170405',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170407',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170504',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170604',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170802',
  true,
  'stage8-user-matt',
  now()
),

(
  'stage8-org-suffolk-waste',
  'stage8-thirdparty-auth-norfolk',
  'stage8-ewc-170904',
  true,
  'stage8-user-matt',
  now()
);


/* ============================================================
   17. VEHICLES
============================================================ */

/* ------------------------------------------------------------
   EAST ANGLIA MOVERS OWN VEHICLE
------------------------------------------------------------- */

INSERT INTO bb_vehicle (
  id,
  "organisationId",
  "haulierCounterpartyId",
  "registrationNumber",
  "vehicleType",
  "tareWeightKg",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES
(
  'stage8-vehicle-east-anglia-01',
  'stage8-org-east-anglia-movers',
  NULL,
  'EA24 MOV',
  '8-wheel tipper',
  12800,
  true,
  'East Anglia Stage 8 vehicle.',
  now(),
  now()
);


/* ------------------------------------------------------------
   SUFFOLK COPY OF EXTERNAL HAULIER VEHICLE
------------------------------------------------------------- */

INSERT INTO bb_vehicle (
  id,
  "organisationId",
  "haulierCounterpartyId",
  "registrationNumber",
  "vehicleType",
  "tareWeightKg",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES
(
  'stage8-vehicle-suffolk-external-01',
  'stage8-org-suffolk-waste',
  'stage8-cp-east-anglia-movers',
  'EA24 MOV',
  '8-wheel tipper',
  12800,
  true,
  'External East Anglia Movers vehicle.',
  now(),
  now()
);


/* ------------------------------------------------------------
   SUFFOLK OWN VEHICLE
------------------------------------------------------------- */

INSERT INTO bb_vehicle (
  id,
  "organisationId",
  "haulierCounterpartyId",
  "registrationNumber",
  "vehicleType",
  "tareWeightKg",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES
(
  'stage8-vehicle-suffolk-own-01',
  'stage8-org-suffolk-waste',
  NULL,
  'SW24 WST',
  'Hook loader',
  11500,
  true,
  'Suffolk Waste Management own vehicle.',
  now(),
  now()
);


/* ============================================================
   18. DRIVERS
============================================================ */

INSERT INTO bb_driver (
  id,
  "organisationId",
  "haulierCounterpartyId",
  name,
  telephone,
  email,
  "defaultVehicleId",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   EAST ANGLIA OWN DRIVER
------------------------------------------------------------- */

(
  'stage8-driver-east-anglia-terry',
  'stage8-org-east-anglia-movers',
  NULL,
  'Terry Williams',
  '01473 000101',
  'skyrockersltd@gmail.com',
  'stage8-vehicle-east-anglia-01',
  true,
  'Carrier-side Terry driver record.',
  now(),
  now()
),

/* ------------------------------------------------------------
   SUFFOLK EXTERNAL-HAULIER DRIVER RECORD
------------------------------------------------------------- */

(
  'stage8-driver-suffolk-terry',
  'stage8-org-suffolk-waste',
  'stage8-cp-east-anglia-movers',
  'Terry Williams',
  '01473 000101',
  'skyrockersltd@gmail.com',
  'stage8-vehicle-suffolk-external-01',
  true,
  'External driver for East Anglia Movers.',
  now(),
  now()
),

/* ------------------------------------------------------------
   SUFFOLK OWN DRIVER
------------------------------------------------------------- */

(
  'stage8-driver-suffolk-own',
  'stage8-org-suffolk-waste',
  NULL,
  'Sophie Grant',
  '01473 000204',
  'sophie.grant@swm.test',
  'stage8-vehicle-suffolk-own-01',
  true,
  'Suffolk Waste Management own driver.',
  now(),
  now()
);


/* ============================================================
   19. REALISTIC MATERIAL PROFILES

   Material Profiles are operational defaults.

   They do NOT determine legal waste classification by
   themselves.
============================================================ */

INSERT INTO bb_material_profile (
  id,
  "organisationId",
  "siteId",
  name,
  "ewcCodeId",
  "wasteDescription",
  "physicalForm",
  "defaultNumberOfContainers",
  "defaultContainerType",
  "containsPops",
  "popsSourceOfComponents",
  "popsComponents",
  "containsHazardous",
  "hazardousSourceOfComponents",
  "hazardousHazCodes",
  "hazardousComponents",
  "defaultDisposalRecoveryCodeId",
  "defaultWeightMetric",
  "isFavourite",
  "isActive",
  notes,
  "createdByUserId",
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   CONCRETE
------------------------------------------------------------- */

(
  'stage8-material-concrete',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Clean Concrete',
  'stage8-ewc-170101',
  'Clean segregated concrete from construction and demolition activities',
  'Solid',
  1,
  'Tipper load',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  true,
  true,
  'Stage 8 concrete material profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   BRICKS
------------------------------------------------------------- */

(
  'stage8-material-bricks',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Clean Bricks',
  'stage8-ewc-170102',
  'Clean segregated bricks from demolition works',
  'Solid',
  1,
  'Tipper load',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  true,
  true,
  'Stage 8 brick profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   MIXED HARDCORE
------------------------------------------------------------- */

(
  'stage8-material-hardcore',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Mixed Hardcore',
  'stage8-ewc-170107',
  'Non-hazardous mixture of concrete, bricks, tiles and ceramics',
  'Mixed',
  1,
  'Tipper load',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  true,
  true,
  'Stage 8 mixed hardcore profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   WOOD
------------------------------------------------------------- */

(
  'stage8-material-wood',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Untreated Wood',
  'stage8-ewc-170201',
  'Segregated untreated construction and demolition wood',
  'Solid',
  1,
  'Skip',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r3',
  'Tonnes',
  true,
  true,
  'Stage 8 wood profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   GLASS
------------------------------------------------------------- */

(
  'stage8-material-glass',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Construction Glass',
  'stage8-ewc-170202',
  'Uncontaminated segregated construction glass',
  'Solid',
  1,
  'Skip',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  false,
  true,
  'Stage 8 glass profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   PLASTIC
------------------------------------------------------------- */

(
  'stage8-material-plastic',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Construction Plastic',
  'stage8-ewc-170203',
  'Segregated non-hazardous construction plastic',
  'Solid',
  1,
  'Skip',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r3',
  'Tonnes',
  false,
  true,
  'Stage 8 plastic profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   ROAD PLANINGS / ASPHALT
------------------------------------------------------------- */

(
  'stage8-material-asphalt',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Non-coal-tar Road Planings',
  'stage8-ewc-170302',
  'Bituminous road planings assessed as not containing coal tar',
  'Solid',
  1,
  'Tipper load',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  false,
  true,
  'Stage 8 road-planings profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   FERROUS METAL
------------------------------------------------------------- */

(
  'stage8-material-steel',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Iron & Steel',
  'stage8-ewc-170405',
  'Segregated iron and steel from construction and demolition works',
  'Solid',
  1,
  'Container',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r4',
  'Tonnes',
  false,
  true,
  'Stage 8 ferrous-metal profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   SOIL
------------------------------------------------------------- */

(
  'stage8-material-soil',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Non-hazardous Soil & Stones',
  'stage8-ewc-170504',
  'Soil and stones assessed as not containing hazardous substances',
  'Solid',
  1,
  'Tipper load',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  true,
  true,
  'Stage 8 soil profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   GYPSUM / PLASTERBOARD
------------------------------------------------------------- */

(
  'stage8-material-gypsum',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Gypsum / Plasterboard',
  'stage8-ewc-170802',
  'Segregated gypsum-based construction material not contaminated with hazardous substances',
  'Solid',
  1,
  'Skip',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  false,
  true,
  'Stage 8 gypsum profile.',
  'stage8-user-matt',
  now(),
  now()
),

/* ------------------------------------------------------------
   MIXED C&D
------------------------------------------------------------- */

(
  'stage8-material-mixed-cd',
  'stage8-org-suffolk-waste',
  'stage8-site-suffolk-receiving',
  'Mixed Construction Waste',
  'stage8-ewc-170904',
  'Mixed non-hazardous construction and demolition waste',
  'Mixed',
  1,
  'Skip',
  false,
  'NOT_PROVIDED',
  NULL,
  false,
  'NOT_PROVIDED',
  NULL,
  NULL,
  'stage8-r5',
  'Tonnes',
  true,
  true,
  'Stage 8 mixed C&D profile.',
  'stage8-user-matt',
  now(),
  now()
);


/* ============================================================
   20. COMMERCIAL RATES
============================================================ */

INSERT INTO bb_rate (
  id,
  "organisationId",
  "rateType",
  unit,
  amount,
  currency,
  "counterpartyId",
  "counterpartySiteId",
  "ownSiteId",
  "materialProfileId",
  "effectiveFrom",
  "effectiveTo",
  "isActive",
  notes,
  "createdAt",
  "updatedAt"
)
VALUES

/* ------------------------------------------------------------
   CONCRETE CUSTOMER RATE
------------------------------------------------------------- */

(
  'stage8-rate-concrete-customer',
  'stage8-org-suffolk-waste',
  'customer_charge',
  'tonne',
  75.00,
  'GBP',
  'stage8-cp-anglia-construction',
  NULL,
  'stage8-site-suffolk-receiving',
  'stage8-material-concrete',
  now() - interval '30 days',
  NULL,
  true,
  'Stage 8 concrete customer rate.',
  now(),
  now()
),

/* ------------------------------------------------------------
   SOIL CUSTOMER RATE
------------------------------------------------------------- */

(
  'stage8-rate-soil-customer',
  'stage8-org-suffolk-waste',
  'customer_charge',
  'tonne',
  32.50,
  'GBP',
  'stage8-cp-anglia-construction',
  NULL,
  'stage8-site-suffolk-receiving',
  'stage8-material-soil',
  now() - interval '30 days',
  NULL,
  true,
  'Stage 8 soil customer rate.',
  now(),
  now()
),

/* ------------------------------------------------------------
   MIXED C&D CUSTOMER RATE
------------------------------------------------------------- */

(
  'stage8-rate-mixed-customer',
  'stage8-org-suffolk-waste',
  'customer_charge',
  'tonne',
  110.00,
  'GBP',
  'stage8-cp-anglia-construction',
  NULL,
  'stage8-site-suffolk-receiving',
  'stage8-material-mixed-cd',
  now() - interval '30 days',
  NULL,
  true,
  'Stage 8 mixed C&D customer rate.',
  now(),
  now()
),

/* ------------------------------------------------------------
   EXTERNAL HAULAGE
------------------------------------------------------------- */

(
  'stage8-rate-haulage',
  'stage8-org-suffolk-waste',
  'haulage_cost',
  'load',
  350.00,
  'GBP',
  'stage8-cp-east-anglia-movers',
  NULL,
  'stage8-site-suffolk-receiving',
  NULL,
  now() - interval '30 days',
  NULL,
  true,
  'Stage 8 East Anglia Movers haulage cost.',
  now(),
  now()
),

/* ------------------------------------------------------------
   THIRD-PARTY TIPPING COST
------------------------------------------------------------- */

(
  'stage8-rate-thirdparty-tip',
  'stage8-org-suffolk-waste',
  'tipping_cost',
  'tonne',
  55.00,
  'GBP',
  'stage8-cp-norfolk-recovery',
  'stage8-thirdparty-site-norfolk',
  NULL,
  'stage8-material-mixed-cd',
  now() - interval '30 days',
  NULL,
  true,
  'Stage 8 Norfolk Recovery tipping rate.',
  now(),
  now()
);


/* ============================================================
   21. COMMIT
============================================================ */

COMMIT;


/* ============================================================
   22. VERIFY USERS
============================================================ */

SELECT
  u.name,
  u.email,
  u.role,
  u."soloAccessPreset",
  o."teamName" AS organisation,
  u.status,
  u."isActive",
  u."isSuspended"
FROM bb_user u
LEFT JOIN bb_organisation o
  ON o.id = u."organisationId"
ORDER BY
  u.role,
  u.name;


/* ============================================================
   23. VERIFY ORGANISATIONS
============================================================ */

SELECT
  id,
  "teamName",
  capabilities,
  "operatingMode",
  status
FROM bb_organisation
ORDER BY "teamName";


/* ============================================================
   24. VERIFY EWC CATALOGUE
============================================================ */

SELECT
  code,
  description,
  "isHazardous"
FROM bb_ewc_code
ORDER BY
  "chapterCode",
  code;


/* ============================================================
   25. VERIFY EWC COUNTS
============================================================ */

SELECT
  "chapterCode",
  COUNT(*) AS codes,
  COUNT(*) FILTER (
    WHERE "isHazardous" = true
  ) AS hazardous,
  COUNT(*) FILTER (
    WHERE "isHazardous" = false
  ) AS non_hazardous
FROM bb_ewc_code
GROUP BY "chapterCode"
ORDER BY "chapterCode";


/* ============================================================
   26. VERIFY SUFFOLK PERMIT CODES
============================================================ */

SELECT
  p."permitNumber",
  e.code,
  e.description,
  e."isHazardous"
FROM bb_permit_ewc_code pe
JOIN bb_site_permit p
  ON p.id = pe."permitId"
JOIN bb_ewc_code e
  ON e.id = pe."ewcCodeId"
WHERE pe."permitId" = 'stage8-permit-suffolk'
ORDER BY e.code;


/* ============================================================
   27. VERIFY THIRD-PARTY FACILITY CODES
============================================================ */

SELECT
  a."authorisationNumber",
  e.code,
  e.description,
  e."isHazardous"
FROM bb_counterparty_site_ewc_code se
JOIN bb_counterparty_site_authorisation a
  ON a.id = se."authorisationId"
JOIN bb_ewc_code e
  ON e.id = se."ewcCodeId"
WHERE se."authorisationId" =
  'stage8-thirdparty-auth-norfolk'
ORDER BY e.code;


/* ============================================================
   28. VERIFY MASTER DATA COUNTS
============================================================ */

SELECT
  'users' AS record_type,
  COUNT(*) AS total
FROM bb_user

UNION ALL

SELECT
  'organisations',
  COUNT(*)
FROM bb_organisation

UNION ALL

SELECT
  'sites',
  COUNT(*)
FROM bb_sites

UNION ALL

SELECT
  'ewc_codes',
  COUNT(*)
FROM bb_ewc_code

UNION ALL

SELECT
  'site_permits',
  COUNT(*)
FROM bb_site_permit

UNION ALL

SELECT
  'permit_ewc_codes',
  COUNT(*)
FROM bb_permit_ewc_code

UNION ALL

SELECT
  'counterparties',
  COUNT(*)
FROM bb_counterparty

UNION ALL

SELECT
  'counterparty_sites',
  COUNT(*)
FROM bb_counterparty_site

UNION ALL

SELECT
  'third_party_authorisations',
  COUNT(*)
FROM bb_counterparty_site_authorisation

UNION ALL

SELECT
  'third_party_ewc_codes',
  COUNT(*)
FROM bb_counterparty_site_ewc_code

UNION ALL

SELECT
  'drivers',
  COUNT(*)
FROM bb_driver

UNION ALL

SELECT
  'vehicles',
  COUNT(*)
FROM bb_vehicle

UNION ALL

SELECT
  'materials',
  COUNT(*)
FROM bb_material_profile

UNION ALL

SELECT
  'rates',
  COUNT(*)
FROM bb_rate;


/* ============================================================
   29. CONFIRM DWT REFERENCE CACHE SURVIVED
============================================================ */

SELECT
  environment,
  COUNT(*) AS reference_items
FROM bb_waste_tracking_reference_data
GROUP BY environment
ORDER BY environment;


/* ============================================================
   30. STAGE 8 READY
============================================================ */

SELECT
  'WASTE X STAGE 8 DATABASE READY' AS result;