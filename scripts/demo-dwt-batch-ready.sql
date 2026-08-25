/* =====================================================================
   WASTE X — DWT BATCH READY DEMO SEED V2
   =====================================================================

   FIXES
   ---------------------------------------------------------------------
   - Uses CBDU777777
   - Uses tadi@gmail.com
   - Repairs existing unsubmitted Northline receipt snapshots
   - Does NOT fail when the local test DB has no cached container_types
   - Falls back to SKI for demo/test data when container reference data is empty
   - Creates 6 completed incoming movements with prepared DWT drafts
   - Re-running only recreates DEMO-BATCH-260820-* jobs

   TARGET
   ---------------------------------------------------------------------
   Active user: Tadiwa Mwale

   DEMO / TEST DATA ONLY
   ===================================================================== */

BEGIN;

DO $$
DECLARE
  v_user_id text;
  v_org_id text;

  v_org_name text;
  v_org_phone text;
  v_org_street text;
  v_org_city text;
  v_org_region text;
  v_org_country text;
  v_org_postcode text;

  v_site_id text;
  v_site_name text;
  v_site_address text;
  v_site_postcode text;

  v_permit_id text;
  v_permit_number text;

  v_dwt_environment text;
  v_api_code text;
  v_dwt_enabled boolean;
  v_container_code text;

  v_ewc_concrete text;
  v_ewc_mixed text;
  v_ewc_soil text;
  v_r5 text;

  v_client_oakridge text;
  v_client_meridian text;
  v_client_broadgate text;

  v_site_oakridge text;
  v_site_meridian text;
  v_site_broadgate text;

  v_haulier_northline text;
  v_northline_address text;
  v_northline_postcode text;
  v_northline_phone text;

  v_vehicle_hgv text;
  v_vehicle_skip text;

  v_material_concrete text;
  v_material_mixed text;
  v_material_soil text;

  v_repaired_receipts integer := 0;
