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
