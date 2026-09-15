-- WASTE_X_RETURN_SNAPSHOT_CAPTURE_V1
--
-- Central DB capture for quarterly-return snapshots.
-- This matches the application-level backfill semantics:
--   * incoming accepted/completed Loads are eligible
--   * outgoing completed Loads are eligible
--   * classification values are captured once
--   * later executions only fill missing geography fields
--   * existing historical snapshot values are never silently replaced

CREATE OR REPLACE FUNCTION waste_x_upsert_job_load_return_snapshot(
  target_job_load_id text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO "bb_job_load_return_snapshot" (
    "jobLoadId",
    "organisationId",
    "municipalSource",
    "degradable",
    "fromAnotherActivity",
    "preTreatment",
    "originLocalAuthorityCode",
    "originLocalAuthorityName",
    "originReturnAreaLabel",
    "originPostcodeSnapshot",
    "destinationLocalAuthorityCode",
    "destinationLocalAuthorityName",
    "destinationReturnAreaLabel",
    "destinationPostcodeSnapshot",
    "capturedAt",
    "updatedAt"
  )
  SELECT
    l."id",
    l."organisationId",

    COALESCE(
      jrp."municipalSource",
      rs."municipalSourceDefault",
      false
    ),

    COALESCE(
      mrp."isDegradable",
      false
    ),

    COALESCE(
      NULLIF(BTRIM(jrp."fromAnotherActivity"), ''),
      NULLIF(BTRIM(rs."fromAnotherActivityDefault"), ''),
      'No facility'
    ),

    COALESCE(
      NULLIF(BTRIM(jrp."preTreatment"), ''),
      NULLIF(BTRIM(rs."preTreatmentDefault"), ''),
      'None'
    ),

    origin_geo."localAuthorityCode",
    origin_geo."localAuthorityName",
    COALESCE(
      origin_geo."returnAreaLabel",
      origin_geo."localAuthorityName"
    ),
    COALESCE(
      origin_geo."postcodeSnapshot",
      origin_site."postcode"
    ),

    destination_geo."localAuthorityCode",
    destination_geo."localAuthorityName",
    COALESCE(
      destination_geo."returnAreaLabel",
      destination_geo."localAuthorityName"
    ),
    COALESCE(
      destination_geo."postcodeSnapshot",
      destination_site."postcode"
    ),

    now(),
    now()

  FROM "bb_job_load" l

  LEFT JOIN "bb_return_settings" rs
    ON rs."organisationId" = l."organisationId"

  LEFT JOIN "bb_job_return_profile" jrp
    ON jrp."jobId" = l."jobId"

  LEFT JOIN "bb_material_return_profile" mrp
    ON mrp."materialProfileId" = l."materialProfileId"

  LEFT JOIN "bb_return_site_geography" origin_geo
    ON origin_geo."organisationId" = l."organisationId"
   AND origin_geo."subjectType" = 'counterparty_site'
   AND origin_geo."subjectId" = l."clientSiteId"

  LEFT JOIN "bb_return_site_geography" destination_geo
    ON destination_geo."organisationId" = l."organisationId"
   AND destination_geo."subjectType" = 'counterparty_site'
   AND destination_geo."subjectId" = l."thirdPartyDestinationSiteId"

  LEFT JOIN "bb_counterparty_site" origin_site
    ON origin_site."id" = l."clientSiteId"

  LEFT JOIN "bb_counterparty_site" destination_site
    ON destination_site."id" = l."thirdPartyDestinationSiteId"

  WHERE l."id" = target_job_load_id
    AND (
      (
        l."direction" = 'incoming'
        AND l."status" IN ('accepted', 'completed')
      )
      OR
      (
        l."direction" = 'outgoing'
        AND l."status" = 'completed'
      )
    )

  ON CONFLICT ("jobLoadId")
  DO UPDATE SET
    "originLocalAuthorityCode" =
      COALESCE(
        "bb_job_load_return_snapshot"."originLocalAuthorityCode",
        EXCLUDED."originLocalAuthorityCode"
      ),

    "originLocalAuthorityName" =
      COALESCE(
        "bb_job_load_return_snapshot"."originLocalAuthorityName",
        EXCLUDED."originLocalAuthorityName"
      ),

    "originReturnAreaLabel" =
      COALESCE(
        "bb_job_load_return_snapshot"."originReturnAreaLabel",
        EXCLUDED."originReturnAreaLabel"
      ),

    "originPostcodeSnapshot" =
      COALESCE(
        "bb_job_load_return_snapshot"."originPostcodeSnapshot",
        EXCLUDED."originPostcodeSnapshot"
      ),

    "destinationLocalAuthorityCode" =
      COALESCE(
        "bb_job_load_return_snapshot"."destinationLocalAuthorityCode",
        EXCLUDED."destinationLocalAuthorityCode"
      ),

    "destinationLocalAuthorityName" =
      COALESCE(
        "bb_job_load_return_snapshot"."destinationLocalAuthorityName",
        EXCLUDED."destinationLocalAuthorityName"
      ),

    "destinationReturnAreaLabel" =
      COALESCE(
        "bb_job_load_return_snapshot"."destinationReturnAreaLabel",
        EXCLUDED."destinationReturnAreaLabel"
      ),

    "destinationPostcodeSnapshot" =
      COALESCE(
        "bb_job_load_return_snapshot"."destinationPostcodeSnapshot",
        EXCLUDED."destinationPostcodeSnapshot"
      ),

    "updatedAt" = now()

  WHERE
    (
      "bb_job_load_return_snapshot"."originLocalAuthorityCode" IS NULL
      AND EXCLUDED."originLocalAuthorityCode" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."originLocalAuthorityName" IS NULL
      AND EXCLUDED."originLocalAuthorityName" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."originReturnAreaLabel" IS NULL
      AND EXCLUDED."originReturnAreaLabel" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."originPostcodeSnapshot" IS NULL
      AND EXCLUDED."originPostcodeSnapshot" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."destinationLocalAuthorityCode" IS NULL
      AND EXCLUDED."destinationLocalAuthorityCode" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."destinationLocalAuthorityName" IS NULL
      AND EXCLUDED."destinationLocalAuthorityName" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."destinationReturnAreaLabel" IS NULL
      AND EXCLUDED."destinationReturnAreaLabel" IS NOT NULL
    )
    OR
    (
      "bb_job_load_return_snapshot"."destinationPostcodeSnapshot" IS NULL
      AND EXCLUDED."destinationPostcodeSnapshot" IS NOT NULL
    );
END;
$$;


CREATE OR REPLACE FUNCTION waste_x_capture_job_load_return_snapshot()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF (
    (
      NEW."direction" = 'incoming'
      AND NEW."status" IN ('accepted', 'completed')
    )
    OR
    (
      NEW."direction" = 'outgoing'
      AND NEW."status" = 'completed'
    )
  ) THEN
    PERFORM waste_x_upsert_job_load_return_snapshot(NEW."id");
  END IF;

  RETURN NEW;
END;
$$;


DROP TRIGGER IF EXISTS "job_load_return_snapshot_capture"
  ON "bb_job_load";

CREATE TRIGGER "job_load_return_snapshot_capture"
AFTER INSERT OR UPDATE OF
  "status",
  "clientSiteId",
  "thirdPartyDestinationSiteId",
  "materialProfileId",
  "jobId"
ON "bb_job_load"
FOR EACH ROW
EXECUTE FUNCTION waste_x_capture_job_load_return_snapshot();


-- Backfill existing eligible Loads directly through the same canonical helper.
-- This does NOT update bb_job_load itself, so it does not create synthetic
-- client-sync Load changes.
DO $$
DECLARE
  load_row record;
BEGIN
  FOR load_row IN
    SELECT l."id"
    FROM "bb_job_load" l
    WHERE
      (
        l."direction" = 'incoming'
        AND l."status" IN ('accepted', 'completed')
      )
      OR
      (
        l."direction" = 'outgoing'
        AND l."status" = 'completed'
      )
    ORDER BY l."id"
  LOOP
    PERFORM waste_x_upsert_job_load_return_snapshot(load_row."id");
  END LOOP;
END;
$$;
