/* =====================================================================
   WASTE X — FRESH DEMO ORGANISATION FILL SEED
   =====================================================================

   TARGET USER:
     Tadiwa Mwale

   CURRENT DEMO DATE:
     Wednesday 19 August 2026

   THIS SCRIPT ADDS:

   MASTER DATA
   -------------------------------------------------------------
   - Reuses Oakridge Developments Ltd if already present
   - Adds Meridian Construction Group
   - Adds Broadgate Civils Ltd
   - Reuses / adds Northline Haulage Ltd
   - Adds external drivers + vehicles
   - Adds own driver + vehicle
   - Adds GreenLoop Recycling Ltd + external facility
   - Ensures material profiles exist for:
       17 01 01 Concrete
       17 09 04 Mixed C&D
       17 05 04 Soil & stones
   - Adds varied commercial rates

   OPERATIONS
   -------------------------------------------------------------
   TODAY — 19 AUG 2026
   - 5 completed incoming loads
   - NO waste receipt drafts created
   - therefore Batch DWT Review will show them as Missing Drafts

   TOMORROW — 20 AUG 2026
   - 4 booked jobs
   - 6 planned loads

   FRIDAY — 21 AUG 2026
   - 4 booked jobs
   - 5 planned loads

   Q3 HISTORICAL DATA
   -------------------------------------------------------------
   - 8 accepted incoming loads
   - 7 completed outgoing loads
   - varied clients / EWC / vehicles
   - carbon snapshots on historical outgoing movements

   IMPORTANT
   -------------------------------------------------------------
   - This is additive.
   - It does NOT reset the database.
   - It removes/recreates ONLY jobs made by THIS seed:
       DEMO-Q3-*
       DEMO-DWT-*
       DEMO-THU-*
       DEMO-FRI-*
   - Your manually created jobs remain untouched.
   ===================================================================== */


BEGIN;


/* =====================================================================
   MAIN SEED BLOCK
===================================================================== */

DO $$
DECLARE

  /* -------------------------------------------------------------
     TARGET
  ------------------------------------------------------------- */

  v_user_id text;
  v_org_id text;

  v_receiving_site_id text;
  v_permit_id text;


  /* -------------------------------------------------------------
     EWC + D/R
  ------------------------------------------------------------- */

  v_ewc_concrete text;
  v_ewc_mixed text;
  v_ewc_soil text;

  v_r5 text;


  /* -------------------------------------------------------------
     CLIENTS
  ------------------------------------------------------------- */

  v_client_oakridge text;
  v_client_meridian text;
  v_client_broadgate text;

  v_site_oakridge text;
  v_site_meridian text;
  v_site_broadgate text;


  /* -------------------------------------------------------------
     HAULIER
  ------------------------------------------------------------- */

  v_haulier_northline text;

  v_vehicle_northline_hgv text;
  v_vehicle_northline_skip text;

  v_driver_mason text;
  v_driver_leah text;


  /* -------------------------------------------------------------
     OWN TRANSPORT
  ------------------------------------------------------------- */

  v_vehicle_own text;
  v_driver_priya text;


  /* -------------------------------------------------------------
     THIRD-PARTY FACILITY
  ------------------------------------------------------------- */

  v_greenloop_operator text;
  v_greenloop_site text;
  v_greenloop_auth text;


  /* -------------------------------------------------------------
     MATERIALS
  ------------------------------------------------------------- */

  v_material_concrete text;
  v_material_mixed text;
  v_material_soil text;


  /* -------------------------------------------------------------
     RATES
  ------------------------------------------------------------- */

  v_rate_oak_concrete text;
  v_rate_oak_mixed text;

  v_rate_meridian_concrete text;
  v_rate_meridian_mixed text;

  v_rate_broadgate_soil text;

  v_rate_haulage text;
  v_rate_tipping text;


  /* -------------------------------------------------------------
     RATE AMOUNTS

     These can be replaced automatically if an existing active
     Oakridge / Northline / GreenLoop rate already exists.
  ------------------------------------------------------------- */

  v_amount_oak_concrete numeric := 48.00;
  v_amount_oak_mixed numeric := 92.00;

  v_amount_meridian_concrete numeric := 52.00;
  v_amount_meridian_mixed numeric := 96.00;

  v_amount_broadgate_soil numeric := 39.00;

  v_amount_haulage numeric := 185.00;
  v_amount_tipping numeric := 32.00;


BEGIN


/* =====================================================================
   1. FIND TADIWA + ORGANISATION
===================================================================== */

  SELECT
    u.id,
    u."organisationId"
  INTO
    v_user_id,
    v_org_id
  FROM bb_user u
  WHERE
    lower(trim(u.name)) =
      lower('Tadiwa Mwale')
    AND u."organisationId" IS NOT NULL
    AND u."isActive" = true
    AND u."isSuspended" = false
  ORDER BY
    u."createdAt" DESC NULLS LAST
  LIMIT 1;


  IF v_user_id IS NULL
     OR v_org_id IS NULL
  THEN
    RAISE EXCEPTION
      'Could not find active user Tadiwa Mwale with an organisation.';
  END IF;


  RAISE NOTICE
    'Target user: %, organisation: %',
    v_user_id,
    v_org_id;



/* =====================================================================
   2. FIND / NORMALISE PRIMARY RECEIVING SITE
===================================================================== */

  SELECT
    s.id
  INTO
    v_receiving_site_id
  FROM bb_sites s
  WHERE
    s."organisationId" =
      v_org_id
    AND s.status = 'active'
  ORDER BY
    (
      s."siteType" =
        'waste_receiving_site'
    ) DESC,
    s."isDefault" DESC,
    s."createdAt" ASC
  LIMIT 1;


  IF v_receiving_site_id IS NULL
  THEN
    RAISE EXCEPTION
      'No active site exists for Tadiwa''s organisation.';
  END IF;


  /*
    Keep the Book Job / Receiving Site rules aligned.
  */

  UPDATE bb_sites
  SET
    "isDefault" = false,
    "updatedAt" = now()
  WHERE
    "organisationId" =
      v_org_id
    AND id <>
      v_receiving_site_id
    AND "isDefault" = true;


  UPDATE bb_sites
  SET
    "siteType" =
      'waste_receiving_site',
    "isDefault" = true,
    status = 'active',
    "updatedAt" = now()
  WHERE
    id =
      v_receiving_site_id
    AND "organisationId" =
      v_org_id;



/* =====================================================================
   3. PRIMARY PERMIT
===================================================================== */

  SELECT
    p.id
  INTO
    v_permit_id
  FROM bb_site_permit p
  WHERE
    p."organisationId" =
      v_org_id
    AND p."siteId" =
      v_receiving_site_id
    AND p.status =
      'active'
  ORDER BY
    p."isPrimary" DESC,
    p."createdAt" DESC
  LIMIT 1;


  IF v_permit_id IS NULL
  THEN
    RAISE EXCEPTION
      'The receiving site has no active permit.';
  END IF;


  UPDATE bb_site_permit
  SET
    "isPrimary" = false,
    "updatedAt" = now()
  WHERE
    "organisationId" =
      v_org_id
    AND "siteId" =
      v_receiving_site_id
    AND id <>
      v_permit_id;


  UPDATE bb_site_permit
  SET
    "isPrimary" = true,
    status = 'active',
    "updatedAt" = now()
  WHERE
    id = v_permit_id;



/* =====================================================================
   4. EWC LOOKUPS
===================================================================== */

  SELECT id
  INTO v_ewc_concrete
  FROM bb_ewc_code
  WHERE
    regexp_replace(
      code,
      '[^0-9]',
      '',
      'g'
    ) = '170101'
    AND "isActive" = true
  LIMIT 1;


  SELECT id
  INTO v_ewc_mixed
  FROM bb_ewc_code
  WHERE
    regexp_replace(
      code,
      '[^0-9]',
      '',
      'g'
    ) = '170904'
    AND "isActive" = true
  LIMIT 1;


  SELECT id
  INTO v_ewc_soil
  FROM bb_ewc_code
  WHERE
    regexp_replace(
      code,
      '[^0-9]',
      '',
      'g'
    ) = '170504'
    AND "isActive" = true
  LIMIT 1;


  IF
    v_ewc_concrete IS NULL
    OR v_ewc_mixed IS NULL
    OR v_ewc_soil IS NULL
  THEN
    RAISE EXCEPTION
      'Required EWC catalogue records 170101 / 170904 / 170504 are missing.';
  END IF;



