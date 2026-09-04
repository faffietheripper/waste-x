#!/usr/bin/env node
"use strict";

const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

const requiredTables = [
  "bb_client_device",
  "bb_client_session",
  "bb_sync_event_inbox",
  "bb_sync_entity_version",
  "bb_sync_change_feed",
  "bb_client_evidence_upload",
];

const requiredTriggers = [
  "client_sync_job_change",
  "client_sync_job_load_change",
  "client_sync_site_change",
  "client_sync_driver_change",
  "client_sync_vehicle_change",
  "client_sync_counterparty_change",
  "client_sync_counterparty_role_change",
  "client_sync_counterparty_site_change",
  "client_sync_counterparty_site_auth_change",
  "client_sync_counterparty_site_ewc_change",
  "client_sync_permit_change",
  "client_sync_permit_ewc_change",
];

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    const tables = await client.query(
      `select tablename from pg_tables where schemaname = current_schema() and tablename = any($1::text[])`,
      [requiredTables],
    );
    const foundTables = new Set(tables.rows.map((row) => row.tablename));

    const triggers = await client.query(
      `select tgname from pg_trigger where not tgisinternal and tgname = any($1::text[])`,
      [requiredTriggers],
    );
    const foundTriggers = new Set(triggers.rows.map((row) => row.tgname));

    const changeCaptureFunction = await client.query(
      `select 1 as found from pg_proc where proname = 'waste_x_capture_client_sync_change' limit 1`,
    );
    const hasChangeCaptureFunction = changeCaptureFunction.rowCount > 0;

    const missingTables = requiredTables.filter((name) => !foundTables.has(name));
    const missingTriggers = requiredTriggers.filter((name) => !foundTriggers.has(name));

    console.log(`Tables: ${foundTables.size}/${requiredTables.length}`);
    console.log(`Triggers: ${foundTriggers.size}/${requiredTriggers.length}`);
    console.log(
      `Change-capture function: ${hasChangeCaptureFunction ? "present" : "missing"}`,
    );

    if (missingTables.length || missingTriggers.length || !hasChangeCaptureFunction) {
      if (missingTables.length) {
        console.error(`Missing tables: ${missingTables.join(", ")}`);
      }
      if (missingTriggers.length) {
        console.error(`Missing triggers: ${missingTriggers.join(", ")}`);
      }
      if (!hasChangeCaptureFunction) {
        console.error("Missing function: waste_x_capture_client_sync_change");
      }
      process.exitCode = 1;
      return;
    }

    const dbReady = await client.query("select 1 as ok");
    if (dbReady.rows[0]?.ok !== 1) {
      throw new Error("Database readiness check failed.");
    }

    console.log("Waste X Client Sync API database foundation verified.");
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
