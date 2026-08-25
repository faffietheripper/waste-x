demo-operations-ui-seed.sql


/* =====================================================================
   WASTE X — OPERATIONS TABLE DEMO SEED
   ---------------------------------------------------------------------
   Purpose:
   - Fill Jobs, Daily Operations and Movements with dense demo data
   - Create 3 demo hauliers with carrier-registration values that match
     Waste X's current CBDU + 6 digits preflight format
   - Give every haulier a syntactically valid email
   - Create drivers + vehicles
   - Create incoming jobs for today/tomorrow
   - Create outgoing jobs/history so the Movements tabs both have data

   IMPORTANT:
   - DEMO / LOCAL TEST DATA ONLY.
   - CBDU numbers below are FORMAT-VALID DEMO VALUES. They are NOT claimed
     to be real or verified Environment Agency registrations.
   - Re-running the script only replaces jobs prefixed UI-DEMO-.
   ===================================================================== */

BEGIN;

DO $$
DECLARE
  v_user_id text;
  v_org_id text;

  v_site_id text;
  v_permit_id text;

  v_ewc1_id text;
  v_ewc1_code text;
  v_ewc1_desc text;

  v_ewc2_id text;
  v_ewc2_code text;
  v_ewc2_desc text;

  v_ewc3_id text;
  v_ewc3_code text;
  v_ewc3_desc text;

  v_r5_id text;

  v_client1 text;
  v_client2 text;
  v_client3 text;
  v_client4 text;

  v_client_site1 text;
  v_client_site2 text;
  v_client_site3 text;
  v_client_site4 text;

  v_carrier1 text;
  v_carrier2 text;
  v_carrier3 text;

  v_driver1 text;
  v_driver2 text;
  v_driver3 text;

  v_vehicle1 text;
  v_vehicle2 text;
  v_vehicle3 text;

  v_material1 text;
  v_material2 text;
  v_material3 text;

  v_receiver text;
  v_receiver_site text;
  v_receiver_auth text;