/* =====================================================================
   5. ENSURE THESE THREE EWCs ARE ACTIVE ON CURRENT PERMIT
===================================================================== */

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

  ON CONFLICT (
    "permitId",
    "ewcCodeId"
  )
  DO UPDATE SET
    "organisationId" =
      EXCLUDED."organisationId",
    "isActive" = true,
    "configuredByUserId" =
      EXCLUDED."configuredByUserId";



/* =====================================================================
   6. RECOVERY CODE
===================================================================== */

  SELECT
    id
  INTO
    v_r5
  FROM bb_disposal_recovery_code
  WHERE
    upper(code) = 'R5'
    AND "isActive" = true
  LIMIT 1;


  IF v_r5 IS NULL
  THEN
    RAISE EXCEPTION
      'R5 recovery code is missing from bb_disposal_recovery_code.';
  END IF;



/* =====================================================================
   7. OAKRIDGE DEVELOPMENTS
   Reuse the one you manually created if it exists.
===================================================================== */

  SELECT
    c.id
  INTO
    v_client_oakridge
  FROM bb_counterparty c
  WHERE
    c."organisationId" =
      v_org_id
    AND lower(c.name) =
      lower('Oakridge Developments Ltd')
  ORDER BY
    c."isActive" DESC,
    c."createdAt" DESC
  LIMIT 1;


  IF v_client_oakridge IS NULL
  THEN

    v_client_oakridge :=
      'demo-cp-' ||
      md5(
        v_org_id ||
        '|oakridge'
      );


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
      'accounts@oakridge.example',
      '07700 900101',
      '10 Demo Square, Birmingham',
      'B1 1DE',
      30,
      '[Demo Fill Seed] Construction client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id)
    DO NOTHING;

  END IF;


  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (
      v_org_id,
      v_client_oakridge,
      'client',
      now()
    ),
    (
      v_org_id,
      v_client_oakridge,
      'producer',
      now()
    )
  ON CONFLICT (
    "counterpartyId",
    role
  )
  DO NOTHING;



/* ---------------------------------------------------------------------
   OAKRIDGE SITE
--------------------------------------------------------------------- */

  SELECT
    s.id
  INTO
    v_site_oakridge
  FROM bb_counterparty_site s
  WHERE
    s."organisationId" =
      v_org_id
    AND s."counterpartyId" =
      v_client_oakridge
    AND lower(s.name) =
      lower(
        'Riverside Quarter Redevelopment'
      )
  ORDER BY
    s."isActive" DESC,
    s."createdAt" DESC
  LIMIT 1;


  IF v_site_oakridge IS NULL
  THEN

    v_site_oakridge :=
      'demo-cps-' ||
      md5(
        v_org_id ||
        '|oakridge-riverside'
      );


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
      'amelia.hart@oakridge.example',
      '07700 900102',
      true,
      true,
      '[Demo Fill Seed] Primary Oakridge waste origin.',
      now(),
      now()
    );

  ELSE

    UPDATE bb_counterparty_site
    SET
      "isActive" = true,
      "isDefault" = true,
      "updatedAt" = now()
    WHERE id =
      v_site_oakridge;

  END IF;



/* =====================================================================
   8. MERIDIAN CONSTRUCTION
===================================================================== */

  SELECT
    c.id
  INTO
    v_client_meridian
  FROM bb_counterparty c
  WHERE
    c."organisationId" =
      v_org_id
    AND (
      lower(c.name) =
        lower(
          'Meridian Construction Group'
        )
      OR c."accountReference" =
        'DEMO-MER-01'
    )
  LIMIT 1;


  IF v_client_meridian IS NULL
  THEN

    v_client_meridian :=
      'demo-cp-' ||
      md5(
        v_org_id ||
        '|meridian'
      );


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
      'accounts@meridian.example',
      '07700 900111',
      '24 Colmore Demo Row, Birmingham',
      'B3 2AA',
      30,
      '[Demo Fill Seed] Construction client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id)
    DO NOTHING;

  END IF;


  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (
      v_org_id,
      v_client_meridian,
      'client',
      now()
    ),
    (
      v_org_id,
      v_client_meridian,
      'producer',
      now()
    )
  ON CONFLICT (
    "counterpartyId",
    role
  )
  DO NOTHING;



/* ---------------------------------------------------------------------
   MERIDIAN SITE
--------------------------------------------------------------------- */

  SELECT
    s.id
  INTO
    v_site_meridian
  FROM bb_counterparty_site s
  WHERE
    s."organisationId" =
      v_org_id
    AND s."counterpartyId" =
      v_client_meridian
    AND lower(s.name) =
      lower(
        'Exchange Square Development'
      )
  LIMIT 1;


  IF v_site_meridian IS NULL
  THEN

    v_site_meridian :=
      'demo-cps-' ||
      md5(
        v_org_id ||
        '|meridian-exchange'
      );


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
      '42 Demo Exchange Street, Birmingham',
      'B4 6AA',
      'Marcus Bell',
      'marcus.bell@meridian.example',
      '07700 900112',
      true,
      true,
      '[Demo Fill Seed] Meridian construction waste origin.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   9. BROADGATE CIVILS
===================================================================== */

  SELECT
    c.id
  INTO
    v_client_broadgate
  FROM bb_counterparty c
  WHERE
    c."organisationId" =
      v_org_id
    AND (
      lower(c.name) =
        lower(
          'Broadgate Civils Ltd'
        )
      OR c."accountReference" =
        'DEMO-BRD-01'
    )
  LIMIT 1;


  IF v_client_broadgate IS NULL
  THEN

    v_client_broadgate :=
      'demo-cp-' ||
      md5(
        v_org_id ||
        '|broadgate'
      );


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
      'accounts@broadgate.example',
      '07700 900121',
      '80 Demo Infrastructure Way, Birmingham',
      'B6 5AA',
      45,
      '[Demo Fill Seed] Civil engineering client.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id)
    DO NOTHING;

  END IF;


  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES
    (
      v_org_id,
      v_client_broadgate,
      'client',
      now()
    ),
    (
      v_org_id,
      v_client_broadgate,
      'producer',
      now()
    )
  ON CONFLICT (
    "counterpartyId",
    role
  )
  DO NOTHING;



/* ---------------------------------------------------------------------
   BROADGATE SITE
--------------------------------------------------------------------- */

  SELECT
    s.id
  INTO
    v_site_broadgate
  FROM bb_counterparty_site s
  WHERE
    s."organisationId" =
      v_org_id
    AND s."counterpartyId" =
      v_client_broadgate
    AND lower(s.name) =
      lower(
        'Northfield Infrastructure Works'
      )
  LIMIT 1;


  IF v_site_broadgate IS NULL
  THEN

    v_site_broadgate :=
      'demo-cps-' ||
      md5(
        v_org_id ||
        '|broadgate-northfield'
      );


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
      '17 Demo Parkway, Birmingham',
      'B24 8AA',
      'Hannah Price',
      'hannah.price@broadgate.example',
      '07700 900122',
      true,
      true,
      '[Demo Fill Seed] Broadgate civils waste origin.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   10. NORTHLINE HAULAGE
===================================================================== */

  SELECT
    c.id
  INTO
    v_haulier_northline
  FROM bb_counterparty c
  WHERE
    c."organisationId" =
      v_org_id
    AND (
      lower(c.name) =
        lower(
          'Northline Haulage Ltd'
        )
      OR c."accountReference" =
        'DEMO-NTH-01'
    )
  LIMIT 1;


  IF v_haulier_northline IS NULL
  THEN

    v_haulier_northline :=
      'demo-cp-' ||
      md5(
        v_org_id ||
        '|northline'
      );


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
      'DEMO-NTH-01',
      'transport@northline.example',
      '07700 900201',
      '20 Demo Freight Park, Birmingham',
      'B6 7DE',
      'CBDU-DEMO-260819',
      30,
      '[Demo Fill Seed] External transport provider.',
      true,
      now(),
      now()
    )
    ON CONFLICT (id)
    DO NOTHING;

  END IF;


  /*
    Ensure DWT has a carrier-registration style value even
    if Northline already existed without one.
  */

  UPDATE bb_counterparty
  SET
    "carrierRegistrationNumber" =
      COALESCE(
        "carrierRegistrationNumber",
        'CBDU-DEMO-260819'
      ),
    "isActive" = true,
    "updatedAt" = now()
  WHERE id =
    v_haulier_northline;


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
  ON CONFLICT (
    "counterpartyId",
    role
  )
  DO NOTHING;



