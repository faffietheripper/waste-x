#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("pg");
require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });

const APPLY_FLAG = "--confirm-development";
const allowProduction = process.argv.includes("--allow-production");

if (!process.argv.includes(APPLY_FLAG)) {
  console.error(
    `Refusing to apply migrations without ${APPLY_FLAG}. This command changes the configured PostgreSQL database.`,
  );
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not configured.");
  process.exit(1);
}

if (
  !allowProduction &&
  (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production")
) {
  console.error(
    "Refusing to run while the environment is marked production. Use a development/staging database.",
  );
  process.exit(1);
}

const migrations = [
  "drizzle/migrations/20260829_client_sync_api.sql",
  "drizzle/migrations/20260829_client_sync_reference_triggers.sql",
];

const databaseUrl = new URL(process.env.DATABASE_URL);
console.log("Waste X Client Sync API migration");
console.log(`Target host: ${databaseUrl.hostname}`);
console.log(`Target database: ${databaseUrl.pathname.replace(/^\//, "") || "(default)"}`);
console.log("Applying:");
for (const file of migrations) console.log(`  - ${file}`);

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  try {
    await client.query("BEGIN");

    for (const relativePath of migrations) {
      const sql = fs.readFileSync(path.resolve(process.cwd(), relativePath), "utf8");
      console.log(`Applying ${relativePath}...`);
      await client.query(sql);
    }

    await client.query("COMMIT");
    console.log("Client Sync API migrations applied successfully.");
  } catch (error) {
    try {
      await client.query("ROLLBACK");
    } catch {
      // Preserve the original migration error.
    }
    console.error("Migration failed; transaction rolled back.");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
