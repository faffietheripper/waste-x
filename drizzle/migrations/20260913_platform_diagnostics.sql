-- Waste X — canonical sanitised platform diagnostics foundation.
-- No customer payload bodies, auth secrets, cookies, SQLCipher content,
-- token hashes or raw request/response bodies belong in this table.

CREATE TABLE IF NOT EXISTS "bb_platform_diagnostic_event" (
  "id" text PRIMARY KEY NOT NULL,
  "organisationId" text,
  "userId" text,
  "deviceId" text,
  "siteId" text,
  "surface" text NOT NULL,
  "clientVersion" text,
  "severity" text DEFAULT 'medium' NOT NULL,
  "category" text DEFAULT 'unknown' NOT NULL,
  "code" text NOT NULL,
  "operation" text NOT NULL,
  "route" text,
  "method" text,
  "entityType" text,
  "entityId" text,
  "correlationId" text NOT NULL,
  "safeMessage" text NOT NULL,
  "safeContext" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "outcome" text DEFAULT 'FAILED' NOT NULL,
  "occurredAt" timestamp NOT NULL,
  "recordedAt" timestamp DEFAULT now(),
  "resolvedAt" timestamp,
  CONSTRAINT "platform_diagnostic_org_fk"
    FOREIGN KEY ("organisationId")
    REFERENCES "bb_organisation"("id")
    ON DELETE SET NULL,
  CONSTRAINT "platform_diagnostic_user_fk"
    FOREIGN KEY ("userId")
    REFERENCES "bb_user"("id")
    ON DELETE SET NULL,
  CONSTRAINT "platform_diagnostic_device_fk"
    FOREIGN KEY ("deviceId")
    REFERENCES "bb_client_device"("id")
    ON DELETE SET NULL,
  CONSTRAINT "platform_diagnostic_site_fk"
    FOREIGN KEY ("siteId")
    REFERENCES "bb_sites"("id")
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS "platform_diagnostic_org_idx"
  ON "bb_platform_diagnostic_event" ("organisationId");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_device_idx"
  ON "bb_platform_diagnostic_event" ("deviceId");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_user_idx"
  ON "bb_platform_diagnostic_event" ("userId");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_code_idx"
  ON "bb_platform_diagnostic_event" ("code");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_correlation_idx"
  ON "bb_platform_diagnostic_event" ("correlationId");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_occurred_idx"
  ON "bb_platform_diagnostic_event" ("occurredAt");

CREATE INDEX IF NOT EXISTS "platform_diagnostic_outcome_idx"
  ON "bb_platform_diagnostic_event" ("outcome");