/* =====================================================================
   11. NORTHLINE VEHICLES
===================================================================== */

  SELECT id
  INTO v_vehicle_northline_hgv
  FROM bb_vehicle
  WHERE
    "organisationId" =
      v_org_id
    AND upper(
      replace(
        "registrationNumber",
        ' ',
        ''
      )
    ) = 'NL26HGV'
  LIMIT 1;


  IF v_vehicle_northline_hgv IS NULL
  THEN

    v_vehicle_northline_hgv :=
      'demo-vehicle-' ||
      md5(
        v_org_id ||
        '|nl26hgv'
      );


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
    VALUES (
      v_vehicle_northline_hgv,
      v_org_id,
      v_haulier_northline,
      'NL26 HGV',
      '8-wheel tipper',
      12600,
      true,
      '[Demo Fill Seed] Northline tipper.',
      now(),
      now()
    );

  END IF;



  SELECT id
  INTO v_vehicle_northline_skip
  FROM bb_vehicle
  WHERE
    "organisationId" =
      v_org_id
    AND upper(
      replace(
        "registrationNumber",
        ' ',
        ''
      )
    ) = 'NL26SKP'
  LIMIT 1;


  IF v_vehicle_northline_skip IS NULL
  THEN

    v_vehicle_northline_skip :=
      'demo-vehicle-' ||
      md5(
        v_org_id ||
        '|nl26skp'
      );


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
    VALUES (
      v_vehicle_northline_skip,
      v_org_id,
      v_haulier_northline,
      'NL26 SKP',
      'Skip loader',
      11900,
      true,
      '[Demo Fill Seed] Northline skip loader.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   12. NORTHLINE DRIVERS
===================================================================== */

  SELECT id
  INTO v_driver_mason
  FROM bb_driver
  WHERE
    "organisationId" =
      v_org_id
    AND lower(name) =
      lower('Mason Reed')
    AND "haulierCounterpartyId" =
      v_haulier_northline
  LIMIT 1;


  IF v_driver_mason IS NULL
  THEN

    v_driver_mason :=
      'demo-driver-' ||
      md5(
        v_org_id ||
        '|mason-reed'
      );


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
    VALUES (
      v_driver_mason,
      v_org_id,
      v_haulier_northline,
      'Mason Reed',
      '07700 900202',
      'mason.reed@northline.example',
      v_vehicle_northline_hgv,
      true,
      '[Demo Fill Seed] Northline driver.',
      now(),
      now()
    );

  END IF;



  SELECT id
  INTO v_driver_leah
  FROM bb_driver
  WHERE
    "organisationId" =
      v_org_id
    AND lower(name) =
      lower('Leah Foster')
    AND "haulierCounterpartyId" =
      v_haulier_northline
  LIMIT 1;


  IF v_driver_leah IS NULL
  THEN

    v_driver_leah :=
      'demo-driver-' ||
      md5(
        v_org_id ||
        '|leah-foster'
      );


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
    VALUES (
      v_driver_leah,
      v_org_id,
      v_haulier_northline,
      'Leah Foster',
      '07700 900203',
      'leah.foster@northline.example',
      v_vehicle_northline_skip,
      true,
      '[Demo Fill Seed] Northline driver.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   13. OWN VEHICLE + DRIVER
===================================================================== */

  SELECT id
  INTO v_vehicle_own
  FROM bb_vehicle
  WHERE
    "organisationId" =
      v_org_id
    AND upper(
      replace(
        "registrationNumber",
        ' ',
        ''
      )
    ) = 'WX26OWN'
  LIMIT 1;


  IF v_vehicle_own IS NULL
  THEN

    v_vehicle_own :=
      'demo-vehicle-' ||
      md5(
        v_org_id ||
        '|wx26own'
      );


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
    VALUES (
      v_vehicle_own,
      v_org_id,
      NULL,
      'WX26 OWN',
      '8-wheel tipper',
      12250,
      true,
      '[Demo Fill Seed] Organisation own vehicle.',
      now(),
      now()
    );

  END IF;



  SELECT id
  INTO v_driver_priya
  FROM bb_driver
  WHERE
    "organisationId" =
      v_org_id
    AND lower(name) =
      lower('Priya Shah')
    AND "haulierCounterpartyId"
      IS NULL
  LIMIT 1;


  IF v_driver_priya IS NULL
  THEN

    v_driver_priya :=
      'demo-driver-' ||
      md5(
        v_org_id ||
        '|priya-shah'
      );


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
    VALUES (
      v_driver_priya,
      v_org_id,
      NULL,
      'Priya Shah',
      '07700 900204',
      'priya.shah@waste-x-demo.example',
      v_vehicle_own,
      true,
      '[Demo Fill Seed] Organisation own driver.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   14. GREENLOOP THIRD-PARTY FACILITY
===================================================================== */

  SELECT id
  INTO v_greenloop_operator
  FROM bb_counterparty
  WHERE
    "organisationId" =
      v_org_id
    AND (
      lower(name) =
        lower(
          'GreenLoop Recycling Ltd'
        )
      OR "accountReference" =
        'DEMO-GRN-01'
    )
  LIMIT 1;


  IF v_greenloop_operator IS NULL
  THEN

    v_greenloop_operator :=
      'demo-cp-' ||
      md5(
        v_org_id ||
        '|greenloop'
      );


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
      v_greenloop_operator,
      v_org_id,
      'GreenLoop Recycling Ltd',
      'DEMO-GRN-01',
      'facility@greenloop.example',
      '07700 900301',
      '50 Demo Recovery Road, Birmingham',
      'B7 4DE',
      30,
      '[Demo Fill Seed] Third-party waste facility operator.',
      true,
      now(),
      now()
    );

  END IF;


  INSERT INTO bb_counterparty_role (
    "organisationId",
    "counterpartyId",
    role,
    "createdAt"
  )
  VALUES

  (
    v_org_id,
    v_greenloop_operator,
    'receiver',
    now()
  ),

  (
    v_org_id,
    v_greenloop_operator,
    'third_party_tip',
    now()
  )

  ON CONFLICT (
    "counterpartyId",
    role
  )
  DO NOTHING;



/* ---------------------------------------------------------------------
   GREENLOOP SITE
--------------------------------------------------------------------- */

  SELECT id
  INTO v_greenloop_site
  FROM bb_counterparty_site
  WHERE
    "organisationId" =
      v_org_id
    AND "counterpartyId" =
      v_greenloop_operator
    AND lower(name) =
      lower(
        'GreenLoop Recovery Centre - Birmingham'
      )
  LIMIT 1;


  IF v_greenloop_site IS NULL
  THEN

    v_greenloop_site :=
      'demo-cps-' ||
      md5(
        v_org_id ||
        '|greenloop-birmingham'
      );


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
    VALUES (
      v_greenloop_site,
      v_org_id,
      v_greenloop_operator,
      'GreenLoop Recovery Centre - Birmingham',
      'third_party_tip',
      '50 Demo Recovery Road, Birmingham',
      'B7 4DE',
      'Elena Brooks',
      'facility@greenloop.example',
      '07700 900301',
      'EPR/DEMO/GLR/2608',
      true,
      true,
      '[Demo Fill Seed] External recycling destination.',
      now(),
      now()
    );

  END IF;



/* ---------------------------------------------------------------------
   GREENLOOP AUTHORISATION
--------------------------------------------------------------------- */

  SELECT id
  INTO v_greenloop_auth
  FROM bb_counterparty_site_authorisation
  WHERE
    "organisationId" =
      v_org_id
    AND "counterpartySiteId" =
      v_greenloop_site
    AND "authorisationNumber" =
      'EPR/DEMO/GLR/2608'
  LIMIT 1;


  IF v_greenloop_auth IS NULL
  THEN

    v_greenloop_auth :=
      'demo-auth-' ||
      md5(
        v_org_id ||
        '|greenloop-auth'
      );


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
    VALUES (
      v_greenloop_auth,
      v_org_id,
      v_greenloop_site,
      'EPR/DEMO/GLR/2608',
      'EA',
      'permit',
      'active',
      true,
      TIMESTAMP '2025-01-01 00:00:00',
      TIMESTAMP '2029-12-31 23:59:59',
      'Demo permit record - presentation only',
      TIMESTAMP '2026-08-19 09:00:00',
      '[Demo Fill Seed] Not a real regulatory permit.',
      v_user_id,
      now(),
      now()
    );

  END IF;



/* ---------------------------------------------------------------------
   GREENLOOP EWC AUTHORISATIONS
--------------------------------------------------------------------- */

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
    v_org_id,
    v_greenloop_auth,
    v_ewc_concrete,
    true,
    v_user_id,
    now()
  ),

  (
    v_org_id,
    v_greenloop_auth,
    v_ewc_mixed,
    true,
    v_user_id,
    now()
  ),

  (
    v_org_id,
    v_greenloop_auth,
    v_ewc_soil,
    true,
    v_user_id,
    now()
  )

  ON CONFLICT (
    "authorisationId",
    "ewcCodeId"
  )
  DO UPDATE SET
    "isActive" = true;



/* =====================================================================
   15. MATERIAL PROFILES
===================================================================== */

/* ---------------------------------------------------------------------
   CONCRETE
--------------------------------------------------------------------- */

  SELECT
    mp.id
  INTO
    v_material_concrete
  FROM bb_material_profile mp
  WHERE
    mp."organisationId" =
      v_org_id
    AND mp."ewcCodeId" =
      v_ewc_concrete
    AND mp."isActive" = true
  ORDER BY
    (
      mp."siteId" =
        v_receiving_site_id
    ) DESC,
    mp."isFavourite" DESC,
    mp."createdAt" ASC
  LIMIT 1;


  IF v_material_concrete IS NULL
  THEN

    v_material_concrete :=
      'demo-material-' ||
      md5(
        v_org_id ||
        '|concrete'
      );


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
    VALUES (
      v_material_concrete,
      v_org_id,
      v_receiving_site_id,
      'Demo Clean Concrete',
      v_ewc_concrete,
      'Clean non-hazardous concrete arising from demolition and site preparation works.',
      'Solid',
      1,
      'SKI',
      false,
      'NOT_PROVIDED',
      NULL,
      false,
      'NOT_PROVIDED',
      NULL,
      NULL,
      v_r5,
      'Tonnes',
      true,
      true,
      '[Demo Fill Seed] Reusable concrete profile.',
      v_user_id,
      now(),
      now()
    );

  END IF;



/* ---------------------------------------------------------------------
   MIXED C&D
--------------------------------------------------------------------- */

  SELECT
    mp.id
  INTO
    v_material_mixed
  FROM bb_material_profile mp
  WHERE
    mp."organisationId" =
      v_org_id
    AND mp."ewcCodeId" =
      v_ewc_mixed
    AND mp."isActive" = true
  ORDER BY
    (
      mp."siteId" =
        v_receiving_site_id
    ) DESC,
    mp."isFavourite" DESC,
    mp."createdAt" ASC
  LIMIT 1;


  IF v_material_mixed IS NULL
  THEN

    v_material_mixed :=
      'demo-material-' ||
      md5(
        v_org_id ||
        '|mixed-cd'
      );


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
    VALUES (
      v_material_mixed,
      v_org_id,
      v_receiving_site_id,
      'Demo Mixed Construction Waste',
      v_ewc_mixed,
      'Mixed non-hazardous construction and demolition waste.',
      'Mixed',
      1,
      'SKI',
      false,
      'NOT_PROVIDED',
      NULL,
      false,
      'NOT_PROVIDED',
      NULL,
      NULL,
      v_r5,
      'Tonnes',
      true,
      true,
      '[Demo Fill Seed] Reusable mixed C&D profile.',
      v_user_id,
      now(),
      now()
    );

  END IF;



/* ---------------------------------------------------------------------
   SOIL
--------------------------------------------------------------------- */

  SELECT
    mp.id
  INTO
    v_material_soil
  FROM bb_material_profile mp
  WHERE
    mp."organisationId" =
      v_org_id
    AND mp."ewcCodeId" =
      v_ewc_soil
    AND mp."isActive" = true
  ORDER BY
    (
      mp."siteId" =
        v_receiving_site_id
    ) DESC,
    mp."isFavourite" DESC,
    mp."createdAt" ASC
  LIMIT 1;


  IF v_material_soil IS NULL
  THEN

    v_material_soil :=
      'demo-material-' ||
      md5(
        v_org_id ||
        '|soil'
      );


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
    VALUES (
      v_material_soil,
      v_org_id,
      v_receiving_site_id,
      'Demo Non-hazardous Soil & Stones',
      v_ewc_soil,
      'Soil and stones assessed as not containing hazardous substances.',
      'Solid',
      1,
      'SKI',
      false,
      'NOT_PROVIDED',
      NULL,
      false,
      'NOT_PROVIDED',
      NULL,
      NULL,
      v_r5,
      'Tonnes',
      true,
      true,
      '[Demo Fill Seed] Reusable soil profile.',
      v_user_id,
      now(),
      now()
    );

  END IF;



/* =====================================================================
   16. REMOVE ONLY PREVIOUS RATES GENERATED BY THIS SEED
===================================================================== */

  DELETE FROM bb_rate
  WHERE
    "organisationId" =
      v_org_id
    AND notes LIKE
      '[Demo Fill Seed]%';



/* =====================================================================
   17. CUSTOMER RATE — OAKRIDGE CONCRETE

   Reuse your manually created rate if one already exists.
===================================================================== */

  SELECT
    r.id,
    r.amount
  INTO
    v_rate_oak_concrete,
    v_amount_oak_concrete
  FROM bb_rate r
  WHERE
    r."organisationId" =
      v_org_id
    AND r."rateType" =
      'customer_charge'
    AND r."counterpartyId" =
      v_client_oakridge
    AND r."materialProfileId" =
      v_material_concrete
    AND r."isActive" = true
    AND (
      r."effectiveFrom" IS NULL
      OR r."effectiveFrom" <=
        TIMESTAMP '2026-08-21 23:59:59'
    )
    AND (
      r."effectiveTo" IS NULL
      OR r."effectiveTo" >=
        TIMESTAMP '2026-08-19 00:00:00'
    )
  ORDER BY
    (
      r."counterpartySiteId" =
        v_site_oakridge
    ) DESC,
    (
      r."ownSiteId" =
        v_receiving_site_id
    ) DESC,
    r."effectiveFrom" DESC NULLS LAST
  LIMIT 1;


  IF v_rate_oak_concrete IS NULL
  THEN

    v_rate_oak_concrete :=
      'demo-rate-' ||
      md5(
        v_org_id ||
        '|oak-concrete'
      );

    v_amount_oak_concrete :=
      48.00;


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
    VALUES (
      v_rate_oak_concrete,
      v_org_id,
      'customer_charge',
      'tonne',
      v_amount_oak_concrete,
      'GBP',
      v_client_oakridge,
      v_site_oakridge,
      v_receiving_site_id,
      v_material_concrete,
      TIMESTAMP '2026-08-19 00:00:00',
      NULL,
      true,
      '[Demo Fill Seed] Oakridge clean concrete charge.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   18. OAKRIDGE MIXED C&D
===================================================================== */

  v_rate_oak_mixed :=
    'demo-rate-' ||
    md5(
      v_org_id ||
      '|oak-mixed'
    );


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
  VALUES (
    v_rate_oak_mixed,
    v_org_id,
    'customer_charge',
    'tonne',
    v_amount_oak_mixed,
    'GBP',
    v_client_oakridge,
    v_site_oakridge,
    v_receiving_site_id,
    v_material_mixed,
    TIMESTAMP '2026-07-01 00:00:00',
    NULL,
    true,
    '[Demo Fill Seed] Oakridge mixed C&D charge.',
    now(),
    now()
  );



/* =====================================================================
   19. MERIDIAN RATES
===================================================================== */

  v_rate_meridian_concrete :=
    'demo-rate-' ||
    md5(
      v_org_id ||
      '|meridian-concrete'
    );


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
    "isActive",
    notes,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    v_rate_meridian_concrete,
    v_org_id,
    'customer_charge',
    'tonne',
    v_amount_meridian_concrete,
    'GBP',
    v_client_meridian,
    v_site_meridian,
    v_receiving_site_id,
    v_material_concrete,
    TIMESTAMP '2026-07-01 00:00:00',
    true,
    '[Demo Fill Seed] Meridian concrete charge.',
    now(),
    now()
  );


  v_rate_meridian_mixed :=
    'demo-rate-' ||
    md5(
      v_org_id ||
      '|meridian-mixed'
    );


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
    "isActive",
    notes,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    v_rate_meridian_mixed,
    v_org_id,
    'customer_charge',
    'tonne',
    v_amount_meridian_mixed,
    'GBP',
    v_client_meridian,
    v_site_meridian,
    v_receiving_site_id,
    v_material_mixed,
    TIMESTAMP '2026-07-01 00:00:00',
    true,
    '[Demo Fill Seed] Meridian mixed C&D charge.',
    now(),
    now()
  );



