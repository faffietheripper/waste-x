import { env } from "@/env";
import { defineConfig } from "drizzle-kit";

import { loadEnvConfig } from "@next/env";

const projectDir = process.cwd();
loadEnvConfig(projectDir);

const DATABASE_URL = env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("POSTGRES_URL is not set");
}

export default defineConfig({
  schema: [
    "./src/db/schema.ts",
    "./src/db/commercial-schema.ts",
    "./src/db/returns-schema.ts",
    "./src/db/carbon-schema.ts",
  ],
  
  dialect: "postgresql",
  out: "./drizzle/migrations",
  dbCredentials: {
    url: DATABASE_URL,
  },
  verbose: true,
  strict: true,
});