BEGIN

  /* ================================================================
     1. SELECT THE ACTIVE LOCAL USER / ORGANISATION
     Prefer Tadiwa Mwale when present, otherwise use the first active user.
  ================================================================ */

  SELECT
    u.id,
    u."organisationId"
  INTO
    v_user_id,
    v_org_id
  FROM bb_user u
  WHERE u."organisationId" IS NOT NULL
    AND COALESCE(u."isActive", true) = true
    AND COALESCE(u."isSuspended", false) = false
  ORDER BY
    CASE
      WHEN lower(trim(COALESCE(u.name, ''))) = lower('Tadiwa Mwale') THEN 0
      ELSE 1
    END,
    u."createdAt" ASC NULLS LAST
  LIMIT 1;

  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'No active Waste X user with an organisation was found.';
  END IF;

  RAISE NOTICE 'Target organisation: %', v_org_id;
  RAISE NOTICE 'Target user: %', v_user_id;

  /* Tenant-safe deterministic IDs for repeatable local seeding. */
  v_client1 := 'ui-demo-client-' || md5(v_org_id || '|oakridge');
  v_client2 := 'ui-demo-client-' || md5(v_org_id || '|meridian');
  v_client3 := 'ui-demo-client-' || md5(v_org_id || '|broadgate');
  v_client4 := 'ui-demo-client-' || md5(v_org_id || '|stonebridge');

  v_client_site1 := 'ui-demo-client-site-' || md5(v_org_id || '|oakridge-riverside');
  v_client_site2 := 'ui-demo-client-site-' || md5(v_org_id || '|meridian-exchange');
  v_client_site3 := 'ui-demo-client-site-' || md5(v_org_id || '|broadgate-northfield');
  v_client_site4 := 'ui-demo-client-site-' || md5(v_org_id || '|stonebridge-foundry');

  v_carrier1 := 'ui-demo-carrier-' || md5(v_org_id || '|northline');
  v_carrier2 := 'ui-demo-carrier-' || md5(v_org_id || '|atlas');
  v_carrier3 := 'ui-demo-carrier-' || md5(v_org_id || '|greenroad');

  v_driver1 := 'ui-demo-driver-' || md5(v_org_id || '|mason-reed');
  v_driver2 := 'ui-demo-driver-' || md5(v_org_id || '|leah-foster');
  v_driver3 := 'ui-demo-driver-' || md5(v_org_id || '|jordan-cole');

  v_vehicle1 := 'ui-demo-vehicle-' || md5(v_org_id || '|NL26 HGV');
  v_vehicle2 := 'ui-demo-vehicle-' || md5(v_org_id || '|AT26 TIP');
  v_vehicle3 := 'ui-demo-vehicle-' || md5(v_org_id || '|GR26 SKP');

  v_material1 := 'ui-demo-material-' || md5(v_org_id || '|material-1');
  v_material2 := 'ui-demo-material-' || md5(v_org_id || '|material-2');
  v_material3 := 'ui-demo-material-' || md5(v_org_id || '|material-3');

  v_receiver := 'ui-demo-receiver-' || md5(v_org_id || '|greenloop');
  v_receiver_site := 'ui-demo-receiver-site-' || md5(v_org_id || '|greenloop-centre');
  v_receiver_auth := 'ui-demo-receiver-auth-' || md5(v_org_id || '|greenloop-auth');


  /* ================================================================
     2. RECEIVING SITE + ACTIVE PERMIT
  ================================================================ */

  SELECT
    s.id,
    p.id
  INTO
    v_site_id,
    v_permit_id
  FROM bb_sites s
  JOIN bb_site_permit p
    ON p."siteId" = s.id
   AND p."organisationId" = s."organisationId"
  WHERE s."organisationId" = v_org_id
    AND s.status = 'active'
    AND p.status = 'active'
  ORDER BY
    CASE WHEN s."siteType" = 'waste_receiving_site' THEN 0 ELSE 1 END,
    s."isDefault" DESC,
    p."isPrimary" DESC,
    s."createdAt" ASC
  LIMIT 1;

  IF v_site_id IS NULL OR v_permit_id IS NULL THEN
    RAISE EXCEPTION
      'The selected organisation needs an active site and active permit first.';
  END IF;


  /* ================================================================
     3. PICK THREE EWCs ALREADY ALLOWED BY THE ACTIVE PERMIT

     Preference:
       17 01 01 concrete
       17 09 04 mixed C&D
       17 05 04 soil/stones

     If those are not configured, the script falls back to any permitted EWC.
  ================================================================ */

  SELECT
    e.id,
    regexp_replace(e.code, '[^0-9]', '', 'g'),
    e.description
  INTO
    v_ewc1_id,
    v_ewc1_code,
    v_ewc1_desc
  FROM bb_permit_ewc_code pe
  JOIN bb_ewc_code e
    ON e.id = pe."ewcCodeId"
  WHERE pe."permitId" = v_permit_id
    AND pe."organisationId" = v_org_id
    AND pe."isActive" = true
    AND e."isActive" = true
  ORDER BY
    CASE
      WHEN regexp_replace(e.code, '[^0-9]', '', 'g') = '170101' THEN 0
      ELSE 1
    END,
    e.code
  LIMIT 1;

  IF v_ewc1_id IS NULL THEN
    RAISE EXCEPTION
      'The active permit has no active EWC mappings. Configure permitted EWC codes first.';
  END IF;

  SELECT
    e.id,
    regexp_replace(e.code, '[^0-9]', '', 'g'),
    e.description
  INTO
    v_ewc2_id,
    v_ewc2_code,
    v_ewc2_desc
  FROM bb_permit_ewc_code pe
  JOIN bb_ewc_code e
    ON e.id = pe."ewcCodeId"
  WHERE pe."permitId" = v_permit_id
    AND pe."organisationId" = v_org_id
    AND pe."isActive" = true
    AND e."isActive" = true
    AND e.id <> v_ewc1_id
  ORDER BY
    CASE
      WHEN regexp_replace(e.code, '[^0-9]', '', 'g') = '170904' THEN 0
      ELSE 1
    END,
    e.code
  LIMIT 1;

  IF v_ewc2_id IS NULL THEN
    v_ewc2_id := v_ewc1_id;
    v_ewc2_code := v_ewc1_code;
    v_ewc2_desc := v_ewc1_desc;
  END IF;

  SELECT
    e.id,
    regexp_replace(e.code, '[^0-9]', '', 'g'),
    e.description
  INTO
    v_ewc3_id,
    v_ewc3_code,
    v_ewc3_desc
  FROM bb_permit_ewc_code pe
  JOIN bb_ewc_code e
    ON e.id = pe."ewcCodeId"
  WHERE pe."permitId" = v_permit_id
    AND pe."organisationId" = v_org_id
    AND pe."isActive" = true
    AND e."isActive" = true
    AND e.id <> v_ewc1_id
    AND e.id <> v_ewc2_id
  ORDER BY
    CASE
      WHEN regexp_replace(e.code, '[^0-9]', '', 'g') = '170504' THEN 0
      ELSE 1
    END,
    e.code
  LIMIT 1;

  IF v_ewc3_id IS NULL THEN
    v_ewc3_id := v_ewc1_id;
    v_ewc3_code := v_ewc1_code;
    v_ewc3_desc := v_ewc1_desc;
  END IF;

  SELECT id
  INTO v_r5_id
  FROM bb_disposal_recovery_code
  WHERE upper(code) = 'R5'
    AND "isActive" = true
  LIMIT 1;


  /* ================================================================
     4. CLIENTS + PRODUCER SITES
  ================================================================ */

  INSERT INTO bb_counterparty (
    id, "organisationId", name, "accountReference", email, telephone,
    "fullAddress", postcode, "paymentTermsDays", notes,
    "isActive", "createdAt", "updatedAt"
  )
  VALUES
    (
      v_client1, v_org_id, 'Oakridge Developments Ltd', 'UI-OAK-001',
      'accounts@oakridge-demo.com', '0121 555 0101',
      '10 Riverside Way, Birmingham', 'B5 5TR', 30,
      '[UI Demo Seed] Client', true, now(), now()
    ),
    (
      v_client2, v_org_id, 'Meridian Construction Group', 'UI-MER-001',
      'accounts@meridian-demo.com', '0121 555 0102',
      '22 Exchange Street, Birmingham', 'B4 6FY', 30,
      '[UI Demo Seed] Client', true, now(), now()
    ),
    (
      v_client3, v_org_id, 'Broadgate Civils Ltd', 'UI-BRD-001',
      'accounts@broadgate-demo.com', '0121 555 0103',
      '8 Northfield Road, Birmingham', 'B6 7EU', 30,
      '[UI Demo Seed] Client', true, now(), now()
    ),
    (
      v_client4, v_org_id, 'Stonebridge Demolition Ltd', 'UI-STN-001',
      'accounts@stonebridge-demo.com', '0121 555 0104',
      '41 Foundry Lane, Birmingham', 'B7 4AA', 30,
      '[UI Demo Seed] Client', true, now(), now()
    )
  ON CONFLICT (id)
  DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    telephone = EXCLUDED.telephone,
    "fullAddress" = EXCLUDED."fullAddress",
    postcode = EXCLUDED.postcode,
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_counterparty_role (
    "organisationId", "counterpartyId", role, "createdAt"
  )
  VALUES
    (v_org_id, v_client1, 'client', now()),
    (v_org_id, v_client1, 'producer', now()),
    (v_org_id, v_client2, 'client', now()),
    (v_org_id, v_client2, 'producer', now()),
    (v_org_id, v_client3, 'client', now()),
    (v_org_id, v_client3, 'producer', now()),
    (v_org_id, v_client4, 'client', now()),
    (v_org_id, v_client4, 'producer', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  INSERT INTO bb_counterparty_site (
    id, "organisationId", "counterpartyId", name, "siteType",
    "fullAddress", postcode, "contactName", "contactEmail",
    "contactTelephone", "isDefault", "isActive", notes,
    "createdAt", "updatedAt"
  )
  VALUES
    (
      v_client_site1, v_org_id, v_client1,
      'Riverside Quarter Redevelopment', 'producer_site',
      '1 Canal Wharf, Birmingham', 'B5 5TR',
      'Amelia Hart', 'amelia@oakridge-demo.com', '07700 900101',
      true, true, '[UI Demo Seed] Producer site', now(), now()
    ),
    (
      v_client_site2, v_org_id, v_client2,
      'Exchange Square Development', 'producer_site',
      '42 Exchange Street, Birmingham', 'B4 6FY',
      'Sophie Turner', 'sophie@meridian-demo.com', '07700 900102',
      true, true, '[UI Demo Seed] Producer site', now(), now()
    ),
    (
      v_client_site3, v_org_id, v_client3,
      'Northfield Infrastructure Works', 'producer_site',
      '17 Northfield Road, Birmingham', 'B6 7EU',
      'Daniel Brooks', 'daniel@broadgate-demo.com', '07700 900103',
      true, true, '[UI Demo Seed] Producer site', now(), now()
    ),
    (
      v_client_site4, v_org_id, v_client4,
      'Foundry Redevelopment', 'producer_site',
      '88 Foundry Lane, Birmingham', 'B7 4AA',
      'Maya Collins', 'maya@stonebridge-demo.com', '07700 900104',
      true, true, '[UI Demo Seed] Producer site', now(), now()
    )
  ON CONFLICT ("counterpartyId", name)
  DO UPDATE SET
    "fullAddress" = EXCLUDED."fullAddress",
    postcode = EXCLUDED.postcode,
    "contactEmail" = EXCLUDED."contactEmail",
    "contactTelephone" = EXCLUDED."contactTelephone",
    "isActive" = true,
    "updatedAt" = now();


  /* ================================================================
     5. THREE HAULIERS

     Format-valid demo CBDU values:
       CBDU777777
       CBDU888888
       CBDU999999

     These are intentionally DEMO values, not asserted as real registrations.
  ================================================================ */

  INSERT INTO bb_counterparty (
    id, "organisationId", name, "accountReference", email, telephone,
    "fullAddress", postcode, "carrierRegistrationNumber",
    "paymentTermsDays", notes, "isActive", "createdAt", "updatedAt"
  )
  VALUES
    (
      v_carrier1, v_org_id, 'Northline Haulage Ltd', 'UI-NLH-001',
      'tadi+northline@gmail.com', '07700 910001',
      '22 Haulage Park, Birmingham', 'B24 8AA',
      'CBDU777777', 30,
      '[UI Demo Seed] Format-valid demo carrier registration.',
      true, now(), now()
    ),
    (
      v_carrier2, v_org_id, 'Atlas Waste Transport Ltd', 'UI-ATL-001',
      'tadi+atlas@gmail.com', '07700 910002',
      '14 Freight Road, Coventry', 'CV2 2TX',
      'CBDU888888', 30,
      '[UI Demo Seed] Format-valid demo carrier registration.',
      true, now(), now()
    ),
    (
      v_carrier3, v_org_id, 'GreenRoad Logistics Ltd', 'UI-GRL-001',
      'tadi+greenroad@gmail.com', '07700 910003',
      '9 Logistics Way, Wolverhampton', 'WV2 4AB',
      'CBDU999999', 30,
      '[UI Demo Seed] Format-valid demo carrier registration.',
      true, now(), now()
    )
  ON CONFLICT (id)
  DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    telephone = EXCLUDED.telephone,
    "fullAddress" = EXCLUDED."fullAddress",
    postcode = EXCLUDED.postcode,
    "carrierRegistrationNumber" = EXCLUDED."carrierRegistrationNumber",
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_counterparty_role (
    "organisationId", "counterpartyId", role, "createdAt"
  )
  VALUES
    (v_org_id, v_carrier1, 'haulier', now()),
    (v_org_id, v_carrier2, 'haulier', now()),
    (v_org_id, v_carrier3, 'haulier', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;


  /* ================================================================
     6. VEHICLES + DRIVERS
  ================================================================ */

  INSERT INTO bb_vehicle (
    id, "organisationId", "haulierCounterpartyId",
    "registrationNumber", "vehicleType", "tareWeightKg",
    "isActive", notes, "createdAt", "updatedAt"
  )
  VALUES
    (
      v_vehicle1, v_org_id, v_carrier1,
      'NL26 HGV', '8-wheel tipper', 12600,
      true, '[UI Demo Seed] Vehicle', now(), now()
    ),
    (
      v_vehicle2, v_org_id, v_carrier2,
      'AT26 TIP', 'Tipper', 11900,
      true, '[UI Demo Seed] Vehicle', now(), now()
    ),
    (
      v_vehicle3, v_org_id, v_carrier3,
      'GR26 SKP', 'Skip lorry', 11400,
      true, '[UI Demo Seed] Vehicle', now(), now()
    )
  ON CONFLICT ("organisationId", "registrationNumber")
  DO UPDATE SET
    "haulierCounterpartyId" = EXCLUDED."haulierCounterpartyId",
    "vehicleType" = EXCLUDED."vehicleType",
    "tareWeightKg" = EXCLUDED."tareWeightKg",
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_driver (
    id, "organisationId", "haulierCounterpartyId",
    name, telephone, email, "defaultVehicleId",
    "isActive", notes, "createdAt", "updatedAt"
  )
  VALUES
    (
      v_driver1, v_org_id, v_carrier1,
      'Mason Reed', '07700 920001', 'mason@northline-demo.com',
      v_vehicle1, true, '[UI Demo Seed] Driver', now(), now()
    ),
    (
      v_driver2, v_org_id, v_carrier2,
      'Leah Foster', '07700 920002', 'leah@atlas-demo.com',
      v_vehicle2, true, '[UI Demo Seed] Driver', now(), now()
    ),
    (
      v_driver3, v_org_id, v_carrier3,
      'Jordan Cole', '07700 920003', 'jordan@greenroad-demo.com',
      v_vehicle3, true, '[UI Demo Seed] Driver', now(), now()
    )
  ON CONFLICT (id)
  DO UPDATE SET
    "haulierCounterpartyId" = EXCLUDED."haulierCounterpartyId",
    name = EXCLUDED.name,
    telephone = EXCLUDED.telephone,
    email = EXCLUDED.email,
    "defaultVehicleId" = EXCLUDED."defaultVehicleId",
    "isActive" = true,
    "updatedAt" = now();


  /* ================================================================
     7. MATERIAL PROFILES USING THE PERMIT'S OWN EWCs
  ================================================================ */

  INSERT INTO bb_material_profile (
    id, "organisationId", "siteId", name, "ewcCodeId",
    "wasteDescription", "physicalForm",
    "defaultNumberOfContainers", "defaultContainerType",
    "containsPops", "containsHazardous",
    "defaultDisposalRecoveryCodeId", "defaultWeightMetric",
    "isFavourite", "isActive", notes,
    "createdByUserId", "createdAt", "updatedAt"
  )
  VALUES
    (
      v_material1, v_org_id, v_site_id,
      'UI Demo Material 1 · ' || v_ewc1_code,
      v_ewc1_id, v_ewc1_desc, 'Solid',
      1, 'SKI', false, false,
      v_r5_id, 'Tonnes',
      true, true, '[UI Demo Seed] Material profile',
      v_user_id, now(), now()
    ),
    (
      v_material2, v_org_id, v_site_id,
      'UI Demo Material 2 · ' || v_ewc2_code,
      v_ewc2_id, v_ewc2_desc, 'Solid',
      1, 'SKI', false, false,
      v_r5_id, 'Tonnes',
      true, true, '[UI Demo Seed] Material profile',
      v_user_id, now(), now()
    ),
    (
      v_material3, v_org_id, v_site_id,
      'UI Demo Material 3 · ' || v_ewc3_code,
      v_ewc3_id, v_ewc3_desc, 'Solid',
      1, 'SKI', false, false,
      v_r5_id, 'Tonnes',
      true, true, '[UI Demo Seed] Material profile',
      v_user_id, now(), now()
    )
  ON CONFLICT (id)
  DO UPDATE SET
    "siteId" = EXCLUDED."siteId",
    "ewcCodeId" = EXCLUDED."ewcCodeId",
    "wasteDescription" = EXCLUDED."wasteDescription",
    "defaultDisposalRecoveryCodeId" =
      EXCLUDED."defaultDisposalRecoveryCodeId",
    "isActive" = true,
    "updatedAt" = now();


  /* ================================================================
     8. EXTERNAL RECEIVING FACILITY
     This makes outgoing demo loads genuinely operable in the current
     worksheet completeOutgoingLoadAction.
  ================================================================ */

  INSERT INTO bb_counterparty (
    id, "organisationId", name, "accountReference", email, telephone,
    "fullAddress", postcode, notes, "isActive", "createdAt", "updatedAt"
  )
  VALUES (
    v_receiver, v_org_id, 'GreenLoop Recovery Ltd', 'UI-GLR-001',
    'operations@greenloop-demo.com', '0121 555 0300',
    '100 Recovery Road, Birmingham', 'B11 2AA',
    '[UI Demo Seed] External receiving facility operator.',
    true, now(), now()
  )
  ON CONFLICT (id)
  DO UPDATE SET
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    telephone = EXCLUDED.telephone,
    "fullAddress" = EXCLUDED."fullAddress",
    postcode = EXCLUDED.postcode,
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_counterparty_role (
    "organisationId", "counterpartyId", role, "createdAt"
  )
  VALUES
    (v_org_id, v_receiver, 'receiver', now()),
    (v_org_id, v_receiver, 'third_party_tip', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  INSERT INTO bb_counterparty_site (
    id, "organisationId", "counterpartyId", name, "siteType",
    "fullAddress", postcode, "contactName", "contactEmail",
    "contactTelephone", "authorisationNumber",
    "isDefault", "isActive", notes, "createdAt", "updatedAt"
  )
  VALUES (
    v_receiver_site, v_org_id, v_receiver,
    'GreenLoop Recovery Centre', 'third_party_tip',
    '100 Recovery Road, Birmingham', 'B11 2AA',
    'Site Office', 'operations@greenloop-demo.com', '0121 555 0300',
    'EPR/DEMO/GLR/2608',
    true, true, '[UI Demo Seed] External facility',
    now(), now()
  )
  ON CONFLICT ("counterpartyId", name)
  DO UPDATE SET
    "siteType" = 'third_party_tip',
    "fullAddress" = EXCLUDED."fullAddress",
    postcode = EXCLUDED.postcode,
    "contactEmail" = EXCLUDED."contactEmail",
    "authorisationNumber" = EXCLUDED."authorisationNumber",
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_counterparty_site_authorisation (
    id, "organisationId", "counterpartySiteId",
    "authorisationNumber", regulator, "authorisationType",
    status, "isPrimary", "verificationSource",
    notes, "createdByUserId", "createdAt", "updatedAt"
  )
  VALUES (
    v_receiver_auth, v_org_id, v_receiver_site,
    'EPR/DEMO/GLR/2608', 'EA', 'permit',
    'active', true, 'demo_seed',
    '[UI Demo Seed] Presentation-only external authorisation.',
    v_user_id, now(), now()
  )
  ON CONFLICT ("counterpartySiteId", "authorisationNumber")
  DO UPDATE SET
    status = 'active',
    "isPrimary" = true,
    "verificationSource" = 'demo_seed',
    "updatedAt" = now();

  INSERT INTO bb_counterparty_site_ewc_code (
    "organisationId", "authorisationId", "ewcCodeId",
    "isActive", "configuredByUserId", "createdAt"
  )
  SELECT DISTINCT
    v_org_id,
    v_receiver_auth,
    x.ewc_id,
    true,
    v_user_id,
    now()
  FROM (
    VALUES
      (v_ewc1_id),
      (v_ewc2_id),
      (v_ewc3_id)
  ) AS x(ewc_id)
  WHERE x.ewc_id IS NOT NULL
  ON CONFLICT ("authorisationId", "ewcCodeId")
  DO UPDATE SET
    "isActive" = true,
    "configuredByUserId" = EXCLUDED."configuredByUserId";


  /* ================================================================
     9. REMOVE ONLY PREVIOUS UI-DEMO JOBS
  ================================================================ */

  DELETE FROM bb_job
  WHERE "organisationId" = v_org_id
    AND "jobNumber" LIKE 'UI-DEMO-%';


  /* ================================================================
     10. BUILD LOAD-LEVEL SEED PLAN
  ================================================================ */

  CREATE TEMP TABLE ui_demo_seed (
    job_number text NOT NULL,
    day_offset integer NOT NULL,
    direction text NOT NULL,
    job_status text NOT NULL,

    client_id text,
    client_site_id text,
    destination_site_id text,

    haulier_id text NOT NULL,
    driver_id text NOT NULL,
    vehicle_id text NOT NULL,

    material_id text NOT NULL,
    ewc_id text NOT NULL,
    ewc_code text NOT NULL,
    waste_description text NOT NULL,

    planned_loads integer NOT NULL,
    load_number integer NOT NULL,
    load_status text NOT NULL,

    event_time time,
    gross_weight numeric,
    tare_weight numeric,
    net_weight numeric,

    ticket_number text,
    purchase_order text,
    customer_reference text
  ) ON COMMIT DROP;


  /* ================================================================
     TODAY — INCOMING
     Gives Daily Operations a mixture of actions/states.
  ================================================================ */

  INSERT INTO ui_demo_seed VALUES

  /* 01 — 2 planned loads */
  (
    'UI-DEMO-TODAY-01', 0, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    2, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-001', 'RIVERSIDE-A'
  ),
  (
    'UI-DEMO-TODAY-01', 0, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    2, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-001', 'RIVERSIDE-A'
  ),

  /* 02 — one arrived + one planned */
  (
    'UI-DEMO-TODAY-02', 0, 'incoming', 'in_progress',
    v_client2, v_client_site2, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 1, 'arrived',
    TIME '08:35', 26.850, 11.900, 14.950,
    'UI-WB-002-1', 'PO-UI-002', 'EXCHANGE-A'
  ),
  (
    'UI-DEMO-TODAY-02', 0, 'incoming', 'in_progress',
    v_client2, v_client_site2, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-002', 'EXCHANGE-A'
  ),

  /* 03 — arrived */
  (
    'UI-DEMO-TODAY-03', 0, 'incoming', 'in_progress',
    v_client3, v_client_site3, NULL,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    1, 1, 'arrived',
    TIME '09:10', 30.920, 11.400, 19.520,
    'UI-WB-003-1', 'PO-UI-003', 'NORTHFIELD-A'
  ),

  /* 04 — accepted and ready to complete */
  (
    'UI-DEMO-TODAY-04', 0, 'incoming', 'in_progress',
    v_client4, v_client_site4, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    1, 1, 'accepted',
    TIME '09:45', 31.250, 12.600, 18.650,
    'UI-WB-004-1', 'PO-UI-004', 'FOUNDRY-A'
  ),

  /* 05 — accepted and ready to complete */
  (
    'UI-DEMO-TODAY-05', 0, 'incoming', 'in_progress',
    v_client1, v_client_site1, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    1, 1, 'accepted',
    TIME '10:20', 25.880, 11.900, 13.980,
    'UI-WB-005-1', 'PO-UI-005', 'RIVERSIDE-B'
  ),

  /* 06 — planned */
  (
    'UI-DEMO-TODAY-06', 0, 'incoming', 'booked',
    v_client2, v_client_site2, NULL,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    1, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-006', 'EXCHANGE-B'
  ),

  /* 07 — three planned */
  (
    'UI-DEMO-TODAY-07', 0, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    3, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-007', 'NORTHFIELD-B'
  ),
  (
    'UI-DEMO-TODAY-07', 0, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    3, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-007', 'NORTHFIELD-B'
  ),
  (
    'UI-DEMO-TODAY-07', 0, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    3, 3, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-UI-007', 'NORTHFIELD-B'
  ),

  /* 08 — arrived + accepted */
  (
    'UI-DEMO-TODAY-08', 0, 'incoming', 'in_progress',
    v_client4, v_client_site4, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 1, 'arrived',
    TIME '11:05', 26.400, 11.900, 14.500,
    'UI-WB-008-1', 'PO-UI-008', 'FOUNDRY-B'
  ),
  (
    'UI-DEMO-TODAY-08', 0, 'incoming', 'in_progress',
    v_client4, v_client_site4, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 2, 'accepted',
    TIME '11:25', 27.050, 11.900, 15.150,
    'UI-WB-008-2', 'PO-UI-008', 'FOUNDRY-B'
  );


  /* ================================================================
     TODAY — OUTGOING
     Positive net weights + matching external facility EWC mappings mean
     the existing Complete action can be exercised.
  ================================================================ */

  INSERT INTO ui_demo_seed VALUES
  (
    'UI-DEMO-OUT-TODAY-01', 0, 'outgoing', 'booked',
    NULL, NULL, v_receiver_site,
    v_carrier1, v_driver1, v_vehicle1,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    1, 1, 'planned',
    NULL, 24.500, 12.600, 11.900,
    'UI-OUT-001', 'PO-OUT-001', 'TRANSFER-A'
  ),
  (
    'UI-DEMO-OUT-TODAY-02', 0, 'outgoing', 'booked',
    NULL, NULL, v_receiver_site,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    1, 1, 'planned',
    NULL, 29.800, 11.400, 18.400,
    'UI-OUT-002', 'PO-OUT-002', 'TRANSFER-B'
  );


  /* ================================================================
     TOMORROW — UPCOMING JOBS
  ================================================================ */

  INSERT INTO ui_demo_seed VALUES
  (
    'UI-DEMO-TOMORROW-01', 1, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    2, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-001', 'RIVERSIDE-C'
  ),
  (
    'UI-DEMO-TOMORROW-01', 1, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    2, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-001', 'RIVERSIDE-C'
  ),
  (
    'UI-DEMO-TOMORROW-02', 1, 'incoming', 'booked',
    v_client2, v_client_site2, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    1, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-002', 'EXCHANGE-C'
  ),
  (
    'UI-DEMO-TOMORROW-03', 1, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    3, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-003', 'NORTHFIELD-C'
  ),
  (
    'UI-DEMO-TOMORROW-03', 1, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    3, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-003', 'NORTHFIELD-C'
  ),
  (
    'UI-DEMO-TOMORROW-03', 1, 'incoming', 'booked',
    v_client3, v_client_site3, NULL,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    3, 3, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-003', 'NORTHFIELD-C'
  ),
  (
    'UI-DEMO-TOMORROW-04', 1, 'incoming', 'booked',
    v_client4, v_client_site4, NULL,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    1, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-004', 'FOUNDRY-C'
  ),
  (
    'UI-DEMO-TOMORROW-05', 1, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 1, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-005', 'RIVERSIDE-D'
  ),
  (
    'UI-DEMO-TOMORROW-05', 1, 'incoming', 'booked',
    v_client1, v_client_site1, NULL,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    2, 2, 'planned',
    NULL, NULL, NULL, NULL,
    NULL, 'PO-TMR-005', 'RIVERSIDE-D'
  );


  /* ================================================================
     YESTERDAY — COMPLETED OUTGOING HISTORY
     These give Movements > Outgoing meaningful completed records without
     adding completed incoming rows to the DWT batch queue.
  ================================================================ */

  INSERT INTO ui_demo_seed VALUES
  (
    'UI-DEMO-HISTORY-01', -1, 'outgoing', 'completed',
    NULL, NULL, v_receiver_site,
    v_carrier1, v_driver1, v_vehicle1,
    v_material1, v_ewc1_id, v_ewc1_code, v_ewc1_desc,
    1, 1, 'completed',
    TIME '14:10', 25.200, 12.600, 12.600,
    'UI-HIST-001', 'PO-HIST-001', 'HISTORY-A'
  ),
  (
    'UI-DEMO-HISTORY-02', -1, 'outgoing', 'completed',
    NULL, NULL, v_receiver_site,
    v_carrier2, v_driver2, v_vehicle2,
    v_material2, v_ewc2_id, v_ewc2_code, v_ewc2_desc,
    1, 1, 'completed',
    TIME '15:00', 27.350, 11.900, 15.450,
    'UI-HIST-002', 'PO-HIST-002', 'HISTORY-B'
  ),
  (
    'UI-DEMO-HISTORY-03', -1, 'outgoing', 'completed',
    NULL, NULL, v_receiver_site,
    v_carrier3, v_driver3, v_vehicle3,
    v_material3, v_ewc3_id, v_ewc3_code, v_ewc3_desc,
    1, 1, 'completed',
    TIME '15:45', 31.100, 11.400, 19.700,
    'UI-HIST-003', 'PO-HIST-003', 'HISTORY-C'
  );


  /* ================================================================
     11. INSERT JOBS
  ================================================================ */

  INSERT INTO bb_job (
    id,
    "organisationId",
    "jobNumber",
    source,
    direction,
    status,
    "jobDate",
    "clientCounterpartyId",
    "clientSiteId",
    "ownSiteId",
    "sitePermitId",
    "thirdPartyDestinationSiteId",
    "haulierCounterpartyId",
    "driverId",
    "vehicleId",
    "materialProfileId",
    "plannedLoads",
    "purchaseOrder",
    "customerReference",
    notes,
    "createdByUserId",
    "completedAt",
    "createdAt",
    "updatedAt"
  )
  SELECT DISTINCT ON (s.job_number)
    'ui-demo-job-' || md5(v_org_id || '|' || s.job_number),
    v_org_id,
    s.job_number,
    'manual',
    s.direction,
    s.job_status,
    (CURRENT_DATE + s.day_offset)::timestamp,
    s.client_id,
    s.client_site_id,
    v_site_id,
    CASE WHEN s.direction = 'incoming' THEN v_permit_id ELSE NULL END,
    s.destination_site_id,
    s.haulier_id,
    s.driver_id,
    s.vehicle_id,
    s.material_id,
    s.planned_loads,
    s.purchase_order,
    s.customer_reference,
    '[UI Demo Seed] Dense operations table preview.',
    v_user_id,
    CASE
      WHEN s.job_status = 'completed'
      THEN (CURRENT_DATE + s.day_offset) + COALESCE(s.event_time, TIME '16:00')
           + interval '20 minutes'
      ELSE NULL
    END,
    now(),
    now()
  FROM ui_demo_seed s
  ORDER BY s.job_number, s.load_number;


  /* ================================================================
     12. INSERT LOADS
  ================================================================ */

  INSERT INTO bb_job_load (
    id,
    "organisationId",
    "jobId",
    "loadNumber",
    status,
    direction,

    "movementAt",
    "receivedAt",

    "clientCounterpartyId",
    "clientSiteId",
    "ownSiteId",
    "sitePermitId",
    "thirdPartyDestinationSiteId",

    "haulierCounterpartyId",
    "driverId",
    "vehicleId",

    "materialProfileId",
    "ewcCodeId",
    "ewcCodeSnapshot",
    "wasteDescriptionSnapshot",
    "physicalFormSnapshot",
    "numberOfContainers",
    "containerTypeSnapshot",

    "containsPops",
    "popsComponents",
    "containsHazardous",
    "hazardousHazCodes",
    "hazardousComponents",

    "disposalRecoveryCodeId",
    "disposalRecoveryCodeSnapshot",

    "grossWeight",
    "tareWeight",
    "netWeight",
    "weightMetric",
    "weightIsEstimate",
    "weightSource",

    "ticketNumber",
    "purchaseOrder",
    "customerReference",
    currency,
    notes,

    "createdByUserId",
    "completedAt",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'ui-demo-load-' || md5(
      v_org_id || '|' || s.job_number || '|' || s.load_number
    ),
    v_org_id,
    'ui-demo-job-' || md5(v_org_id || '|' || s.job_number),
    s.load_number,
    s.load_status,
    s.direction,

    CASE
      WHEN s.direction = 'outgoing' AND s.event_time IS NOT NULL
      THEN (CURRENT_DATE + s.day_offset) + s.event_time
      WHEN s.direction = 'incoming' AND s.event_time IS NOT NULL
      THEN (CURRENT_DATE + s.day_offset) + s.event_time
      ELSE NULL
    END,

    CASE
      WHEN s.direction = 'incoming' AND s.event_time IS NOT NULL
      THEN (CURRENT_DATE + s.day_offset) + s.event_time
      ELSE NULL
    END,

    s.client_id,
    s.client_site_id,
    v_site_id,
    CASE WHEN s.direction = 'incoming' THEN v_permit_id ELSE NULL END,
    s.destination_site_id,

    s.haulier_id,
    s.driver_id,
    s.vehicle_id,

    s.material_id,
    s.ewc_id,
    s.ewc_code,
    s.waste_description,
    'Solid',
    1,
    'SKI',

    false,
    '[]',
    false,
    '[]',
    '[]',

    v_r5_id,
    CASE WHEN v_r5_id IS NOT NULL THEN 'R5' ELSE NULL END,

    s.gross_weight,
    s.tare_weight,
    s.net_weight,
    'Tonnes',
    false,
    'manual',

    s.ticket_number,
    s.purchase_order,
    s.customer_reference,
    'GBP',
    '[UI Demo Seed] Operational UI preview load.',

    v_user_id,

    CASE
      WHEN s.load_status = 'completed'
      THEN (CURRENT_DATE + s.day_offset) + COALESCE(s.event_time, TIME '16:00')
           + interval '20 minutes'
      ELSE NULL
    END,

    now(),
    now()
  FROM ui_demo_seed s;


  /* ================================================================
     COMPLETE
  ================================================================ */

  RAISE NOTICE 'UI DEMO OPERATIONS SEED COMPLETE';
  RAISE NOTICE 'Today incoming jobs: 8';
  RAISE NOTICE 'Today outgoing jobs: 2';
  RAISE NOTICE 'Tomorrow incoming jobs: 5';
  RAISE NOTICE 'Historical completed outgoing jobs: 3';
  RAISE NOTICE 'Demo carriers: Northline / Atlas / GreenRoad';

END
$$;

COMMIT;


/* =====================================================================
   VERIFICATION
===================================================================== */

SELECT
  name,
  "carrierRegistrationNumber" AS carrier_reg,
  email
FROM bb_counterparty
WHERE "accountReference" IN ('UI-NLH-001', 'UI-ATL-001', 'UI-GRL-001')
ORDER BY name;

SELECT
  j."jobDate"::date AS job_date,
  j."jobNumber",
  j.direction,
  j.status AS job_status,
  c.name AS client,
  h.name AS haulier,
  v."registrationNumber" AS vehicle,
  COUNT(jl.id) AS loads
FROM bb_job j
LEFT JOIN bb_counterparty c
  ON c.id = j."clientCounterpartyId"
LEFT JOIN bb_counterparty h
  ON h.id = j."haulierCounterpartyId"
LEFT JOIN bb_vehicle v
  ON v.id = j."vehicleId"
LEFT JOIN bb_job_load jl
  ON jl."jobId" = j.id
WHERE j."jobNumber" LIKE 'UI-DEMO-%'
GROUP BY
  j."jobDate",
  j."jobNumber",
  j.direction,
  j.status,
  c.name,
  h.name,
  v."registrationNumber"
ORDER BY j."jobDate", j."jobNumber";

SELECT
  j."jobNumber",
  jl."loadNumber",
  jl.direction,
  jl.status,
  jl."ewcCodeSnapshot" AS ewc,
  jl."netWeight",
  jl."weightMetric",
  h.name AS haulier,
  h."carrierRegistrationNumber" AS carrier_reg,
  h.email AS carrier_email,
  v."registrationNumber" AS vehicle
FROM bb_job_load jl
JOIN bb_job j
  ON j.id = jl."jobId"
LEFT JOIN bb_counterparty h
  ON h.id = jl."haulierCounterpartyId"
LEFT JOIN bb_vehicle v
  ON v.id = jl."vehicleId"
WHERE j."jobNumber" LIKE 'UI-DEMO-%'
ORDER BY j."jobDate", j."jobNumber", jl."loadNumber";
