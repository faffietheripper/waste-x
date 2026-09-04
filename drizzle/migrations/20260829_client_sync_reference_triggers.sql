-- WASTE X CLIENT SYNC REFERENCE-DATA CHANGE CAPTURE
-- 2026-08-29
--
-- REVIEW WITH 20260829_client_sync_api.sql BEFORE APPLYING.
-- This extends the generic change-capture function to composite-key reference
-- tables needed for offline third-party site / authorisation validation.

CREATE OR REPLACE FUNCTION waste_x_capture_client_sync_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  row_data jsonb;
  organisation_id text;
  entity_id text;
  site_id text;
  next_version integer;
  operation_type text;
BEGIN
  row_data := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  organisation_id := row_data ->> 'organisationId';

  IF organisation_id IS NULL OR organisation_id = '' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  entity_id := COALESCE(
    row_data ->> 'id',
    CASE
      WHEN row_data ? 'permitId' AND row_data ? 'ewcCodeId'
        THEN (row_data ->> 'permitId') || ':' || (row_data ->> 'ewcCodeId')
      WHEN row_data ? 'counterpartyId' AND row_data ? 'role'
        THEN (row_data ->> 'counterpartyId') || ':' || (row_data ->> 'role')
      WHEN row_data ? 'authorisationId' AND row_data ? 'ewcCodeId'
        THEN (row_data ->> 'authorisationId') || ':' || (row_data ->> 'ewcCodeId')
      ELSE NULL
    END
  );

  IF entity_id IS NULL OR entity_id = '' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "bb_sync_event_inbox" inbox
    WHERE inbox."organisationId" = organisation_id
      AND inbox."entityType" = TG_ARGV[0]
      AND inbox."entityId" = entity_id
      AND inbox."resultStatus" = 'APPLIED'
      AND inbox."receivedAt" >= transaction_timestamp()
  ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  site_id := COALESCE(
    row_data ->> 'siteId',
    row_data ->> 'ownSiteId',
    row_data ->> 'counterpartySiteId'
  );
  operation_type := CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END;

  INSERT INTO "bb_sync_entity_version" (
    "organisationId", "entityType", "entityId", "version", "updatedAt"
  ) VALUES (
    organisation_id, TG_ARGV[0], entity_id, 1, now()
  )
  ON CONFLICT ("organisationId", "entityType", "entityId")
  DO UPDATE SET
    "version" = "bb_sync_entity_version"."version" + 1,
    "updatedAt" = now()
  RETURNING "version" INTO next_version;

  INSERT INTO "bb_sync_change_feed" (
    "organisationId", "siteId", "entityType", "entityId",
    "entityVersion", "changeType", "payload", "changedAt"
  ) VALUES (
    organisation_id, site_id, TG_ARGV[0], entity_id,
    next_version, operation_type, row_data, now()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "client_sync_counterparty_role_change" ON "bb_counterparty_role";
CREATE CONSTRAINT TRIGGER "client_sync_counterparty_role_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_counterparty_role"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('counterparty_role');

DROP TRIGGER IF EXISTS "client_sync_counterparty_site_change" ON "bb_counterparty_site";
CREATE CONSTRAINT TRIGGER "client_sync_counterparty_site_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_counterparty_site"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('counterparty_site');

DROP TRIGGER IF EXISTS "client_sync_counterparty_site_auth_change" ON "bb_counterparty_site_authorisation";
CREATE CONSTRAINT TRIGGER "client_sync_counterparty_site_auth_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_counterparty_site_authorisation"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('counterparty_site_authorisation');

DROP TRIGGER IF EXISTS "client_sync_counterparty_site_ewc_change" ON "bb_counterparty_site_ewc_code";
CREATE CONSTRAINT TRIGGER "client_sync_counterparty_site_ewc_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_counterparty_site_ewc_code"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('counterparty_site_ewc_code');