/* =====================================================================
   20. BROADGATE SOIL RATE
===================================================================== */

  v_rate_broadgate_soil :=
    'demo-rate-' ||
    md5(
      v_org_id ||
      '|broadgate-soil'
    );


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
    "isActive",
    notes,
    "createdAt",
    "updatedAt"
  )
  VALUES (
    v_rate_broadgate_soil,
    v_org_id,
    'customer_charge',
    'tonne',
    v_amount_broadgate_soil,
    'GBP',
    v_client_broadgate,
    v_site_broadgate,
    v_receiving_site_id,
    v_material_soil,
    TIMESTAMP '2026-07-01 00:00:00',
    true,
    '[Demo Fill Seed] Broadgate soil charge.',
    now(),
    now()
  );



/* =====================================================================
   21. HAULAGE RATE
===================================================================== */

  SELECT
    r.id,
    r.amount
  INTO
    v_rate_haulage,
    v_amount_haulage
  FROM bb_rate r
  WHERE
    r."organisationId" =
      v_org_id
    AND r."rateType" =
      'haulage_cost'
    AND r."counterpartyId" =
      v_haulier_northline
    AND r."isActive" = true
  ORDER BY
    r."effectiveFrom" DESC NULLS LAST
  LIMIT 1;


  IF v_rate_haulage IS NULL
  THEN

    v_rate_haulage :=
      'demo-rate-' ||
      md5(
        v_org_id ||
        '|northline-haulage'
      );

    v_amount_haulage :=
      185.00;


    INSERT INTO bb_rate (
      id,
      "organisationId",
      "rateType",
      unit,
      amount,
      currency,
      "counterpartyId",
      "ownSiteId",
      "effectiveFrom",
      "isActive",
      notes,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_rate_haulage,
      v_org_id,
      'haulage_cost',
      'load',
      v_amount_haulage,
      'GBP',
      v_haulier_northline,
      v_receiving_site_id,
      TIMESTAMP '2026-07-01 00:00:00',
      true,
      '[Demo Fill Seed] Northline per-load haulage cost.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   22. GREENLOOP TIPPING RATE
===================================================================== */

  SELECT
    r.id,
    r.amount
  INTO
    v_rate_tipping,
    v_amount_tipping
  FROM bb_rate r
  WHERE
    r."organisationId" =
      v_org_id
    AND r."rateType" =
      'tipping_cost'
    AND r."counterpartySiteId" =
      v_greenloop_site
    AND r."isActive" = true
  ORDER BY
    r."effectiveFrom" DESC NULLS LAST
  LIMIT 1;


  IF v_rate_tipping IS NULL
  THEN

    v_rate_tipping :=
      'demo-rate-' ||
      md5(
        v_org_id ||
        '|greenloop-tip'
      );

    v_amount_tipping :=
      32.00;


    INSERT INTO bb_rate (
      id,
      "organisationId",
      "rateType",
      unit,
      amount,
      currency,
      "counterpartyId",
      "counterpartySiteId",
      "materialProfileId",
      "effectiveFrom",
      "isActive",
      notes,
      "createdAt",
      "updatedAt"
    )
    VALUES (
      v_rate_tipping,
      v_org_id,
      'tipping_cost',
      'tonne',
      v_amount_tipping,
      'GBP',
      v_greenloop_operator,
      v_greenloop_site,
      NULL,
      TIMESTAMP '2026-07-01 00:00:00',
      true,
      '[Demo Fill Seed] GreenLoop tipping cost.',
      now(),
      now()
    );

  END IF;



/* =====================================================================
   23. CLEAN UP ONLY PREVIOUS JOBS CREATED BY THIS DEMO FILL SEED
===================================================================== */

  /*
    Submission rows use SET NULL on Job Load delete, so remove any
    submission history generated from an earlier run first.
  */

  DELETE FROM bb_waste_tracking_submission
  WHERE
    "organisationId" =
      v_org_id
    AND "jobLoadId" IN (
      SELECT jl.id
      FROM bb_job_load jl
      JOIN bb_job j
        ON j.id = jl."jobId"
      WHERE
        j."organisationId" =
          v_org_id
        AND (
          j."jobNumber" LIKE
            'DEMO-Q3-%'
          OR j."jobNumber" LIKE
            'DEMO-DWT-%'
          OR j."jobNumber" LIKE
            'DEMO-THU-%'
          OR j."jobNumber" LIKE
            'DEMO-FRI-%'
        )
    );


  /*
    Job Loads + Waste Receipts cascade from the Job.
  */

  DELETE FROM bb_job
  WHERE
    "organisationId" =
      v_org_id
    AND (
      "jobNumber" LIKE
        'DEMO-Q3-%'
      OR "jobNumber" LIKE
        'DEMO-DWT-%'
      OR "jobNumber" LIKE
        'DEMO-THU-%'
      OR "jobNumber" LIKE
        'DEMO-FRI-%'
    );



/* =====================================================================
   24. TEMPORARY JOB-SEED MODEL
===================================================================== */

  CREATE TEMP TABLE demo_fill_job_seed (

    job_number text PRIMARY KEY,

    job_date timestamp,

    direction text,

    job_status text,

    client_id text,
    client_site_id text,

    third_party_site_id text,

    haulier_id text,
    driver_id text,
    vehicle_id text,

    material_id text,

    planned_loads integer,

    purchase_order text,
    customer_reference text,

    rate_id text,

    customer_charge numeric,
    haulage_cost numeric,
    tipping_cost numeric,

    load_status text,

    movement_at timestamp,
    received_at timestamp,
    completed_at timestamp,

    gross_weight numeric,
    tare_weight numeric,
    net_weight numeric,

    ticket_number text,

    distance_km numeric,
    distance_source text

  ) ON COMMIT DROP;



/* =====================================================================
   25. Q3 HISTORICAL — ACCEPTED INCOMING LOADS

   These feed Quarterly Returns.

   They are ACCEPTED rather than completed deliberately, so they
   do NOT clutter the DWT Batch Review queue.
===================================================================== */

  INSERT INTO demo_fill_job_seed
  VALUES

  (
    'DEMO-Q3-IN-260702-01',
    TIMESTAMP '2026-07-02 12:00:00',
    'incoming',
    'in_progress',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-OAK-Q3-0702',
    'RIV-Q3-0702',
    v_rate_oak_concrete,
    v_amount_oak_concrete,
    v_amount_haulage,
    NULL,
    'accepted',
    TIMESTAMP '2026-07-02 08:15:00',
    TIMESTAMP '2026-07-02 08:15:00',
    NULL,
    31.200,
    12.600,
    18.600,
    'Q3-IN-0001',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260707-01',
    TIMESTAMP '2026-07-07 12:00:00',
    'incoming',
    'in_progress',
    v_client_meridian,
    v_site_meridian,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_mixed,
    1,
    'PO-MER-Q3-0707',
    'EXC-Q3-0707',
    v_rate_meridian_mixed,
    v_amount_meridian_mixed,
    NULL,
    NULL,
    'accepted',
    TIMESTAMP '2026-07-07 09:10:00',
    TIMESTAMP '2026-07-07 09:10:00',
    NULL,
    25.200,
    12.250,
    12.950,
    'Q3-IN-0002',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260711-01',
    TIMESTAMP '2026-07-11 12:00:00',
    'incoming',
    'in_progress',
    v_client_broadgate,
    v_site_broadgate,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_soil,
    1,
    'PO-BRD-Q3-0711',
    'NTH-Q3-0711',
    v_rate_broadgate_soil,
    v_amount_broadgate_soil,
    v_amount_haulage,
    NULL,
    'accepted',
    TIMESTAMP '2026-07-11 10:20:00',
    TIMESTAMP '2026-07-11 10:20:00',
    NULL,
    33.300,
    11.900,
    21.400,
    'Q3-IN-0003',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260718-01',
    TIMESTAMP '2026-07-18 12:00:00',
    'incoming',
    'in_progress',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_mixed,
    1,
    'PO-OAK-Q3-0718',
    'RIV-Q3-0718',
    v_rate_oak_mixed,
    v_amount_oak_mixed,
    NULL,
    NULL,
    'accepted',
    TIMESTAMP '2026-07-18 08:40:00',
    TIMESTAMP '2026-07-18 08:40:00',
    NULL,
    26.450,
    12.250,
    14.200,
    'Q3-IN-0004',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260724-01',
    TIMESTAMP '2026-07-24 12:00:00',
    'incoming',
    'in_progress',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-MER-Q3-0724',
    'EXC-Q3-0724',
    v_rate_meridian_concrete,
    v_amount_meridian_concrete,
    v_amount_haulage,
    NULL,
    'accepted',
    TIMESTAMP '2026-07-24 11:10:00',
    TIMESTAMP '2026-07-24 11:10:00',
    NULL,
    30.450,
    12.600,
    17.850,
    'Q3-IN-0005',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260801-01',
    TIMESTAMP '2026-08-01 12:00:00',
    'incoming',
    'in_progress',
    v_client_broadgate,
    v_site_broadgate,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_soil,
    1,
    'PO-BRD-Q3-0801',
    'NTH-Q3-0801',
    v_rate_broadgate_soil,
    v_amount_broadgate_soil,
    NULL,
    NULL,
    'accepted',
    TIMESTAMP '2026-08-01 09:30:00',
    TIMESTAMP '2026-08-01 09:30:00',
    NULL,
    31.950,
    12.250,
    19.700,
    'Q3-IN-0006',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260808-01',
    TIMESTAMP '2026-08-08 12:00:00',
    'incoming',
    'in_progress',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-OAK-Q3-0808',
    'RIV-Q3-0808',
    v_rate_oak_concrete,
    v_amount_oak_concrete,
    v_amount_haulage,
    NULL,
    'accepted',
    TIMESTAMP '2026-08-08 10:05:00',
    TIMESTAMP '2026-08-08 10:05:00',
    NULL,
    32.700,
    12.600,
    20.100,
    'Q3-IN-0007',
    NULL,
    NULL
  ),

  (
    'DEMO-Q3-IN-260814-01',
    TIMESTAMP '2026-08-14 12:00:00',
    'incoming',
    'in_progress',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_mixed,
    1,
    'PO-MER-Q3-0814',
    'EXC-Q3-0814',
    v_rate_meridian_mixed,
    v_amount_meridian_mixed,
    v_amount_haulage,
    NULL,
    'accepted',
    TIMESTAMP '2026-08-14 11:20:00',
    TIMESTAMP '2026-08-14 11:20:00',
    NULL,
    25.650,
    11.900,
    13.750,
    'Q3-IN-0008',
    NULL,
    NULL
  );



/* =====================================================================
   26. Q3 HISTORICAL — COMPLETED OUTGOING LOADS

   These feed:
   - Quarterly Returns "removed"
   - Transport Emissions

   Carbon:
     tonnes × km × 0.07
===================================================================== */

  INSERT INTO demo_fill_job_seed
  VALUES

  (
    'DEMO-Q3-OUT-260705-01',
    TIMESTAMP '2026-07-05 12:00:00',
    'outgoing',
    'completed',
    v_client_oakridge,
    v_site_oakridge,
    v_greenloop_site,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_mixed,
    1,
    'PO-OAK-OUT-0705',
    'OUT-0705',
    NULL,
    NULL,
    v_amount_haulage,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-07-05 14:20:00',
    NULL,
    TIMESTAMP '2026-07-05 15:15:00',
    24.100,
    12.600,
    11.500,
    'Q3-OUT-0001',
    68.000,
    'measured'
  ),

  (
    'DEMO-Q3-OUT-260713-01',
    TIMESTAMP '2026-07-13 12:00:00',
    'outgoing',
    'completed',
    v_client_broadgate,
    v_site_broadgate,
    v_greenloop_site,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_soil,
    1,
    'PO-BRD-OUT-0713',
    'OUT-0713',
    NULL,
    NULL,
    NULL,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-07-13 13:40:00',
    NULL,
    TIMESTAMP '2026-07-13 14:30:00',
    30.450,
    12.250,
    18.200,
    'Q3-OUT-0002',
    52.000,
    'estimated'
  ),

  (
    'DEMO-Q3-OUT-260721-01',
    TIMESTAMP '2026-07-21 12:00:00',
    'outgoing',
    'completed',
    v_client_meridian,
    v_site_meridian,
    v_greenloop_site,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_concrete,
    1,
    'PO-MER-OUT-0721',
    'OUT-0721',
    NULL,
    NULL,
    v_amount_haulage,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-07-21 12:50:00',
    NULL,
    TIMESTAMP '2026-07-21 13:35:00',
    28.300,
    11.900,
    16.400,
    'Q3-OUT-0003',
    41.000,
    'customer_provided'
  ),

  (
    'DEMO-Q3-OUT-260729-01',
    TIMESTAMP '2026-07-29 12:00:00',
    'outgoing',
    'completed',
    v_client_oakridge,
    v_site_oakridge,
    v_greenloop_site,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_mixed,
    1,
    'PO-OAK-OUT-0729',
    'OUT-0729',
    NULL,
    NULL,
    v_amount_haulage,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-07-29 15:05:00',
    NULL,
    TIMESTAMP '2026-07-29 16:00:00',
    25.900,
    12.600,
    13.300,
    'Q3-OUT-0004',
    74.000,
    'measured'
  ),

  (
    'DEMO-Q3-OUT-260806-01',
    TIMESTAMP '2026-08-06 12:00:00',
    'outgoing',
    'completed',
    v_client_broadgate,
    v_site_broadgate,
    v_greenloop_site,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_soil,
    1,
    'PO-BRD-OUT-0806',
    'OUT-0806',
    NULL,
    NULL,
    NULL,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-08-06 14:10:00',
    NULL,
    TIMESTAMP '2026-08-06 15:00:00',
    32.350,
    12.250,
    20.100,
    'Q3-OUT-0005',
    56.000,
    'estimated'
  ),

  (
    'DEMO-Q3-OUT-260812-01',
    TIMESTAMP '2026-08-12 12:00:00',
    'outgoing',
    'completed',
    v_client_meridian,
    v_site_meridian,
    v_greenloop_site,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-MER-OUT-0812',
    'OUT-0812',
    NULL,
    NULL,
    v_amount_haulage,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-08-12 13:25:00',
    NULL,
    TIMESTAMP '2026-08-12 14:15:00',
    28.400,
    12.600,
    15.800,
    'Q3-OUT-0006',
    44.000,
    'customer_provided'
  ),

  (
    'DEMO-Q3-OUT-260818-01',
    TIMESTAMP '2026-08-18 12:00:00',
    'outgoing',
    'completed',
    v_client_oakridge,
    v_site_oakridge,
    v_greenloop_site,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_mixed,
    1,
    'PO-OAK-OUT-0818',
    'OUT-0818',
    NULL,
    NULL,
    v_amount_haulage,
    v_amount_tipping,
    'completed',
    TIMESTAMP '2026-08-18 15:30:00',
    NULL,
    TIMESTAMP '2026-08-18 16:20:00',
    24.500,
    11.900,
    12.600,
    'Q3-OUT-0007',
    71.000,
    'measured'
  );



/* =====================================================================
   27. TODAY — COMPLETED INCOMING LOADS FOR DWT BATCH

   IMPORTANT:

   We intentionally DO NOT create bb_waste_receipt records for these.

   Batch DWT Review should therefore find them under:
     Missing drafts

===================================================================== */

  INSERT INTO demo_fill_job_seed
  VALUES

  (
    'DEMO-DWT-260819-01',
    TIMESTAMP '2026-08-19 12:00:00',
    'incoming',
    'completed',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-OAK-0819-01',
    'RIV-0819-A',
    v_rate_oak_concrete,
    v_amount_oak_concrete,
    v_amount_haulage,
    NULL,
    'completed',
    TIMESTAMP '2026-08-19 07:45:00',
    TIMESTAMP '2026-08-19 07:45:00',
    TIMESTAMP '2026-08-19 08:05:00',
    31.350,
    12.600,
    18.750,
    'DEMO-WB-260819-101',
    NULL,
    NULL
  ),

  (
    'DEMO-DWT-260819-02',
    TIMESTAMP '2026-08-19 12:00:00',
    'incoming',
    'completed',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_mixed,
    1,
    'PO-MER-0819-01',
    'EXC-0819-A',
    v_rate_meridian_mixed,
    v_amount_meridian_mixed,
    v_amount_haulage,
    NULL,
    'completed',
    TIMESTAMP '2026-08-19 08:20:00',
    TIMESTAMP '2026-08-19 08:20:00',
    TIMESTAMP '2026-08-19 08:40:00',
    24.300,
    11.900,
    12.400,
    'DEMO-WB-260819-102',
    NULL,
    NULL
  ),

  (
    'DEMO-DWT-260819-03',
    TIMESTAMP '2026-08-19 12:00:00',
    'incoming',
    'completed',
    v_client_broadgate,
    v_site_broadgate,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_soil,
    1,
    'PO-BRD-0819-01',
    'NTH-0819-A',
    v_rate_broadgate_soil,
    v_amount_broadgate_soil,
    v_amount_haulage,
    NULL,
    'completed',
    TIMESTAMP '2026-08-19 09:00:00',
    TIMESTAMP '2026-08-19 09:00:00',
    TIMESTAMP '2026-08-19 09:20:00',
    32.750,
    12.600,
    20.150,
    'DEMO-WB-260819-103',
    NULL,
    NULL
  ),

  (
    'DEMO-DWT-260819-04',
    TIMESTAMP '2026-08-19 12:00:00',
    'incoming',
    'completed',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_mixed,
    1,
    'PO-OAK-0819-02',
    'RIV-0819-B',
    v_rate_oak_mixed,
    v_amount_oak_mixed,
    v_amount_haulage,
    NULL,
    'completed',
    TIMESTAMP '2026-08-19 09:35:00',
    TIMESTAMP '2026-08-19 09:35:00',
    TIMESTAMP '2026-08-19 09:55:00',
    26.800,
    11.900,
    14.900,
    'DEMO-WB-260819-104',
    NULL,
    NULL
  ),

  (
    'DEMO-DWT-260819-05',
    TIMESTAMP '2026-08-19 12:00:00',
    'incoming',
    'completed',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    1,
    'PO-MER-0819-02',
    'EXC-0819-B',
    v_rate_meridian_concrete,
    v_amount_meridian_concrete,
    v_amount_haulage,
    NULL,
    'completed',
    TIMESTAMP '2026-08-19 10:10:00',
    TIMESTAMP '2026-08-19 10:10:00',
    TIMESTAMP '2026-08-19 10:30:00',
    29.900,
    12.600,
    17.300,
    'DEMO-WB-260819-105',
    NULL,
    NULL
  );



/* =====================================================================
   28. THURSDAY 20 AUGUST — DAILY WORKSHEET

   4 jobs
   6 planned loads
===================================================================== */

  INSERT INTO demo_fill_job_seed
  VALUES

  (
    'DEMO-THU-260820-01',
    TIMESTAMP '2026-08-20 12:00:00',
    'incoming',
    'booked',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    2,
    'PO-OAK-0820-01',
    'RIV-THU-A',
    v_rate_oak_concrete,
    v_amount_oak_concrete,
    v_amount_haulage,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-THU-260820-02',
    TIMESTAMP '2026-08-20 12:00:00',
    'incoming',
    'booked',
    v_client_meridian,
    v_site_meridian,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_mixed,
    1,
    'PO-MER-0820-01',
    'EXC-THU-A',
    v_rate_meridian_mixed,
    v_amount_meridian_mixed,
    NULL,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-THU-260820-03',
    TIMESTAMP '2026-08-20 12:00:00',
    'incoming',
    'booked',
    v_client_broadgate,
    v_site_broadgate,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_soil,
    2,
    'PO-BRD-0820-01',
    'NTH-THU-A',
    v_rate_broadgate_soil,
    v_amount_broadgate_soil,
    v_amount_haulage,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-THU-260820-04',
    TIMESTAMP '2026-08-20 12:00:00',
    'incoming',
    'booked',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_mixed,
    1,
    'PO-OAK-0820-02',
    'RIV-THU-B',
    v_rate_oak_mixed,
    v_amount_oak_mixed,
    NULL,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );



/* =====================================================================
   29. FRIDAY 21 AUGUST — DAILY WORKSHEET

   4 jobs
   5 planned loads
===================================================================== */

  INSERT INTO demo_fill_job_seed
  VALUES

  (
    'DEMO-FRI-260821-01',
    TIMESTAMP '2026-08-21 12:00:00',
    'incoming',
    'booked',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_concrete,
    2,
    'PO-MER-0821-01',
    'EXC-FRI-A',
    v_rate_meridian_concrete,
    v_amount_meridian_concrete,
    v_amount_haulage,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-FRI-260821-02',
    TIMESTAMP '2026-08-21 12:00:00',
    'incoming',
    'booked',
    v_client_broadgate,
    v_site_broadgate,
    NULL,
    NULL,
    v_driver_priya,
    v_vehicle_own,
    v_material_soil,
    1,
    'PO-BRD-0821-01',
    'NTH-FRI-A',
    v_rate_broadgate_soil,
    v_amount_broadgate_soil,
    NULL,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-FRI-260821-03',
    TIMESTAMP '2026-08-21 12:00:00',
    'incoming',
    'booked',
    v_client_oakridge,
    v_site_oakridge,
    NULL,
    v_haulier_northline,
    v_driver_leah,
    v_vehicle_northline_skip,
    v_material_concrete,
    1,
    'PO-OAK-0821-01',
    'RIV-FRI-A',
    v_rate_oak_concrete,
    v_amount_oak_concrete,
    v_amount_haulage,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  ),

  (
    'DEMO-FRI-260821-04',
    TIMESTAMP '2026-08-21 12:00:00',
    'incoming',
    'booked',
    v_client_meridian,
    v_site_meridian,
    NULL,
    v_haulier_northline,
    v_driver_mason,
    v_vehicle_northline_hgv,
    v_material_mixed,
    1,
    'PO-MER-0821-02',
    'EXC-FRI-B',
    v_rate_meridian_mixed,
    v_amount_meridian_mixed,
    v_amount_haulage,
    NULL,
    'planned',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  );



/* =====================================================================
   30. CREATE JOBS
===================================================================== */

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

    "rateId",

    notes,

    "createdByUserId",

    "completedAt",

    "createdAt",

    "updatedAt"

  )

  SELECT

    'demo-job-' ||
    md5(
      v_org_id ||
      '|' ||
      s.job_number
    ),

    v_org_id,

    s.job_number,

    'manual',

    s.direction,

    s.job_status,

    s.job_date,

    s.client_id,

    s.client_site_id,

    v_receiving_site_id,

    v_permit_id,

    s.third_party_site_id,

    s.haulier_id,

    s.driver_id,

    s.vehicle_id,

    s.material_id,

    s.planned_loads,

    s.purchase_order,

    s.customer_reference,

    s.rate_id,

    '[Demo Fill Seed] ' ||
    CASE
      WHEN s.direction =
        'incoming'
      THEN
        'Incoming demo job.'
      ELSE
        'Outgoing demo movement.'
    END,

    v_user_id,

    CASE
      WHEN s.job_status =
        'completed'
      THEN s.completed_at
      ELSE NULL
    END,

    CASE
      WHEN s.job_date >
        TIMESTAMP '2026-08-19 23:59:59'
      THEN
        TIMESTAMP '2026-08-19 09:00:00'
      ELSE
        s.job_date -
        interval '2 days'
    END,

    COALESCE(
      s.completed_at,
      s.received_at,
      s.movement_at,
      TIMESTAMP '2026-08-19 10:00:00'
    )

  FROM demo_fill_job_seed s;



