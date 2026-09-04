import * as SQLite from "expo-sqlite";

import { getOrCreateDatabaseKey } from "./secure";

const DATABASE_NAME = "waste-x-mobile.db";
const SCHEMA_VERSION = 5;

export type MobileDatabaseStatus = {
  ready: true;
  schemaVersion: number;
  cipherVersion: string;
};

export async function openMobileDatabase() {
  const key = await getOrCreateDatabaseKey();
  const database = await SQLite.openDatabaseAsync(DATABASE_NAME);

  // PRAGMA key must always be the first database operation after opening the
  // connection. The key is generated as 32 random bytes and encoded as hex.
  await database.execAsync(`PRAGMA key = "x'${key}'";`);
  return database;
}

export async function initialiseMobileDatabase(
  deviceId: string,
  platform: "IOS" | "ANDROID",
): Promise<MobileDatabaseStatus> {
  const database = await openMobileDatabase();

  const cipher = await database.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version",
  );
  const cipherVersion = cipher?.cipher_version?.trim() ?? "";
  if (!cipherVersion) {
    throw new Error(
      "Waste X Mobile opened SQLite without SQLCipher. Use a native development build; SQLCipher is unavailable in Expo Go.",
    );
  }

  await database.execAsync(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = FULL;
    PRAGMA busy_timeout = 5000;

    CREATE TABLE IF NOT EXISTS local_schema_migration (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_device_configuration (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      device_id TEXT NOT NULL,
      platform TEXT NOT NULL,
      organisation_id TEXT,
      user_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_sync_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_sync_queue (
      event_id TEXT PRIMARY KEY,
      organisation_id TEXT,
      site_id TEXT,
      device_id TEXT NOT NULL,
      actor_user_id TEXT,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      base_version INTEGER,
      device_sequence INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      recorded_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      synced_at TEXT,
      last_relayed_at TEXT,
      relay_bridge_id TEXT
    );

    CREATE INDEX IF NOT EXISTS local_sync_queue_status_idx
      ON local_sync_queue(status, device_sequence);

    CREATE UNIQUE INDEX IF NOT EXISTS local_sync_queue_device_sequence_unique
      ON local_sync_queue(device_id, device_sequence);

    CREATE TABLE IF NOT EXISTS local_mobile_bootstrap_state (
      singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
      scope_resolution TEXT NOT NULL,
      user_id TEXT NOT NULL,
      driver_json TEXT,
      generated_at TEXT NOT NULL,
      horizon_start TEXT NOT NULL,
      horizon_end TEXT NOT NULL,
      refreshed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_mobile_assignment (
      load_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      job_number TEXT NOT NULL,
      job_date TEXT NOT NULL,
      job_status TEXT NOT NULL,
      direction TEXT NOT NULL,
      load_number INTEGER NOT NULL,
      load_status TEXT NOT NULL,
      entity_version INTEGER NOT NULL DEFAULT 0,
      driver_id TEXT NOT NULL,
      vehicle_id TEXT,
      ewc_code TEXT,
      payload_json TEXT NOT NULL,
      refreshed_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS local_mobile_assignment_job_date_idx
      ON local_mobile_assignment(job_date, load_number);

    CREATE INDEX IF NOT EXISTS local_mobile_assignment_job_idx
      ON local_mobile_assignment(job_id, load_number);

    CREATE INDEX IF NOT EXISTS local_mobile_assignment_driver_idx
      ON local_mobile_assignment(driver_id, job_date);
  `);

  // Existing Step 11 installations may pre-date newer columns. SQLite
  // CREATE TABLE IF NOT EXISTS does not alter an existing table, so migrate
  // these additions idempotently.
  const assignmentColumns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(local_mobile_assignment)",
  );
  if (!assignmentColumns.some((column) => column.name === "entity_version")) {
    await database.execAsync(
      "ALTER TABLE local_mobile_assignment ADD COLUMN entity_version INTEGER NOT NULL DEFAULT 0;",
    );
  }

  const syncQueueColumns = await database.getAllAsync<{ name: string }>(
    "PRAGMA table_info(local_sync_queue)",
  );
  if (!syncQueueColumns.some((column) => column.name === "last_relayed_at")) {
    await database.execAsync(
      "ALTER TABLE local_sync_queue ADD COLUMN last_relayed_at TEXT;",
    );
  }
  if (!syncQueueColumns.some((column) => column.name === "relay_bridge_id")) {
    await database.execAsync(
      "ALTER TABLE local_sync_queue ADD COLUMN relay_bridge_id TEXT;",
    );
  }

  const now = new Date().toISOString();
  await database.runAsync(
    `INSERT INTO local_schema_migration (version, applied_at)
     VALUES (?, ?)
     ON CONFLICT(version) DO NOTHING`,
    SCHEMA_VERSION,
    now,
  );

  await database.runAsync(
    `INSERT INTO local_device_configuration (
       singleton_id, device_id, platform, created_at, updated_at
     ) VALUES (1, ?, ?, ?, ?)
     ON CONFLICT(singleton_id) DO UPDATE SET
       device_id = excluded.device_id,
       platform = excluded.platform,
       updated_at = excluded.updated_at`,
    deviceId,
    platform,
    now,
    now,
  );

  const migration = await database.getFirstAsync<{ version: number }>(
    "SELECT COALESCE(MAX(version), 0) AS version FROM local_schema_migration",
  );

  return {
    ready: true,
    schemaVersion: migration?.version ?? 0,
    cipherVersion,
  };
}