BEGIN

  /* ================================================================
     1. TARGET USER + ORGANISATION
  ================================================================ */

  SELECT
    u.id,
    u."organisationId",
    o."teamName",
    o.telephone,
    o."streetAddress",
    o.city,
    o.region,
    o.country,
    o."postCode"
  INTO
    v_user_id,
    v_org_id,
    v_org_name,
    v_org_phone,
    v_org_street,
    v_org_city,
    v_org_region,
    v_org_country,
    v_org_postcode
  FROM bb_user u
  JOIN bb_organisation o
    ON o.id = u."organisationId"
  WHERE lower(trim(u.name)) = lower('Tadiwa Mwale')
    AND u."organisationId" IS NOT NULL
    AND u."isActive" = true
    AND u."isSuspended" = false
  ORDER BY u."createdAt" DESC NULLS LAST
  LIMIT 1;

  IF v_user_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION
      'Could not find active user Tadiwa Mwale with an organisation.';
  END IF;

  RAISE NOTICE 'Target: % / organisation %', v_user_id, v_org_id;


  /* ================================================================
     2. RECEIVING SITE + PERMIT
  ================================================================ */

  SELECT
    s.id,
    s.name,
    s."fullAddress",
    s.postcode
  INTO
    v_site_id,
    v_site_name,
    v_site_address,
    v_site_postcode
  FROM bb_sites s
  WHERE s."organisationId" = v_org_id
    AND s.status = 'active'
    AND s."siteType" = 'waste_receiving_site'
  ORDER BY
    s."isDefault" DESC,
    s."createdAt" ASC
  LIMIT 1;

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION
      'No active waste_receiving_site exists for the target organisation.';
  END IF;

  v_site_address := COALESCE(
    NULLIF(trim(v_site_address), ''),
    concat_ws(
      ', ',
      NULLIF(trim(v_org_street), ''),
      NULLIF(trim(v_org_city), ''),
      NULLIF(trim(v_org_region), ''),
      NULLIF(trim(v_org_country), '')
    )
  );

  v_site_postcode := COALESCE(
    NULLIF(trim(v_site_postcode), ''),
    NULLIF(trim(v_org_postcode), '')
  );

  IF COALESCE(trim(v_site_address), '') = ''
     OR COALESCE(trim(v_site_postcode), '') = ''
  THEN
    RAISE EXCEPTION
      'Receiving site needs a full address and postcode.';
  END IF;

  UPDATE bb_sites
  SET
    "fullAddress" = v_site_address,
    postcode = v_site_postcode,
    "updatedAt" = now()
  WHERE id = v_site_id
    AND "organisationId" = v_org_id;

  SELECT
    p.id,
    p."permitNumber"
  INTO
    v_permit_id,
    v_permit_number
  FROM bb_site_permit p
  WHERE p."organisationId" = v_org_id
    AND p."siteId" = v_site_id
    AND p.status = 'active'
  ORDER BY
    p."isPrimary" DESC,
    p."createdAt" DESC
  LIMIT 1;

  IF v_permit_id IS NULL THEN
    RAISE EXCEPTION
      'Receiving site has no active permit.';
  END IF;


  /* ================================================================
     3. DWT SETTINGS
  ================================================================ */

  SELECT
    s.environment,
    s."apiCode",
    s."isEnabled"
  INTO
    v_dwt_environment,
    v_api_code,
    v_dwt_enabled
  FROM bb_waste_tracking_organisation_setting s
  WHERE s."organisationId" = v_org_id
  LIMIT 1;

  IF COALESCE(v_dwt_enabled, false) = false THEN
    RAISE EXCEPTION
      'DWT is disabled for this organisation.';
  END IF;

  IF COALESCE(trim(v_api_code), '') = '' THEN
    RAISE EXCEPTION
      'DWT Receiver API Code is missing.';
  END IF;

  IF v_api_code !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  THEN
    RAISE EXCEPTION
      'DWT Receiver API Code is not UUID-shaped: %',
      v_api_code;
  END IF;

  v_dwt_environment := COALESCE(v_dwt_environment, 'test');


  /* ================================================================
     4. CONTAINER TYPE

     Prefer synced active reference data.
     If the demo DB has no container_types cache at all, use SKI.
     Waste X PAT already uses SKI for successful receipt scenarios.
  ================================================================ */

  SELECT ref.code
  INTO v_container_code
  FROM bb_waste_tracking_reference_data ref
  WHERE ref.type = 'container_types'
    AND ref.environment = v_dwt_environment
    AND ref."isActive" = true
    AND COALESCE(trim(ref.code), '') <> ''
  ORDER BY
    CASE WHEN upper(ref.code) = 'SKI' THEN 0 ELSE 1 END,
    ref.code
  LIMIT 1;

  IF v_container_code IS NULL THEN
    v_container_code := 'SKI';

    RAISE NOTICE
      'No cached container_types for environment %. Using demo fallback: SKI',
      v_dwt_environment;
  ELSE
    RAISE NOTICE
      'Using active DWT container type: %',
      v_container_code;
  END IF;


  /* ================================================================
     5. EWCs + R5
  ================================================================ */

  SELECT id
  INTO v_ewc_concrete
  FROM bb_ewc_code
  WHERE regexp_replace(code, '[^0-9]', '', 'g') = '170101'
    AND "isActive" = true
  LIMIT 1;

  SELECT id
  INTO v_ewc_mixed
  FROM bb_ewc_code
  WHERE regexp_replace(code, '[^0-9]', '', 'g') = '170904'
    AND "isActive" = true
  LIMIT 1;

  SELECT id
  INTO v_ewc_soil
  FROM bb_ewc_code
  WHERE regexp_replace(code, '[^0-9]', '', 'g') = '170504'
    AND "isActive" = true
  LIMIT 1;

  IF v_ewc_concrete IS NULL
     OR v_ewc_mixed IS NULL
     OR v_ewc_soil IS NULL
  THEN
    RAISE EXCEPTION
      'Required EWC rows 170101 / 170904 / 170504 are missing.';
  END IF;

  SELECT id
  INTO v_r5
  FROM bb_disposal_recovery_code
  WHERE upper(code) = 'R5'
    AND "isActive" = true
  LIMIT 1;

  IF v_r5 IS NULL THEN
    RAISE EXCEPTION
      'R5 is missing from bb_disposal_recovery_code.';
  END IF;

  INSERT INTO bb_permit_ewc_code (
    "organisationId",
    "permitId",
    "ewcCodeId",
    "isActive",
    "configuredByUserId",
    "createdAt"
  )
  VALUES
    (
      v_org_id,
      v_permit_id,
      v_ewc_concrete,
      true,
      v_user_id,
      now()
    ),
    (
      v_org_id,
      v_permit_id,
      v_ewc_mixed,
      true,
      v_user_id,
      now()
    ),
    (
      v_org_id,
      v_permit_id,
      v_ewc_soil,
      true,
      v_user_id,
      now()
    )
  ON CONFLICT ("permitId", "ewcCodeId")
  DO UPDATE SET
    "organisationId" = EXCLUDED."organisationId",
    "isActive" = true,
    "configuredByUserId" = EXCLUDED."configuredByUserId";


  /* ================================================================
     6. CLIENTS

     Reuse existing demo clients. Create only if missing.
  ================================================================ */

  SELECT id
  INTO v_client_oakridge
  FROM bb_counterparty
  WHERE "organisationId" = v_org_id
    AND lower(name) = lower('Oakridge Developments Ltd')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_client_oakridge IS NULL THEN
    v_client_oakridge :=
      'demo-cp-' || md5(v_org_id || '|oakridge');

    INSERT INTO bb_counterparty (
      id,
      "organisationId",
      name,
      "accountReference",
      email,
      telephone,
      "fullAddress",
      postcode,
      "paymentTermsDays",
      notes,
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_client_oakridge,
      v_org_id,
      'Oakridge Developments Ltd',
      'DEMO-OAK-01',
      'accounts@oakridge.example.com',
      '07700 900101',
      '10 Demo Square, Birmingham',
      'B1 1DE',
      30,
      '[DWT Batch Ready V2] Demo client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (v_org_id, v_client_oakridge, 'client', now()),
    (v_org_id, v_client_oakridge, 'producer', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  SELECT id
  INTO v_site_oakridge
  FROM bb_counterparty_site
  WHERE "organisationId" = v_org_id
    AND "counterpartyId" = v_client_oakridge
    AND lower(name) = lower('Riverside Quarter Redevelopment')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_site_oakridge IS NULL THEN
    v_site_oakridge :=
      'demo-cps-' || md5(v_org_id || '|oakridge-riverside');

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
      "isDefault",
      "isActive",
      notes,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_site_oakridge,
      v_org_id,
      v_client_oakridge,
      'Riverside Quarter Redevelopment',
      'producer_site',
      '1 Canal Wharf, Birmingham',
      'B5 5TR',
      'Amelia Hart',
      'amelia@oakridge.example.com',
      '07700 900102',
      true,
      true,
      '[DWT Batch Ready V2] Demo origin.',
      now(),
      now()
    );
  END IF;


  SELECT id
  INTO v_client_meridian
  FROM bb_counterparty
  WHERE "organisationId" = v_org_id
    AND lower(name) = lower('Meridian Construction Group')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_client_meridian IS NULL THEN
    v_client_meridian :=
      'demo-cp-' || md5(v_org_id || '|meridian');

    INSERT INTO bb_counterparty (
      id,
      "organisationId",
      name,
      "accountReference",
      email,
      telephone,
      "fullAddress",
      postcode,
      "paymentTermsDays",
      notes,
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_client_meridian,
      v_org_id,
      'Meridian Construction Group',
      'DEMO-MER-01',
      'accounts@meridian.example.com',
      '07700 900111',
      '24 Colmore Demo Row, Birmingham',
      'B3 2AA',
      30,
      '[DWT Batch Ready V2] Demo client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (v_org_id, v_client_meridian, 'client', now()),
    (v_org_id, v_client_meridian, 'producer', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  SELECT id
  INTO v_site_meridian
  FROM bb_counterparty_site
  WHERE "organisationId" = v_org_id
    AND "counterpartyId" = v_client_meridian
    AND lower(name) = lower('Exchange Square Development')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_site_meridian IS NULL THEN
    v_site_meridian :=
      'demo-cps-' || md5(v_org_id || '|meridian-exchange');

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
      "isDefault",
      "isActive",
      notes,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_site_meridian,
      v_org_id,
      v_client_meridian,
      'Exchange Square Development',
      'producer_site',
      '42 Exchange Street, Birmingham',
      'B4 6FY',
      'Sophie Turner',
      'sophie@meridian.example.com',
      '07700 900112',
      true,
      true,
      '[DWT Batch Ready V2] Demo origin.',
      now(),
      now()
    );
  END IF;


  SELECT id
  INTO v_client_broadgate
  FROM bb_counterparty
  WHERE "organisationId" = v_org_id
    AND lower(name) = lower('Broadgate Civils Ltd')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_client_broadgate IS NULL THEN
    v_client_broadgate :=
      'demo-cp-' || md5(v_org_id || '|broadgate');

    INSERT INTO bb_counterparty (
      id,
      "organisationId",
      name,
      "accountReference",
      email,
      telephone,
      "fullAddress",
      postcode,
      "paymentTermsDays",
      notes,
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_client_broadgate,
      v_org_id,
      'Broadgate Civils Ltd',
      'DEMO-BRD-01',
      'accounts@broadgate.example.com',
      '07700 900121',
      '8 Infrastructure Way, Birmingham',
      'B7 4AA',
      30,
      '[DWT Batch Ready V2] Demo client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (v_org_id, v_client_broadgate, 'client', now()),
    (v_org_id, v_client_broadgate, 'producer', now())
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  SELECT id
  INTO v_site_broadgate
  FROM bb_counterparty_site
  WHERE "organisationId" = v_org_id
    AND "counterpartyId" = v_client_broadgate
    AND lower(name) = lower('Northfield Infrastructure Works')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_site_broadgate IS NULL THEN
    v_site_broadgate :=
      'demo-cps-' || md5(v_org_id || '|broadgate-northfield');

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
      "isDefault",
      "isActive",
      notes,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_site_broadgate,
      v_org_id,
      v_client_broadgate,
      'Northfield Infrastructure Works',
      'producer_site',
      '17 Northfield Road, Birmingham',
      'B6 7EU',
      'Daniel Brooks',
      'daniel@broadgate.example.com',
      '07700 900122',
      true,
      true,
      '[DWT Batch Ready V2] Demo origin.',
      now(),
      now()
    );
  END IF;


  /* ================================================================
     7. NORTHLINE HAULAGE — REQUESTED VALID DEMO DETAILS
  ================================================================ */

  SELECT id
  INTO v_haulier_northline
  FROM bb_counterparty
  WHERE "organisationId" = v_org_id
    AND lower(name) = lower('Northline Haulage Ltd')
  ORDER BY "isActive" DESC, "createdAt" DESC
  LIMIT 1;

  IF v_haulier_northline IS NULL THEN
    v_haulier_northline :=
      'demo-cp-' || md5(v_org_id || '|northline');

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
      "paymentTermsDays",
      notes,
      "isActive",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_haulier_northline,
      v_org_id,
      'Northline Haulage Ltd',
      'DEMO-NLH-01',
      'tadi@gmail.com',
      '07700 900131',
      '22 Haulage Park, Birmingham',
      'B24 8AA',
      'CBDU777777',
      30,
      '[DWT Batch Ready V2] Demo external haulier.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  UPDATE bb_counterparty
  SET
    email = 'tadi@gmail.com',
    "carrierRegistrationNumber" = 'CBDU777777',
    "fullAddress" = COALESCE(
      NULLIF(trim("fullAddress"), ''),
      '22 Haulage Park, Birmingham'
    ),
    postcode = COALESCE(
      NULLIF(trim(postcode), ''),
      'B24 8AA'
    ),
    telephone = COALESCE(
      NULLIF(trim(telephone), ''),
      '07700 900131'
    ),
    "isActive" = true,
    "updatedAt" = now()
  WHERE id = v_haulier_northline
    AND "organisationId" = v_org_id;

  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES (
    v_org_id,
    v_haulier_northline,
    'haulier',
    now()
  )
  ON CONFLICT ("counterpartyId", role) DO NOTHING;

  SELECT
    "fullAddress",
    postcode,
    telephone
  INTO
    v_northline_address,
    v_northline_postcode,
    v_northline_phone
  FROM bb_counterparty
  WHERE id = v_haulier_northline;


  /* ================================================================
     8. VEHICLES
  ================================================================ */

  INSERT INTO bb_vehicle (
    id,
    "organisationId",
    "haulierCounterpartyId",
    "registrationNumber",
    "vehicleType",
    "isActive",
    notes,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'demo-veh-' || md5(v_org_id || '|NL26 HGV'),
    v_org_id,
    v_haulier_northline,
    'NL26 HGV',
    'Tipper',
    true,
    '[DWT Batch Ready V2] Demo external vehicle.',
    now(),
    now()
  )
  ON CONFLICT ("organisationId", "registrationNumber")
  DO UPDATE SET
    "haulierCounterpartyId" = EXCLUDED."haulierCounterpartyId",
    "isActive" = true,
    "updatedAt" = now();

  INSERT INTO bb_vehicle (
    id,
    "organisationId",
    "haulierCounterpartyId",
    "registrationNumber",
    "vehicleType",
    "isActive",
    notes,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    'demo-veh-' || md5(v_org_id || '|NL26 SKP'),
    v_org_id,
    v_haulier_northline,
    'NL26 SKP',
    'Skip lorry',
    true,
    '[DWT Batch Ready V2] Demo external vehicle.',
    now(),
    now()
  )
  ON CONFLICT ("organisationId", "registrationNumber")
  DO UPDATE SET
    "haulierCounterpartyId" = EXCLUDED."haulierCounterpartyId",
    "isActive" = true,
    "updatedAt" = now();

  SELECT id
  INTO v_vehicle_hgv
  FROM bb_vehicle
  WHERE "organisationId" = v_org_id
    AND "registrationNumber" = 'NL26 HGV'
  LIMIT 1;

  SELECT id
  INTO v_vehicle_skip
  FROM bb_vehicle
  WHERE "organisationId" = v_org_id
    AND "registrationNumber" = 'NL26 SKP'
  LIMIT 1;


  /* ================================================================
     9. MATERIAL PROFILES
  ================================================================ */

  SELECT id
  INTO v_material_concrete
  FROM bb_material_profile
  WHERE "organisationId" = v_org_id
    AND "ewcCodeId" = v_ewc_concrete
    AND "isActive" = true
  ORDER BY
    "isFavourite" DESC,
    "createdAt" DESC
  LIMIT 1;

  IF v_material_concrete IS NULL THEN
    v_material_concrete :=
      'demo-mat-' || md5(v_org_id || '|batch-concrete-v2');

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
      "containsHazardous",
      "defaultDisposalRecoveryCodeId",
      "defaultWeightMetric",
      "isFavourite",
      "isActive",
      notes,
      "createdByUserId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_material_concrete,
      v_org_id,
      v_site_id,
      'DWT Batch Clean Concrete',
      v_ewc_concrete,
      'Clean non-hazardous concrete arising from demolition and site preparation works.',
      'Solid',
      1,
      v_container_code,
      false,
      false,
      v_r5,
      'Tonnes',
      true,
      true,
      '[DWT Batch Ready V2] Batch-safe demo material.',
      v_user_id,
      now(),
      now()
    );
  END IF;

  SELECT id
  INTO v_material_mixed
  FROM bb_material_profile
  WHERE "organisationId" = v_org_id
    AND "ewcCodeId" = v_ewc_mixed
    AND "isActive" = true
  ORDER BY
    "isFavourite" DESC,
    "createdAt" DESC
  LIMIT 1;

  IF v_material_mixed IS NULL THEN
    v_material_mixed :=
      'demo-mat-' || md5(v_org_id || '|batch-mixed-v2');

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
      "containsHazardous",
      "defaultDisposalRecoveryCodeId",
      "defaultWeightMetric",
      "isFavourite",
      "isActive",
      notes,
      "createdByUserId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_material_mixed,
      v_org_id,
      v_site_id,
      'DWT Batch Mixed C&D',
      v_ewc_mixed,
      'Mixed non-hazardous construction and demolition waste.',
      'Solid',
      1,
      v_container_code,
      false,
      false,
      v_r5,
      'Tonnes',
      true,
      true,
      '[DWT Batch Ready V2] Batch-safe demo material.',
      v_user_id,
      now(),
      now()
    );
  END IF;

  SELECT id
  INTO v_material_soil
  FROM bb_material_profile
  WHERE "organisationId" = v_org_id
    AND "ewcCodeId" = v_ewc_soil
    AND "isActive" = true
  ORDER BY
    "isFavourite" DESC,
    "createdAt" DESC
  LIMIT 1;

  IF v_material_soil IS NULL THEN
    v_material_soil :=
      'demo-mat-' || md5(v_org_id || '|batch-soil-v2');

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
      "containsHazardous",
      "defaultDisposalRecoveryCodeId",
      "defaultWeightMetric",
      "isFavourite",
      "isActive",
      notes,
      "createdByUserId",
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_material_soil,
      v_org_id,
      v_site_id,
      'DWT Batch Soil & Stones',
      v_ewc_soil,
      'Non-hazardous soil and stones from construction excavation works.',
      'Solid',
      1,
      v_container_code,
      false,
      false,
      v_r5,
      'Tonnes',
      true,
      true,
      '[DWT Batch Ready V2] Batch-safe demo material.',
      v_user_id,
      now(),
      now()
    );
  END IF;


  /* ================================================================
     10. REPAIR EXISTING UNSUBMITTED NORTHLINE RECEIPTS

     This is important because DWT receipt carrier details are snapshots.
     Updating bb_counterparty alone would not fix already-prepared receipts.
  ================================================================ */

  UPDATE bb_waste_receipt wr
  SET
    "carrierRegistrationNumber" = 'CBDU777777',
    "carrierReasonForNoRegistrationNumber" = NULL,
    "carrierEmailAddress" = 'tadi@gmail.com',
    "carrierOrganisationName" = 'Northline Haulage Ltd',
    "carrierFullAddress" = v_northline_address,
    "carrierPostcode" = v_northline_postcode,
    "carrierPhoneNumber" = v_northline_phone,
    "carrierMeansOfTransport" = 'Road',
    "receiverEmailAddress" = COALESCE(
      NULLIF(trim(wr."receiverEmailAddress"), ''),
      'tadi@gmail.com'
    ),
    "updatedAt" = now()
  WHERE wr."organisationId" = v_org_id
    AND wr.status <> 'submitted'
    AND (
      wr."carrierCounterpartyId" = v_haulier_northline
      OR lower(
        COALESCE(wr."carrierOrganisationName", '')
      ) = lower('Northline Haulage Ltd')
    );

  GET DIAGNOSTICS v_repaired_receipts = ROW_COUNT;


  /* ================================================================
     11. REMOVE ONLY THE PREVIOUS V2 DEMO BATCH
  ================================================================ */

  DELETE FROM bb_waste_tracking_submission s
  WHERE s."organisationId" = v_org_id
    AND s."jobLoadId" IN (
      SELECT jl.id
      FROM bb_job_load jl
      JOIN bb_job j
        ON j.id = jl."jobId"
      WHERE j."organisationId" = v_org_id
        AND j."jobNumber" LIKE 'DEMO-BATCH-260820-%'
    );

  DELETE FROM bb_job
  WHERE "organisationId" = v_org_id
    AND "jobNumber" LIKE 'DEMO-BATCH-260820-%';


  /* ================================================================
     12. SIX COMPLETED, PREPARED MOVEMENTS
  ================================================================ */

  CREATE TEMP TABLE demo_dwt_batch_seed (
    job_number text NOT NULL,
    received_at timestamp NOT NULL,
    client_id text NOT NULL,
    client_site_id text NOT NULL,
    vehicle_id text NOT NULL,
    vehicle_registration text NOT NULL,
    material_id text NOT NULL,
    ewc_id text NOT NULL,
    ewc_code text NOT NULL,
    waste_description text NOT NULL,
    gross_weight numeric NOT NULL,
    tare_weight numeric NOT NULL,
    net_weight numeric NOT NULL,
    ticket_number text NOT NULL,
    purchase_order text NOT NULL,
    customer_reference text NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO demo_dwt_batch_seed
  VALUES
    (
      'DEMO-BATCH-260820-01',
      TIMESTAMP '2026-08-20 11:10:00',
      v_client_oakridge,
      v_site_oakridge,
      v_vehicle_hgv,
      'NL26 HGV',
      v_material_concrete,
      v_ewc_concrete,
      '170101',
      'Clean non-hazardous concrete arising from demolition and site preparation works.',
      31.020,
      12.600,
      18.420,
      'BATCH-WB-260820-201',
      'PO-OAK-BATCH-01',
      'RIV-BATCH-A'
    ),
    (
      'DEMO-BATCH-260820-02',
      TIMESTAMP '2026-08-20 11:45:00',
      v_client_meridian,
      v_site_meridian,
      v_vehicle_skip,
      'NL26 SKP',
      v_material_mixed,
      v_ewc_mixed,
      '170904',
      'Mixed non-hazardous construction and demolition waste.',
      25.580,
      11.900,
      13.680,
      'BATCH-WB-260820-202',
      'PO-MER-BATCH-01',
      'EXC-BATCH-A'
    ),
    (
      'DEMO-BATCH-260820-03',
      TIMESTAMP '2026-08-20 12:20:00',
      v_client_broadgate,
      v_site_broadgate,
      v_vehicle_hgv,
      'NL26 HGV',
      v_material_soil,
      v_ewc_soil,
      '170504',
      'Non-hazardous soil and stones from construction excavation works.',
      33.850,
      12.600,
      21.250,
      'BATCH-WB-260820-203',
      'PO-BRD-BATCH-01',
      'NTH-BATCH-A'
    ),
    (
      'DEMO-BATCH-260820-04',
      TIMESTAMP '2026-08-20 13:05:00',
      v_client_oakridge,
      v_site_oakridge,
      v_vehicle_skip,
      'NL26 SKP',
      v_material_mixed,
      v_ewc_mixed,
      '170904',
      'Mixed non-hazardous construction and demolition waste.',
      27.240,
      11.900,
      15.340,
      'BATCH-WB-260820-204',
      'PO-OAK-BATCH-02',
      'RIV-BATCH-B'
    ),
    (
      'DEMO-BATCH-260820-05',
      TIMESTAMP '2026-08-20 13:40:00',
      v_client_meridian,
      v_site_meridian,
      v_vehicle_hgv,
      'NL26 HGV',
      v_material_concrete,
      v_ewc_concrete,
      '170101',
      'Clean non-hazardous concrete arising from demolition and site preparation works.',
      30.510,
      12.600,
      17.910,
      'BATCH-WB-260820-205',
      'PO-MER-BATCH-02',
      'EXC-BATCH-B'
    ),
    (
      'DEMO-BATCH-260820-06',
      TIMESTAMP '2026-08-20 14:20:00',
      v_client_broadgate,
      v_site_broadgate,
      v_vehicle_skip,
      'NL26 SKP',
      v_material_soil,
      v_ewc_soil,
      '170504',
      'Non-hazardous soil and stones from construction excavation works.',
      31.760,
      11.900,
      19.860,
      'BATCH-WB-260820-206',
      'PO-BRD-BATCH-02',
      'NTH-BATCH-B'
    );


  /* ================================================================
     13. JOBS
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
    "haulierCounterpartyId",
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
  SELECT
    'demo-batch-job-' || md5(
      v_org_id || '|' || s.job_number
    ),
    v_org_id,
    s.job_number,
    'manual',
    'incoming',
    'completed',
    s.received_at,
    s.client_id,
    s.client_site_id,
    v_site_id,
    v_permit_id,
    v_haulier_northline,
    s.vehicle_id,
    s.material_id,
    1,
    s.purchase_order,
    s.customer_reference,
    '[DWT Batch Ready V2] Completed incoming movement.',
    v_user_id,
    s.received_at + interval '20 minutes',
    s.received_at - interval '1 day',
    now()
  FROM demo_dwt_batch_seed s;


  /* ================================================================
     14. JOB LOADS
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
    "haulierCounterpartyId",
    "vehicleId",
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
    'demo-batch-load-' || md5(
      v_org_id || '|' || s.job_number || '|1'
    ),
    v_org_id,
    'demo-batch-job-' || md5(
      v_org_id || '|' || s.job_number
    ),
    1,
    'completed',
    'incoming',
    s.received_at,
    s.received_at,
    s.client_id,
    s.client_site_id,
    v_site_id,
    v_permit_id,
    v_haulier_northline,
    s.vehicle_id,
    s.material_id,
    s.ewc_id,
    s.ewc_code,
    s.waste_description,
    'Solid',
    1,
    v_container_code,
    false,
    NULL,
    '[]',
    false,
    NULL,
    '[]',
    '[]',
    v_r5,
    'R5',
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
    '[DWT Batch Ready V2] Valid demo movement for batch preflight.',
    v_user_id,
    s.received_at + interval '20 minutes',
    s.received_at,
    now()
  FROM demo_dwt_batch_seed s;


  /* ================================================================
     15. PREPARED WASTE RECEIPT DRAFTS
  ================================================================ */

  INSERT INTO bb_waste_receipt (
    id,
    "organisationId",
    "jobLoadId",
    "siteId",
    "sitePermitId",
    "receivedByUserId",
    "carrierCounterpartyId",
    "receiverOrganisationId",
    "receivedAt",
    status,
    "reasonForNoConsignmentCode",
    "yourUniqueReference",
    "otherReferencesForMovement",
    "carrierRegistrationNumber",
    "carrierReasonForNoRegistrationNumber",
    "carrierOrganisationName",
    "carrierFullAddress",
    "carrierPostcode",
    "carrierEmailAddress",
    "carrierPhoneNumber",
    "carrierVehicleRegistration",
    "carrierMeansOfTransport",
    "receiverSiteName",
    "receiverEmailAddress",
    "receiverPhoneNumber",
    "receiverAuthorisationNumber",
    "receiverRegulatoryPositionStatements",
    "receiptFullAddress",
    "receiptPostcode",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'demo-batch-receipt-' || md5(
      v_org_id || '|' || s.job_number || '|1'
    ),
    v_org_id,
    'demo-batch-load-' || md5(
      v_org_id || '|' || s.job_number || '|1'
    ),
    v_site_id,
    v_permit_id,
    v_user_id,
    v_haulier_northline,
    v_org_id,
    s.received_at,
    'draft',
    'NON_HAZ_WASTE_TRANSFER',
    s.ticket_number,
    json_build_array(
      json_build_object(
        'label',
        'Waste X Job',
        'reference',
        s.job_number
      ),
      json_build_object(
        'label',
        'Purchase Order',
        'reference',
        s.purchase_order
      ),
      json_build_object(
        'label',
        'Customer Reference',
        'reference',
        s.customer_reference
      )
    )::text,
    'CBDU777777',
    NULL,
    'Northline Haulage Ltd',
    v_northline_address,
    v_northline_postcode,
    'tadi@gmail.com',
    v_northline_phone,
    s.vehicle_registration,
    'Road',
    v_site_name,
    'tadi@gmail.com',
    v_org_phone,
    v_permit_number,
    '[]',
    v_site_address,
    v_site_postcode,
    s.received_at + interval '20 minutes',
    now()
  FROM demo_dwt_batch_seed s;


  /* ================================================================
     16. ONE WASTE RECEIPT ITEM PER MOVEMENT
  ================================================================ */

  INSERT INTO bb_waste_receipt_item (
    id,
    "organisationId",
    "receiptId",
    "ewcCodes",
    "wasteDescription",
    "physicalForm",
    "numberOfContainers",
    "typeOfContainers",
    "weightMetric",
    "weightAmount",
    "weightIsEstimate",
    "containsPops",
    "popsSourceOfComponents",
    "popsComponents",
    "containsHazardous",
    "hazardousSourceOfComponents",
    "hazardousHazCodes",
    "hazardousComponents",
    "disposalOrRecoveryCodes",
    "createdAt",
    "updatedAt"
  )
  SELECT
    'demo-batch-item-' || md5(
      v_org_id || '|' || s.job_number || '|1'
    ),
    v_org_id,
    'demo-batch-receipt-' || md5(
      v_org_id || '|' || s.job_number || '|1'
    ),
    json_build_array(s.ewc_code)::text,
    s.waste_description,
    'Solid',
    1,
    v_container_code,
    'Tonnes',
    s.net_weight,
    false,
    false,
    NULL,
    '[]',
    false,
    NULL,
    '[]',
    '[]',
    json_build_array(
      json_build_object(
        'code',
        'R5',
        'weight',
        json_build_object(
          'metric',
          'Tonnes',
          'amount',
          s.net_weight,
          'isEstimate',
          false
        )
      )
    )::text,
    s.received_at + interval '20 minutes',
    now()
  FROM demo_dwt_batch_seed s;


  /* ================================================================
     COMPLETE
  ================================================================ */

  RAISE NOTICE 'DWT BATCH READY V2 COMPLETE';
  RAISE NOTICE 'Organisation: % (%)', v_org_name, v_org_id;
  RAISE NOTICE 'Carrier registration: CBDU777777';
  RAISE NOTICE 'Carrier email: tadi@gmail.com';
  RAISE NOTICE 'Existing Northline receipt snapshots repaired: %', v_repaired_receipts;
  RAISE NOTICE 'New prepared batch movements: 6';
  RAISE NOTICE 'Container code: %', v_container_code;

END
$$;

COMMIT;


/* =====================================================================
   VERIFICATION
===================================================================== */

SELECT
  c.name AS haulier,
  c."carrierRegistrationNumber" AS carrier_registration,
  c.email AS carrier_email
FROM bb_counterparty c
JOIN bb_user u
  ON u."organisationId" = c."organisationId"
WHERE lower(trim(u.name)) = lower('Tadiwa Mwale')
  AND lower(c.name) = lower('Northline Haulage Ltd')
ORDER BY c."updatedAt" DESC
LIMIT 1;


SELECT
  j."jobNumber",
  jl.status AS load_status,
  jl."ewcCodeSnapshot" AS ewc,
  jl."netWeight" AS net_weight,
  jl."weightMetric" AS metric,
  wr.status AS receipt_status,
  wr."carrierRegistrationNumber" AS carrier_reg,
  wr."carrierEmailAddress" AS carrier_email,
  wri."typeOfContainers" AS container_type,
  COUNT(s.id) AS submission_attempts
FROM bb_job j
JOIN bb_job_load jl
  ON jl."jobId" = j.id
JOIN bb_waste_receipt wr
  ON wr."jobLoadId" = jl.id
JOIN bb_waste_receipt_item wri
  ON wri."receiptId" = wr.id
LEFT JOIN bb_waste_tracking_submission s
  ON s."jobLoadId" = jl.id
JOIN bb_user u
  ON u."organisationId" = j."organisationId"
WHERE lower(trim(u.name)) = lower('Tadiwa Mwale')
  AND j."jobNumber" LIKE 'DEMO-BATCH-260820-%'
GROUP BY
  j."jobNumber",
  jl.status,
  jl."ewcCodeSnapshot",
  jl."netWeight",
  jl."weightMetric",
  wr.status,
  wr."carrierRegistrationNumber",
  wr."carrierEmailAddress",
  wri."typeOfContainers"
ORDER BY j."jobNumber";