/* =====================================================================
   31. CREATE JOB LOADS
===================================================================== */

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

    "transportDistanceKm",

    "transportDistanceSource",

    "transportCarbonMethod",

    "transportCarbonFactorKgPerTonneKm",

    "transportCarbonFactorSource",

    "transportCarbonFactorYear",

    "transportCo2eKg",

    "transportCarbonCalculatedAt",

    "ticketNumber",

    "purchaseOrder",

    "customerReference",

    "customerChargeAmount",

    "customerChargeUnit",

    "haulageCostAmount",

    "haulageCostUnit",

    "tippingCostAmount",

    "tippingCostUnit",

    currency,

    notes,

    "createdByUserId",

    "completedAt",

    "createdAt",

    "updatedAt"

  )

  SELECT

    'demo-load-' ||
    md5(
      v_org_id ||
      '|' ||
      s.job_number ||
      '|' ||
      g.load_number::text
    ),

    v_org_id,

    'demo-job-' ||
    md5(
      v_org_id ||
      '|' ||
      s.job_number
    ),

    g.load_number,

    s.load_status,

    s.direction,

    s.movement_at,

    s.received_at,

    s.client_id,

    s.client_site_id,

    v_receiving_site_id,

    v_permit_id,

    s.third_party_site_id,

    s.haulier_id,

    s.driver_id,

    s.vehicle_id,

    s.material_id,

    mp."ewcCodeId",

    regexp_replace(
      ewc.code,
      '[^0-9]',
      '',
      'g'
    ),

    mp."wasteDescription",

    mp."physicalForm",

    COALESCE(
      mp."defaultNumberOfContainers",
      1
    ),

    COALESCE(
      mp."defaultContainerType",
      'SKI'
    ),

    mp."containsPops",

    mp."popsSourceOfComponents",

    mp."popsComponents",

    mp."containsHazardous",

    mp."hazardousSourceOfComponents",

    mp."hazardousHazCodes",

    mp."hazardousComponents",

    v_r5,

    'R5',

    s.gross_weight,

    s.tare_weight,

    s.net_weight,

    'Tonnes',

    false,

    'manual',

    s.distance_km,

    s.distance_source,

    CASE
      WHEN s.distance_km IS NOT NULL
      THEN 'tonne_km'
      ELSE NULL
    END,

    CASE
      WHEN s.distance_km IS NOT NULL
      THEN 0.070000
      ELSE NULL
    END,

    CASE
      WHEN s.distance_km IS NOT NULL
      THEN
        'UK Government HGV all-diesel 100% laden analytical baseline'
      ELSE NULL
    END,

    CASE
      WHEN s.distance_km IS NOT NULL
      THEN 2024
      ELSE NULL
    END,

    CASE
      WHEN
        s.distance_km IS NOT NULL
        AND s.net_weight IS NOT NULL
      THEN
        round(
          (
            s.net_weight *
            s.distance_km *
            0.07
          )::numeric,
          3
        )
      ELSE NULL
    END,

    CASE
      WHEN s.distance_km IS NOT NULL
      THEN s.completed_at
      ELSE NULL
    END,

    s.ticket_number,

    s.purchase_order,

    s.customer_reference,

    s.customer_charge,

    CASE
      WHEN s.customer_charge IS NOT NULL
      THEN 'tonne'
      ELSE NULL
    END,

    s.haulage_cost,

    CASE
      WHEN s.haulage_cost IS NOT NULL
      THEN 'load'
      ELSE NULL
    END,

    s.tipping_cost,

    CASE
      WHEN s.tipping_cost IS NOT NULL
      THEN 'tonne'
      ELSE NULL
    END,

    'GBP',

    '[Demo Fill Seed] Factual Job Load.',

    v_user_id,

    s.completed_at,

    CASE
      WHEN s.job_date >
        TIMESTAMP '2026-08-19 23:59:59'
      THEN
        TIMESTAMP '2026-08-19 09:00:00'
      ELSE
        s.job_date -
        interval '1 day'
    END,

    COALESCE(
      s.completed_at,
      s.received_at,
      s.movement_at,
      TIMESTAMP '2026-08-19 10:00:00'
    )

  FROM demo_fill_job_seed s

  CROSS JOIN LATERAL
    generate_series(
      1,
      s.planned_loads
    ) AS g(load_number)

  JOIN bb_material_profile mp
    ON mp.id =
      s.material_id

  JOIN bb_ewc_code ewc
    ON ewc.id =
      mp."ewcCodeId";



