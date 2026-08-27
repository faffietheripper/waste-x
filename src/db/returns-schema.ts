import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  jobLoads,
  jobs,
  materialProfiles,
  organisations,
  users,
} from "./schema";

export type ReturnGeographySubjectType = "own_site" | "counterparty_site";
export type ReturnGeographySource = "postcodes_io" | "manual" | "imported";

/*
  Organisation-level quarterly-return defaults.

  Waste X uses practical low-friction defaults for the common case:
  - municipal source: No
  - from another activity: No facility
  - pre-treatment: None

  A Job or individual Load can override these when the real movement is different.
  Geography, weights, EWC, D/R code, permit linkage and movement dates remain
  factual/blocking because Waste X must not invent those values.
*/
export const returnSettings = pgTable("bb_return_settings", {
  organisationId: text("organisationId")
    .primaryKey()
    .references(() => organisations.id, { onDelete: "cascade" }),

  regulator: text("regulator").notNull().default("EA"),
  formVersion: text("formVersion").notNull().default("17.0"),

  municipalSourceDefault: boolean("municipalSourceDefault").notNull().default(false),
  fromAnotherActivityDefault: text("fromAnotherActivityDefault").notNull().default("No facility"),
  preTreatmentDefault: text("preTreatmentDefault").notNull().default("None"),

  updatedByUserId: text("updatedByUserId").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
});

/*
  Geography for both Waste X own sites and counterparty sites.

  This is deliberately a sidecar table instead of adding regulatory geography
  fields directly onto the existing site tables. It keeps this upgrade additive
  and lets the operational address remain independent of regulator mapping.
*/
export const returnSiteGeographies = pgTable(
  "bb_return_site_geography",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    subjectType: text("subjectType")
      .$type<ReturnGeographySubjectType>()
      .notNull(),
    subjectId: text("subjectId").notNull(),

    postcodeSnapshot: text("postcodeSnapshot"),

    localAuthorityCode: text("localAuthorityCode"),
    localAuthorityName: text("localAuthorityName"),

    /*
      EA Origin/Destination label. Defaults to the resolved local-authority name
      but can be manually overridden if a regulator pick-list uses a different
      display label.
    */
    returnAreaLabel: text("returnAreaLabel"),

    source: text("source")
      .$type<ReturnGeographySource>()
      .notNull()
      .default("postcodes_io"),

    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
    updatedByUserId: text("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("return_site_geo_org_idx").on(table.organisationId),
    subjectIdx: uniqueIndex("return_site_geo_subject_unique").on(
      table.organisationId,
      table.subjectType,
      table.subjectId,
    ),
    authorityIdx: index("return_site_geo_authority_idx").on(
      table.localAuthorityCode,
    ),
  }),
);

/* Regulatory classification that naturally belongs to a material profile. */
export const materialReturnProfiles = pgTable(
  "bb_material_return_profile",
  {
    materialProfileId: text("materialProfileId")
      .primaryKey()
      .references(() => materialProfiles.id, { onDelete: "cascade" }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    isDegradable: boolean("isDegradable").notNull().default(false),

    updatedByUserId: text("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("material_return_profile_org_idx").on(table.organisationId),
  }),
);

/*
  Return classifications agreed for a Job. These are defaults for every Load in
  that Job, just like the Job is the planned unit and the Load is the factual unit.
*/
export const jobReturnProfiles = pgTable(
  "bb_job_return_profile",
  {
    jobId: text("jobId")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    municipalSource: boolean("municipalSource").notNull().default(false),
    fromAnotherActivity: text("fromAnotherActivity").notNull().default("No facility"),
    preTreatment: text("preTreatment").notNull().default("None"),

    updatedByUserId: text("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_return_profile_org_idx").on(table.organisationId),
  }),
);

/*
  Immutable-ish factual return snapshot attached to a Job Load.

  The migration installs a PostgreSQL trigger which captures this automatically
  when an incoming Load is accepted/completed or an outgoing Load is completed.
  On later updates the trigger only fills missing snapshot fields; it does not
  silently rewrite already-recorded return history.
*/
export const jobLoadReturnSnapshots = pgTable(
  "bb_job_load_return_snapshot",
  {
    jobLoadId: text("jobLoadId")
      .primaryKey()
      .references(() => jobLoads.id, { onDelete: "cascade" }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    municipalSource: boolean("municipalSource").notNull().default(false),
    degradable: boolean("degradable").notNull().default(false),
    fromAnotherActivity: text("fromAnotherActivity").notNull().default("No facility"),
    preTreatment: text("preTreatment").notNull().default("None"),

    originLocalAuthorityCode: text("originLocalAuthorityCode"),
    originLocalAuthorityName: text("originLocalAuthorityName"),
    originReturnAreaLabel: text("originReturnAreaLabel"),
    originPostcodeSnapshot: text("originPostcodeSnapshot"),

    destinationLocalAuthorityCode: text("destinationLocalAuthorityCode"),
    destinationLocalAuthorityName: text("destinationLocalAuthorityName"),
    destinationReturnAreaLabel: text("destinationReturnAreaLabel"),
    destinationPostcodeSnapshot: text("destinationPostcodeSnapshot"),

    capturedAt: timestamp("capturedAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_load_return_snapshot_org_idx").on(table.organisationId),
  }),
);
