import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  jobLoads,
  organisations,
} from "./schema";

export type TransportRouteStatus =
  | "pending"
  | "calculated"
  | "missing_postcode"
  | "geocode_failed"
  | "route_failed";

/*
  One factual route snapshot per Job Load.

  Existing transport distance / CO2e values remain on bb_job_load for backwards
  compatibility. This sidecar records which postcodes and routing evidence were
  used so the report is auditable and can be recalculated if a site postcode is
  corrected later.
*/
export const transportRouteSnapshots = pgTable(
  "bb_transport_route_snapshot",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    jobLoadId: text("jobLoadId")
      .notNull()
      .references(() => jobLoads.id, { onDelete: "cascade" }),

    originPostcode: text("originPostcode"),
    destinationPostcode: text("destinationPostcode"),

    /*
      When true, the report-level postcode is intentionally being used instead
      of a master-data site postcode. Normally saving a correction updates the
      source/destination site too, so future Jobs benefit automatically.
    */
    originPostcodeOverride: boolean("originPostcodeOverride")
      .notNull()
      .default(false),
    destinationPostcodeOverride: boolean("destinationPostcodeOverride")
      .notNull()
      .default(false),

    originLatitude: numeric("originLatitude", { precision: 10, scale: 7 }),
    originLongitude: numeric("originLongitude", { precision: 10, scale: 7 }),
    destinationLatitude: numeric("destinationLatitude", {
      precision: 10,
      scale: 7,
    }),
    destinationLongitude: numeric("destinationLongitude", {
      precision: 10,
      scale: 7,
    }),

    distanceKm: numeric("distanceKm", { precision: 12, scale: 3 }),

    routeProvider: text("routeProvider"),
    routeProfile: text("routeProfile").notNull().default("driving"),

    status: text("status")
      .$type<TransportRouteStatus>()
      .notNull()
      .default("pending"),

    lastError: text("lastError"),
    calculatedAt: timestamp("calculatedAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    jobLoadUnique: uniqueIndex("transport_route_snapshot_job_load_unique").on(
      table.jobLoadId,
    ),
    orgIdx: index("transport_route_snapshot_org_idx").on(table.organisationId),
    statusIdx: index("transport_route_snapshot_status_idx").on(table.status),
  }),
);

/*
  Route cache prevents Waste X calling the routing service repeatedly for the
  same postcode pair. This is especially useful when 100+ Loads all travel the
  same customer-site -> receiving-site route.
*/
export const transportPostcodeRouteCache = pgTable(
  "bb_transport_postcode_route_cache",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    originPostcode: text("originPostcode").notNull(),
    destinationPostcode: text("destinationPostcode").notNull(),

    originLatitude: numeric("originLatitude", { precision: 10, scale: 7 }),
    originLongitude: numeric("originLongitude", { precision: 10, scale: 7 }),
    destinationLatitude: numeric("destinationLatitude", {
      precision: 10,
      scale: 7,
    }),
    destinationLongitude: numeric("destinationLongitude", {
      precision: 10,
      scale: 7,
    }),

    distanceKm: numeric("distanceKm", { precision: 12, scale: 3 }).notNull(),
    routeProvider: text("routeProvider").notNull(),
    routeProfile: text("routeProfile").notNull().default("driving"),

    calculatedAt: timestamp("calculatedAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pairUnique: uniqueIndex("transport_postcode_route_cache_pair_unique").on(
      table.organisationId,
      table.originPostcode,
      table.destinationPostcode,
    ),
    orgIdx: index("transport_postcode_route_cache_org_idx").on(
      table.organisationId,
    ),
  }),
);