/* =====================================================================
   32. FINISH
===================================================================== */

  RAISE NOTICE
    'Waste X demo fill seed complete for organisation %',
    v_org_id;


END
$$;


COMMIT;



/* =====================================================================
   VERIFICATION 1 — TARGET
===================================================================== */

SELECT
  u.name AS user_name,
  o."teamName" AS organisation,
  s.name AS receiving_site,
  s."siteType",
  s."isDefault",
  s.status AS site_status,
  p."permitNumber",
  p.status AS permit_status,
  p."isPrimary"
FROM bb_user u
JOIN bb_organisation o
  ON o.id =
    u."organisationId"
JOIN bb_sites s
  ON s."organisationId" =
    o.id
  AND s."isDefault" = true
JOIN bb_site_permit p
  ON p."siteId" =
    s.id
  AND p."isPrimary" = true
WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    );



/* =====================================================================
   VERIFICATION 2 — PERMITTED EWC
===================================================================== */

SELECT
  regexp_replace(
    e.code,
    '[^0-9]',
    '',
    'g'
  ) AS ewc,
  e.description,
  pe."isActive"
FROM bb_permit_ewc_code pe
JOIN bb_site_permit p
  ON p.id =
    pe."permitId"
JOIN bb_ewc_code e
  ON e.id =
    pe."ewcCodeId"
