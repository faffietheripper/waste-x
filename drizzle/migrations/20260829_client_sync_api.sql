-- WASTE X CLIENT SYNC API FOUNDATION
-- 2026-08-29
--
-- REVIEW BEFORE APPLYING TO ANY SHARED OR PRODUCTION DATABASE.
-- This migration is intentionally not executed automatically by this change.

CREATE TABLE IF NOT EXISTS "bb_client_device" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "defaultSiteId" text REFERENCES "bb_sites"("id") ON DELETE SET NULL,
  "displayName" text NOT NULL,
  "deviceType" text NOT NULL,
  "platform" text NOT NULL,
  "status" text NOT NULL DEFAULT 'ACTIVE',
  "secretHash" text NOT NULL,
  "registeredByUserId" text REFERENCES "bb_user"("id") ON DELETE SET NULL,
  "lastSeenAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "client_device_org_idx"
  ON "bb_client_device" ("organisationId");
CREATE INDEX IF NOT EXISTS "client_device_status_idx"
  ON "bb_client_device" ("status");
CREATE INDEX IF NOT EXISTS "client_device_org_status_idx"
  ON "bb_client_device" ("organisationId", "status");

CREATE TABLE IF NOT EXISTS "bb_client_session" (
  "id" text PRIMARY KEY NOT NULL,
  "deviceId" text NOT NULL REFERENCES "bb_client_device"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "bb_user"("id") ON DELETE CASCADE,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "tokenHash" text NOT NULL,
  "expiresAt" timestamp NOT NULL,
  "lastSeenAt" timestamp,
  "revokedAt" timestamp,
  "createdAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_session_token_unique"
  ON "bb_client_session" ("tokenHash");
CREATE INDEX IF NOT EXISTS "client_session_device_idx"
  ON "bb_client_session" ("deviceId");
CREATE INDEX IF NOT EXISTS "client_session_user_idx"
  ON "bb_client_session" ("userId");
CREATE INDEX IF NOT EXISTS "client_session_org_idx"
  ON "bb_client_session" ("organisationId");
CREATE INDEX IF NOT EXISTS "client_session_expiry_idx"
  ON "bb_client_session" ("expiresAt");

CREATE TABLE IF NOT EXISTS "bb_sync_event_inbox" (
  "eventId" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "siteId" text,
  "deviceId" text NOT NULL REFERENCES "bb_client_device"("id") ON DELETE CASCADE,
  "actorUserId" text NOT NULL REFERENCES "bb_user"("id") ON DELETE RESTRICT,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "eventType" text NOT NULL,
  "baseVersion" integer,
  "deviceSequence" integer NOT NULL,
  "payload" jsonb NOT NULL,
  "payloadHash" text NOT NULL,
  "occurredAt" timestamp NOT NULL,
  "recordedAt" timestamp NOT NULL,
  "receivedAt" timestamp DEFAULT now(),
  "resultStatus" text NOT NULL,
  "resultEntityVersion" integer,
  "reasonCode" text
);

CREATE UNIQUE INDEX IF NOT EXISTS "sync_event_device_sequence_unique"
  ON "bb_sync_event_inbox" ("deviceId", "deviceSequence");
CREATE INDEX IF NOT EXISTS "sync_event_org_idx"
  ON "bb_sync_event_inbox" ("organisationId");
CREATE INDEX IF NOT EXISTS "sync_event_entity_idx"
  ON "bb_sync_event_inbox" ("organisationId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "sync_event_received_idx"
  ON "bb_sync_event_inbox" ("receivedAt");

CREATE TABLE IF NOT EXISTS "bb_sync_entity_version" (
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "version" integer NOT NULL DEFAULT 0,
  "updatedAt" timestamp DEFAULT now(),
  CONSTRAINT "bb_sync_entity_version_pk"
    PRIMARY KEY ("organisationId", "entityType", "entityId")
);

CREATE INDEX IF NOT EXISTS "sync_entity_version_entity_idx"
  ON "bb_sync_entity_version" ("entityType", "entityId");

CREATE TABLE IF NOT EXISTS "bb_sync_change_feed" (
  "sequence" bigserial PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "siteId" text,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "entityVersion" integer NOT NULL,
  "changeType" text NOT NULL,
  "payload" jsonb,
  "changedAt" timestamp DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "sync_change_feed_org_sequence_idx"
  ON "bb_sync_change_feed" ("organisationId", "sequence");
CREATE INDEX IF NOT EXISTS "sync_change_feed_entity_idx"
  ON "bb_sync_change_feed" ("organisationId", "entityType", "entityId");

CREATE TABLE IF NOT EXISTS "bb_client_evidence_upload" (
  "evidenceId" text PRIMARY KEY NOT NULL,
  "organisationId" text NOT NULL REFERENCES "bb_organisation"("id") ON DELETE CASCADE,
  "siteId" text,
  "deviceId" text NOT NULL REFERENCES "bb_client_device"("id") ON DELETE CASCADE,
  "userId" text NOT NULL REFERENCES "bb_user"("id") ON DELETE RESTRICT,
  "entityType" text NOT NULL,
  "entityId" text NOT NULL,
  "fileName" text NOT NULL,
  "contentType" text NOT NULL,
  "byteSize" integer NOT NULL,
  "sha256" text NOT NULL,
  "storageKey" text NOT NULL,
  "status" text NOT NULL DEFAULT 'PENDING_UPLOAD',
  "uploadedAt" timestamp,
  "createdAt" timestamp DEFAULT now(),
  "updatedAt" timestamp DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_evidence_storage_key_unique"
  ON "bb_client_evidence_upload" ("storageKey");
CREATE INDEX IF NOT EXISTS "client_evidence_org_idx"
  ON "bb_client_evidence_upload" ("organisationId");
CREATE INDEX IF NOT EXISTS "client_evidence_entity_idx"
  ON "bb_client_evidence_upload" ("organisationId", "entityType", "entityId");
CREATE INDEX IF NOT EXISTS "client_evidence_status_idx"
  ON "bb_client_evidence_upload" ("status");

-- ---------------------------------------------------------------------------
-- CLOUD CHANGE CAPTURE
-- ---------------------------------------------------------------------------
-- Existing Web/server-action writes must advance the same cursor used by
-- Desktop/Mobile pull. The triggers are deferred until transaction commit.
-- A client-sync transaction has written an APPLIED inbox receipt by then, so
-- the trigger can skip that row and avoid double-counting a Desktop event.

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
      ELSE NULL
    END
  );

  IF entity_id IS NULL OR entity_id = '' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  -- If this exact entity was successfully applied by the client sync processor
  -- in the same PostgreSQL transaction, that processor already created the
  -- version/change-feed entry atomically. Do not create a duplicate here.
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

  site_id := COALESCE(row_data ->> 'siteId', row_data ->> 'ownSiteId');
  operation_type := CASE WHEN TG_OP = 'DELETE' THEN 'DELETE' ELSE 'UPSERT' END;

  INSERT INTO "bb_sync_entity_version" (
    "organisationId",
    "entityType",
    "entityId",
    "version",
    "updatedAt"
  ) VALUES (
    organisation_id,
    TG_ARGV[0],
    entity_id,
    1,
    now()
  )
  ON CONFLICT ("organisationId", "entityType", "entityId")
  DO UPDATE SET
    "version" = "bb_sync_entity_version"."version" + 1,
    "updatedAt" = now()
  RETURNING "version" INTO next_version;

  INSERT INTO "bb_sync_change_feed" (
    "organisationId",
    "siteId",
    "entityType",
    "entityId",
    "entityVersion",
    "changeType",
    "payload",
    "changedAt"
  ) VALUES (
    organisation_id,
    site_id,
    TG_ARGV[0],
    entity_id,
    next_version,
    operation_type,
    row_data,
    now()
  );

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

DROP TRIGGER IF EXISTS "client_sync_job_change" ON "bb_job";
CREATE CONSTRAINT TRIGGER "client_sync_job_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_job"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('job');

DROP TRIGGER IF EXISTS "client_sync_job_load_change" ON "bb_job_load";
CREATE CONSTRAINT TRIGGER "client_sync_job_load_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_job_load"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('job_load');

DROP TRIGGER IF EXISTS "client_sync_site_change" ON "bb_sites";
CREATE CONSTRAINT TRIGGER "client_sync_site_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_sites"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('site');

DROP TRIGGER IF EXISTS "client_sync_driver_change" ON "bb_driver";
CREATE CONSTRAINT TRIGGER "client_sync_driver_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_driver"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('driver');

DROP TRIGGER IF EXISTS "client_sync_vehicle_change" ON "bb_vehicle";
CREATE CONSTRAINT TRIGGER "client_sync_vehicle_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_vehicle"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('vehicle');

DROP TRIGGER IF EXISTS "client_sync_counterparty_change" ON "bb_counterparty";
CREATE CONSTRAINT TRIGGER "client_sync_counterparty_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_counterparty"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('counterparty');

DROP TRIGGER IF EXISTS "client_sync_permit_change" ON "bb_site_permit";
CREATE CONSTRAINT TRIGGER "client_sync_permit_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_site_permit"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('permit');

DROP TRIGGER IF EXISTS "client_sync_permit_ewc_change" ON "bb_permit_ewc_code";
CREATE CONSTRAINT TRIGGER "client_sync_permit_ewc_change"
AFTER INSERT OR UPDATE OR DELETE ON "bb_permit_ewc_code"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION waste_x_capture_client_sync_change('permit_ewc_code');
