import { env } from "@/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as carbonSchema from "./carbon-schema";
import * as clientSyncSchema from "./client-sync-schema";
import * as commercialSchema from "./commercial-schema";
import * as coreSchema from "./schema";
import * as mobileFieldSchema from "./mobile-field-schema";
import * as returnsSchema from "./returns-schema";

/*
  Waste X still uses ONE PostgreSQL database.

  The files are only split by domain so schema.ts does not become impossible to
  maintain. Drizzle receives one merged schema object at runtime.
*/
const schema = {
  ...coreSchema,
  ...commercialSchema,
  ...returnsSchema,
  ...carbonSchema,
  ...clientSyncSchema,
  ...mobileFieldSchema,
};

declare global {
  // eslint-disable-next-line no-var
  var database: ReturnType<typeof drizzle<typeof schema>> | undefined;
}

let database: ReturnType<typeof drizzle<typeof schema>>;
let pool: Pool;

if (env.NODE_ENV === "production") {
  pool = new Pool({
    connectionString: env.DATABASE_URL,
  });

  database = drizzle(pool, { schema });
} else {
  if (!global.database) {
    pool = new Pool({
      connectionString: env.DATABASE_URL,
    });

    global.database = drizzle(pool, { schema });
  }

  database = global.database;
}

export { database };