JOIN bb_user u
  ON u."organisationId" =
    pe."organisationId"
WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )
  AND p."isPrimary" = true
  AND regexp_replace(
    e.code,
    '[^0-9]',
    '',
    'g'
  ) IN (
    '170101',
    '170904',
    '170504'
  )
ORDER BY
  e.code;



/* =====================================================================
   VERIFICATION 3 — TOMORROW / FRIDAY WORKSHEET
===================================================================== */

SELECT
  j."jobDate"::date AS job_date,
  COUNT(DISTINCT j.id) AS jobs,
  COUNT(jl.id) AS loads,
  COUNT(jl.id)
    FILTER (
      WHERE jl.status =
        'planned'
    ) AS planned_loads
FROM bb_job j
JOIN bb_job_load jl
  ON jl."jobId" =
    j.id
JOIN bb_user u
  ON u."organisationId" =
    j."organisationId"
WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )
  AND (
    j."jobNumber" LIKE
      'DEMO-THU-%'
    OR j."jobNumber" LIKE
      'DEMO-FRI-%'
  )
GROUP BY
  j."jobDate"::date
ORDER BY
  job_date;



/* =====================================================================
   VERIFICATION 4 — DWT BATCH "MISSING DRAFTS"

   EXPECTED FROM THIS SEED:
     5
===================================================================== */

SELECT
  COUNT(*) AS completed_incoming_without_dwt_draft
FROM bb_job_load jl
JOIN bb_job j
  ON j.id =
    jl."jobId"
LEFT JOIN bb_waste_receipt wr
  ON wr."jobLoadId" =
    jl.id
JOIN bb_user u
  ON u."organisationId" =
    jl."organisationId"
WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )
  AND j."jobNumber" LIKE
    'DEMO-DWT-%'
  AND jl.direction =
    'incoming'
  AND jl.status =
    'completed'
  AND wr.id IS NULL;



/* =====================================================================
   VERIFICATION 5 — Q3 RETURN DEMO DATA

   EXPECTED FROM THIS SEED:

   RECEIVED:
     13 loads
     222.050 tonnes

   REMOVED:
     7 loads
     107.900 tonnes
===================================================================== */

SELECT
  CASE
    WHEN jl.direction =
      'outgoing'
    THEN 'removed'
    ELSE 'received'
  END AS return_direction,

  jl."ewcCodeSnapshot" AS ewc,

  COUNT(*) AS loads,

  SUM(
    jl."netWeight"
  ) AS tonnes

FROM bb_job_load jl

JOIN bb_job j
  ON j.id =
    jl."jobId"

JOIN bb_user u
  ON u."organisationId" =
    jl."organisationId"

WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )

  AND (
    j."jobNumber" LIKE
      'DEMO-Q3-%'
    OR j."jobNumber" LIKE
      'DEMO-DWT-%'
  )

  AND (
    (
      jl.direction =
        'incoming'
      AND jl.status IN (
        'accepted',
        'completed'
      )
    )
    OR
    (
      jl.direction =
        'outgoing'
      AND jl.status =
        'completed'
    )
  )

GROUP BY
  return_direction,
  jl."ewcCodeSnapshot"

ORDER BY
  return_direction,
  ewc;



/* =====================================================================
   VERIFICATION 6 — TRANSPORT EMISSIONS

   EXPECTED FROM THE SEEDED HISTORICAL OUTGOING LOADS:

     7 calculated loads
     107.900 tonnes
     406 km
     427.028 kg CO2e
===================================================================== */

SELECT
  COUNT(*) AS calculated_loads,

  SUM(
    jl."netWeight"
  ) AS tonnes,

  SUM(
    jl."transportDistanceKm"
  ) AS total_km,

  SUM(
    jl."transportCo2eKg"
  ) AS total_co2e_kg

FROM bb_job_load jl

JOIN bb_job j
  ON j.id =
    jl."jobId"

JOIN bb_user u
  ON u."organisationId" =
    jl."organisationId"

WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )

  AND j."jobNumber" LIKE
    'DEMO-Q3-OUT-%'

  AND jl.status =
    'completed'

  AND jl."transportCarbonCalculatedAt"
    IS NOT NULL;



/* =====================================================================
   VERIFICATION 7 — DEMO RATES
===================================================================== */

SELECT
  r."rateType",
  c.name AS counterparty,
  cs.name AS counterparty_site,
  mp.name AS material,
  r.amount,
  r.currency,
  r.unit,
  r."effectiveFrom",
  r."effectiveTo",
  r."isActive",
  r.notes

FROM bb_rate r

LEFT JOIN bb_counterparty c
  ON c.id =
    r."counterpartyId"

LEFT JOIN bb_counterparty_site cs
  ON cs.id =
    r."counterpartySiteId"

LEFT JOIN bb_material_profile mp
  ON mp.id =
    r."materialProfileId"

JOIN bb_user u
  ON u."organisationId" =
    r."organisationId"

WHERE
  lower(trim(u.name)) =
    lower(
      'Tadiwa Mwale'
    )

ORDER BY
  r."rateType",
  c.name,
  mp.name;