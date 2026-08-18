/*
  WASTE X — SOLO WORKSPACE FOUNDATION SCHEMA

  IMPORTANT:
  - Solo Workspace is the active MVP operational model.
  - Generator / Carrier / Compliance department and assignment models are retained
    for future network phases and Marketplace compatibility, but are not required
    by the new Solo workflow.
  - Marketplace tables are retained.
  - Do not apply this file directly to a production database with drizzle-kit push.
    Create and review a migration that adds/backfills the new model safely.

  Core active flow:
  Organisation
    -> Site
      -> Site Permit
        -> Permitted EWC Codes
    -> Counterparties / Drivers / Vehicles / Materials / Rates
    -> Job
      -> Job Load
        -> Waste Receipt
          -> DWT Submission
*/

import {
  integer,
  pgTable,
  primaryKey,
  text,
  boolean,
  timestamp,
  serial,
  uniqueIndex,
  index,
  numeric,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";


export type OrganisationOperatingMode =
  | "solo"
  | "team"
  | "multi_site"
  | "carrier_ops"
  | "enterprise";

export type SiteType =
  | "main_site"
  | "waste_receiving_site"
  | "transfer_station"
  | "depot"
  | "recycling_yard"
  | "construction_site"
  | "customer_site"
  | "other";

export type SiteStatus = "active" | "inactive" | "archived";

export type CarrierAssignmentJobSource =
  | "wastex_marketplace"
  | "external_manual"
  | "internal_operation";

export type CounterpartyRole =
  | "client"
  | "producer"
  | "haulier"
  | "receiver"
  | "third_party_tip"
  | "supplier"
  | "broker"
  | "dealer";

export type CounterpartySiteType =
  | "producer_site"
  | "customer_site"
  | "receiving_site"
  | "third_party_tip"
  | "depot"
  | "other";

export type PermitRegulator = "EA" | "NRW" | "SEPA" | "NIEA" | "other";

export type PermitAuthorisationType =
  | "permit"
  | "licence"
  | "exemption"
  | "other";

export type PermitStatus =
  | "active"
  | "expired"
  | "suspended"
  | "revoked"
  | "unknown";

export type JobDirection = "incoming" | "outgoing";

export type JobSource =
  | "manual"
  | "template"
  | "repeat"
  | "marketplace"
  | "imported";

export type JobStatus =
  | "draft"
  | "booked"
  | "in_progress"
  | "completed"
  | "cancelled";

export type JobLoadStatus =
  | "planned"
  | "arrived"
  | "accepted"
  | "rejected"
  | "completed"
  | "cancelled";

export type WeightSource = "manual" | "weighbridge" | "imported";

export type CommercialRateType =
  | "customer_charge"
  | "haulage_cost"
  | "tipping_cost"
  | "material_sale"
  | "other";

export type CommercialRateUnit = "tonne" | "load" | "job";


/* =========================================================
   ORGANISATIONS
========================================================= */

export const organisations = pgTable("bb_organisation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  teamName: text("teamName").notNull(),
  profilePicture: text("profilePicture"),

  // (REPLACES chainOfCustody)
  capabilities: text("capabilities")
    .array()
    .$type<("generator" | "carrier" | "manager")[]>()
    .notNull()
    .default([]),

 operatingMode: text("operatingMode")
    .$type<OrganisationOperatingMode>()
    .notNull()
    .default("solo"),

  industry: text("industry"),

  telephone: text("telephone").notNull(),
  emailAddress: text("emailAddress").notNull(),

  country: text("country").notNull(),
  streetAddress: text("streetAddress").notNull(),
  city: text("city").notNull(),
  region: text("region").notNull(),
  postCode: text("postCode").notNull(),

  isSuspended: boolean("isSuspended").notNull().default(false),

  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),

  billingCustomerId: text("billingCustomerId"),

  subscriptionStatus: text("subscriptionStatus")
    .$type<"trial" | "active" | "past_due" | "cancelled">()
    .default("trial"),

  subscriptionPlan: text("subscriptionPlan")
    .$type<"starter" | "pro" | "enterprise">()
    .default("starter"),

  trialEndsAt: timestamp("trialEndsAt", { mode: "date" }),

  billingEmail: text("billingEmail"),

  status: text("status")
    .$type<"PENDING" | "ACTIVE" | "REJECTED" | "SUSPENDED">()
    .default("PENDING"),

  approvedAt: timestamp("approvedAt", { mode: "date" }),
});

/*
  LEGACY / FUTURE NETWORK MODEL
  --------------------------------
  Retained so Generator / Carrier / Compliance functionality can return later.
  The Solo Workspace must not depend on departments or activeDepartment.
*/
export const departments = pgTable("bb_departments", {
  id: text("id").primaryKey(),

  organisationId: text("organisationId").notNull(),

  name: text("name").notNull(),

  type: text("type")
    .$type<"generator" | "carrier" | "manager" | "compliance">()
    .notNull(),

  createdAt: timestamp("createdAt").defaultNow(),
});

export const organisationSubscriptions = pgTable(
  "bb_organisation_subscription",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    stripeSubscriptionId: text("stripeSubscriptionId"),

    plan: text("plan").$type<"starter" | "pro" | "enterprise">().notNull(),

    status: text("status")
      .$type<"trial" | "active" | "past_due" | "cancelled">()
      .notNull(),

    currentPeriodStart: timestamp("currentPeriodStart", { mode: "date" }),
    currentPeriodEnd: timestamp("currentPeriodEnd", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("subscription_org_idx").on(table.organisationId),
  }),
);

/* =========================================================
   SITES
========================================================= */

export const sites = pgTable(
  "bb_sites",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    siteType: text("siteType")
      .$type<SiteType>()
      .notNull()
      .default("main_site"),

    fullAddress: text("fullAddress"),
    postcode: text("postcode"),

    /*
      LEGACY compatibility only.
      New Solo Workspace permit configuration lives in sitePermits.
    */
    permitNumber: text("permitNumber"),

    isDefault: boolean("isDefault").notNull().default(false),

    status: text("status")
      .$type<SiteStatus>()
      .notNull()
      .default("active"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("site_org_idx").on(table.organisationId),
    statusIdx: index("site_status_idx").on(table.status),
    defaultIdx: index("site_default_idx").on(table.organisationId, table.isDefault),
    orgNameUnique: uniqueIndex("site_org_name_unique").on(
      table.organisationId,
      table.name,
    ),
  }),
);


/* =========================================================
   SOLO WORKSPACE CORE
   ---------------------------------------------------------
   This is the active MVP operational model.

   Master data:
   - site permits / EWC catalogue
   - counterparties / sites
   - drivers / vehicles
   - materials / D-R codes / rates

   Transactions:
   - job templates
   - jobs
   - job loads

   Generator / Carrier assignment tables remain below for
   future network workflows, but Solo does not depend on them.
========================================================= */

/* =========================================================
   EWC CATALOGUE
   Stable Waste X operational catalogue.
   wasteTrackingReferenceData remains the external/reference cache.
========================================================= */

export const ewcCodes = pgTable(
  "bb_ewc_code",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    code: text("code").notNull(),
    description: text("description").notNull(),

    chapterCode: text("chapterCode"),
    chapterDescription: text("chapterDescription"),
    subChapterCode: text("subChapterCode"),
    subChapterDescription: text("subChapterDescription"),

    entryType: text("entryType"),
    isHazardous: boolean("isHazardous"),

    source: text("source").notNull().default("official"),
    sourceVersion: text("sourceVersion"),

    isActive: boolean("isActive").notNull().default(true),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("ewc_code_unique").on(table.code),
    activeIdx: index("ewc_active_idx").on(table.isActive),
    hazardousIdx: index("ewc_hazardous_idx").on(table.isHazardous),
  }),
);

/* =========================================================
   DISPOSAL / RECOVERY CODES
========================================================= */

export const disposalRecoveryCodes = pgTable(
  "bb_disposal_recovery_code",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    code: text("code").notNull(),

    type: text("type")
      .$type<"disposal" | "recovery">()
      .notNull(),

    description: text("description").notNull(),

    isActive: boolean("isActive").notNull().default(true),

    source: text("source").notNull().default("official"),
    sourceVersion: text("sourceVersion"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    codeUnique: uniqueIndex("disposal_recovery_code_unique").on(table.code),
    typeIdx: index("disposal_recovery_type_idx").on(table.type),
    activeIdx: index("disposal_recovery_active_idx").on(table.isActive),
  }),
);

/* =========================================================
   SITE PERMITS
========================================================= */

export const sitePermits = pgTable(
  "bb_site_permit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    siteId: text("siteId")
      .notNull()
      .references(() => sites.id, { onDelete: "cascade" }),

    permitNumber: text("permitNumber").notNull(),

    regulator: text("regulator")
      .$type<PermitRegulator>()
      .notNull(),

    authorisationType: text("authorisationType")
      .$type<PermitAuthorisationType>()
      .notNull(),

    status: text("status")
      .$type<PermitStatus>()
      .notNull()
      .default("active"),

    isPrimary: boolean("isPrimary").notNull().default(true),

    validFrom: timestamp("validFrom", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),

    documentKey: text("documentKey"),
    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("site_permit_org_idx").on(table.organisationId),
    siteIdx: index("site_permit_site_idx").on(table.siteId),
    permitIdx: index("site_permit_number_idx").on(table.permitNumber),
    statusIdx: index("site_permit_status_idx").on(table.status),
    sitePermitUnique: uniqueIndex("site_permit_site_number_unique").on(
      table.siteId,
      table.permitNumber,
    ),
  }),
);

export const permitEwcCodes = pgTable(
  "bb_permit_ewc_code",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    permitId: text("permitId")
      .notNull()
      .references(() => sitePermits.id, { onDelete: "cascade" }),

    ewcCodeId: text("ewcCodeId")
      .notNull()
      .references(() => ewcCodes.id, { onDelete: "restrict" }),

    isActive: boolean("isActive").notNull().default(true),

    configuredByUserId: text("configuredByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.permitId, table.ewcCodeId] }),
    orgIdx: index("permit_ewc_org_idx").on(table.organisationId),
    permitIdx: index("permit_ewc_permit_idx").on(table.permitId),
    ewcIdx: index("permit_ewc_code_idx").on(table.ewcCodeId),
  }),
);

/* =========================================================
   COUNTERPARTIES
   ---------------------------------------------------------
   One business record can act as a client, producer, haulier,
   receiver, third-party tip, supplier, broker or dealer.
========================================================= */

export const counterparties = pgTable(
  "bb_counterparty",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    accountReference: text("accountReference"),

    email: text("email"),
    telephone: text("telephone"),

    fullAddress: text("fullAddress"),
    postcode: text("postcode"),

    carrierRegistrationNumber: text("carrierRegistrationNumber"),
    brokerDealerRegistrationNumber: text("brokerDealerRegistrationNumber"),

    paymentTermsDays: integer("paymentTermsDays"),

    notes: text("notes"),

    isActive: boolean("isActive").notNull().default(true),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("counterparty_org_idx").on(table.organisationId),
    nameIdx: index("counterparty_name_idx").on(table.name),
    carrierRegIdx: index("counterparty_carrier_reg_idx").on(
      table.carrierRegistrationNumber,
    ),
    activeIdx: index("counterparty_active_idx").on(table.isActive),
    accountReferenceUnique: uniqueIndex(
      "counterparty_org_account_reference_unique",
    ).on(table.organisationId, table.accountReference),
  }),
);

export const counterpartyRoles = pgTable(
  "bb_counterparty_role",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    counterpartyId: text("counterpartyId")
      .notNull()
      .references(() => counterparties.id, { onDelete: "cascade" }),

    role: text("role")
      .$type<CounterpartyRole>()
      .notNull(),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.counterpartyId, table.role] }),
    orgIdx: index("counterparty_role_org_idx").on(table.organisationId),
    roleIdx: index("counterparty_role_role_idx").on(table.role),
  }),
);

export const counterpartySites = pgTable(
  "bb_counterparty_site",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    counterpartyId: text("counterpartyId")
      .notNull()
      .references(() => counterparties.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    siteType: text("siteType")
      .$type<CounterpartySiteType>()
      .notNull()
      .default("customer_site"),

    fullAddress: text("fullAddress"),
    postcode: text("postcode"),

    contactName: text("contactName"),
    contactEmail: text("contactEmail"),
    contactTelephone: text("contactTelephone"),

    /*
      Useful for third-party receiving/tipping sites.
      Waste X does not assume this is verified unless a separate
      verification process confirms it.
    */
    authorisationNumber: text("authorisationNumber"),

    isDefault: boolean("isDefault").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("counterparty_site_org_idx").on(table.organisationId),
    counterpartyIdx: index("counterparty_site_counterparty_idx").on(
      table.counterpartyId,
    ),
    typeIdx: index("counterparty_site_type_idx").on(table.siteType),
    activeIdx: index("counterparty_site_active_idx").on(table.isActive),
    counterpartyNameUnique: uniqueIndex(
      "counterparty_site_counterparty_name_unique",
    ).on(table.counterpartyId, table.name),
  }),
);


/* =========================================================
   THIRD-PARTY FACILITY AUTHORISATIONS
   ---------------------------------------------------------
   External waste facilities are operated by counterparties.
   Their environmental authorisations are separate from the
   Waste X organisation's own sitePermits.
========================================================= */

export const counterpartySiteAuthorisations = pgTable(
  "bb_counterparty_site_authorisation",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    counterpartySiteId: text("counterpartySiteId")
      .notNull()
      .references(() => counterpartySites.id, { onDelete: "cascade" }),

    authorisationNumber: text("authorisationNumber").notNull(),

    regulator: text("regulator")
      .$type<PermitRegulator>()
      .notNull(),

    authorisationType: text("authorisationType")
      .$type<PermitAuthorisationType>()
      .notNull(),

    status: text("status")
      .$type<PermitStatus>()
      .notNull()
      .default("unknown"),

    isPrimary: boolean("isPrimary").notNull().default(true),

    validFrom: timestamp("validFrom", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),

    verificationSource: text("verificationSource"),
    verifiedAt: timestamp("verifiedAt", { mode: "date" }),

    documentKey: text("documentKey"),
    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("counterparty_site_auth_org_idx").on(table.organisationId),
    siteIdx: index("counterparty_site_auth_site_idx").on(table.counterpartySiteId),
    numberIdx: index("counterparty_site_auth_number_idx").on(table.authorisationNumber),
    statusIdx: index("counterparty_site_auth_status_idx").on(table.status),
    siteNumberUnique: uniqueIndex("counterparty_site_auth_site_number_unique").on(
      table.counterpartySiteId,
      table.authorisationNumber,
    ),
  }),
);

export const counterpartySiteEwcCodes = pgTable(
  "bb_counterparty_site_ewc_code",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    authorisationId: text("authorisationId")
      .notNull()
      .references(() => counterpartySiteAuthorisations.id, { onDelete: "cascade" }),

    ewcCodeId: text("ewcCodeId")
      .notNull()
      .references(() => ewcCodes.id, { onDelete: "restrict" }),

    isActive: boolean("isActive").notNull().default(true),

    configuredByUserId: text("configuredByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.authorisationId, table.ewcCodeId] }),
    orgIdx: index("counterparty_site_ewc_org_idx").on(table.organisationId),
    authIdx: index("counterparty_site_ewc_auth_idx").on(table.authorisationId),
    ewcIdx: index("counterparty_site_ewc_code_idx").on(table.ewcCodeId),
  }),
);

/* =========================================================
   DRIVERS / VEHICLES
========================================================= */

export const drivers = pgTable(
  "bb_driver",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      Nullable so the organisation can also store its own drivers.
      When set, this is normally a counterparty with the haulier role.
    */
    haulierCounterpartyId: text("haulierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    name: text("name").notNull(),
    telephone: text("telephone"),
    email: text("email"),

    defaultVehicleId: text("defaultVehicleId").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("driver_org_idx").on(table.organisationId),
    haulierIdx: index("driver_haulier_idx").on(table.haulierCounterpartyId),
    defaultVehicleIdx: index("driver_default_vehicle_idx").on(
      table.defaultVehicleId,
    ),
    activeIdx: index("driver_active_idx").on(table.isActive),
  }),
);

export const vehicles = pgTable(
  "bb_vehicle",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    haulierCounterpartyId: text("haulierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    registrationNumber: text("registrationNumber").notNull(),

    vehicleType: text("vehicleType"),

    /*
      Stored in kilograms internally for consistency.
      It is optional because not every site relies on stored tare.
    */
    tareWeightKg: numeric("tareWeightKg", {
      precision: 14,
      scale: 3,
    }),

    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("vehicle_org_idx").on(table.organisationId),
    haulierIdx: index("vehicle_haulier_idx").on(table.haulierCounterpartyId),
    activeIdx: index("vehicle_active_idx").on(table.isActive),
    registrationUnique: uniqueIndex("vehicle_org_registration_unique").on(
      table.organisationId,
      table.registrationNumber,
    ),
  }),
);

/* =========================================================
   MATERIAL / WASTE PROFILES
   ---------------------------------------------------------
   This is the main "enter once, reuse everywhere" layer.
========================================================= */

export const materialProfiles = pgTable(
  "bb_material_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      Null = organisation-wide profile.
      Set = profile is specific to one Waste X operated site.
    */
    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    name: text("name").notNull(),

    ewcCodeId: text("ewcCodeId")
      .notNull()
      .references(() => ewcCodes.id, { onDelete: "restrict" }),

    wasteDescription: text("wasteDescription").notNull(),

    physicalForm: text("physicalForm")
      .$type<"Gas" | "Liquid" | "Solid" | "Powder" | "Sludge" | "Mixed">()
      .notNull(),

    defaultNumberOfContainers: integer("defaultNumberOfContainers")
      .notNull()
      .default(1),

    defaultContainerType: text("defaultContainerType").notNull(),

    containsPops: boolean("containsPops").notNull().default(false),
    popsSourceOfComponents: text("popsSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),
    popsComponents: text("popsComponents"),

    containsHazardous: boolean("containsHazardous")
      .notNull()
      .default(false),

    hazardousSourceOfComponents: text("hazardousSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),
    hazardousHazCodes: text("hazardousHazCodes"),
    hazardousComponents: text("hazardousComponents"),

    defaultDisposalRecoveryCodeId: text(
      "defaultDisposalRecoveryCodeId",
    ).references(() => disposalRecoveryCodes.id, {
      onDelete: "set null",
    }),

    defaultWeightMetric: text("defaultWeightMetric")
      .$type<"Grams" | "Kilograms" | "Tonnes">()
      .notNull()
      .default("Tonnes"),

    isFavourite: boolean("isFavourite").notNull().default(false),
    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("material_profile_org_idx").on(table.organisationId),
    siteIdx: index("material_profile_site_idx").on(table.siteId),
    ewcIdx: index("material_profile_ewc_idx").on(table.ewcCodeId),
    activeIdx: index("material_profile_active_idx").on(table.isActive),
    favouriteIdx: index("material_profile_favourite_idx").on(table.isFavourite),
    orgNameUnique: uniqueIndex("material_profile_org_name_unique").on(
      table.organisationId,
      table.name,
    ),
  }),
);

/* =========================================================
   COMMERCIAL RATES
========================================================= */

export const rates = pgTable(
  "bb_rate",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    rateType: text("rateType")
      .$type<CommercialRateType>()
      .notNull(),

    unit: text("unit")
      .$type<CommercialRateUnit>()
      .notNull(),

    amount: numeric("amount", {
      precision: 14,
      scale: 2,
    }).notNull(),

    currency: text("currency").notNull().default("GBP"),

    counterpartyId: text("counterpartyId").references(() => counterparties.id, {
      onDelete: "cascade",
    }),

    counterpartySiteId: text("counterpartySiteId").references(
      () => counterpartySites.id,
      { onDelete: "cascade" },
    ),

    ownSiteId: text("ownSiteId").references(() => sites.id, {
      onDelete: "cascade",
    }),

    materialProfileId: text("materialProfileId").references(
      () => materialProfiles.id,
      { onDelete: "cascade" },
    ),

    effectiveFrom: timestamp("effectiveFrom", { mode: "date" }),
    effectiveTo: timestamp("effectiveTo", { mode: "date" }),

    isActive: boolean("isActive").notNull().default(true),

    notes: text("notes"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("rate_org_idx").on(table.organisationId),
    typeIdx: index("rate_type_idx").on(table.rateType),
    counterpartyIdx: index("rate_counterparty_idx").on(table.counterpartyId),
    materialIdx: index("rate_material_idx").on(table.materialProfileId),
    activeIdx: index("rate_active_idx").on(table.isActive),
  }),
);

/* =========================================================
   JOB TEMPLATES
========================================================= */

export const jobTemplates = pgTable(
  "bb_job_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),

    direction: text("direction")
      .$type<JobDirection>()
      .notNull()
      .default("incoming"),

    clientCounterpartyId: text("clientCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    clientSiteId: text("clientSiteId").references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    ownSiteId: text("ownSiteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    sitePermitId: text("sitePermitId").references(() => sitePermits.id, {
      onDelete: "set null",
    }),

    thirdPartyDestinationSiteId: text(
      "thirdPartyDestinationSiteId",
    ).references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    haulierCounterpartyId: text("haulierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    driverId: text("driverId").references(() => drivers.id, {
      onDelete: "set null",
    }),

    vehicleId: text("vehicleId").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    materialProfileId: text("materialProfileId").references(
      () => materialProfiles.id,
      { onDelete: "set null" },
    ),

    rateId: text("rateId").references(() => rates.id, {
      onDelete: "set null",
    }),

    plannedLoads: integer("plannedLoads").notNull().default(1),

    defaultCustomerReference: text("defaultCustomerReference"),
    notes: text("notes"),

    isActive: boolean("isActive").notNull().default(true),

    lastUsedAt: timestamp("lastUsedAt", { mode: "date" }),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_template_org_idx").on(table.organisationId),
    clientIdx: index("job_template_client_idx").on(table.clientCounterpartyId),
    ownSiteIdx: index("job_template_own_site_idx").on(table.ownSiteId),
    sitePermitIdx: index("job_template_site_permit_idx").on(table.sitePermitId),
    activeIdx: index("job_template_active_idx").on(table.isActive),
    orgNameUnique: uniqueIndex("job_template_org_name_unique").on(
      table.organisationId,
      table.name,
    ),
  }),
);

/* =========================================================
   JOBS
   ---------------------------------------------------------
   Jobs are the planned/commercial unit.
   They are NOT carrier assignments.
========================================================= */

export const jobs = pgTable(
  "bb_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    jobNumber: text("jobNumber").notNull(),

    source: text("source")
      .$type<JobSource>()
      .notNull()
      .default("manual"),

    direction: text("direction")
      .$type<JobDirection>()
      .notNull()
      .default("incoming"),

    status: text("status")
      .$type<JobStatus>()
      .notNull()
      .default("booked"),

    jobDate: timestamp("jobDate", { mode: "date" }).notNull(),

    clientCounterpartyId: text("clientCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    clientSiteId: text("clientSiteId").references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    /*
      The Waste X customer's own site handling the job.
      For incoming jobs this is normally the receiving site.
    */
    ownSiteId: text("ownSiteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    sitePermitId: text("sitePermitId").references(() => sitePermits.id, {
      onDelete: "set null",
    }),

    thirdPartyDestinationSiteId: text(
      "thirdPartyDestinationSiteId",
    ).references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    haulierCounterpartyId: text("haulierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    driverId: text("driverId").references(() => drivers.id, {
      onDelete: "set null",
    }),

    vehicleId: text("vehicleId").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    materialProfileId: text("materialProfileId").references(
      () => materialProfiles.id,
      { onDelete: "set null" },
    ),

    plannedLoads: integer("plannedLoads").notNull().default(1),

    purchaseOrder: text("purchaseOrder"),
    customerReference: text("customerReference"),

    /*
      Customer billing marker for the Solo Workspace.

      Important: bb_invoice / bb_payment are platform subscription billing
      records. They are NOT customer job invoices. Stage 6 deliberately keeps
      customer invoicing lightweight and external-accounting friendly.
    */
    customerInvoiceReference: text("customerInvoiceReference"),
    customerInvoicedAt: timestamp("customerInvoicedAt", { mode: "date" }),

    rateId: text("rateId").references(() => rates.id, {
      onDelete: "set null",
    }),

    notes: text("notes"),

    sourceTemplateId: text("sourceTemplateId").references(
      () => jobTemplates.id,
      { onDelete: "set null" },
    ),

    /*
      Marketplace remains available, but is only one possible source of a job.
    */
    marketplaceListingId: integer("marketplaceListingId").references(
      () => wasteListings.id,
      { onDelete: "set null" },
    ),

    /*
      Backwards-compatible bridge only.
      New Solo jobs do not require carrierAssignments.
    */
    legacyAssignmentId: text("legacyAssignmentId").references(
      () => carrierAssignments.id,
      { onDelete: "set null" },
    ),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    completedAt: timestamp("completedAt", { mode: "date" }),
    cancelledAt: timestamp("cancelledAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_org_idx").on(table.organisationId),
    dateIdx: index("job_date_idx").on(table.jobDate),
    statusIdx: index("job_status_idx").on(table.status),
    clientIdx: index("job_client_idx").on(table.clientCounterpartyId),
    customerInvoicedIdx: index("job_customer_invoiced_idx").on(
      table.organisationId,
      table.customerInvoicedAt,
    ),
    ownSiteIdx: index("job_own_site_idx").on(table.ownSiteId),
    sitePermitIdx: index("job_site_permit_idx").on(table.sitePermitId),
    sourceIdx: index("job_source_idx").on(table.source),
    marketplaceListingIdx: index("job_marketplace_listing_idx").on(
      table.marketplaceListingId,
    ),
    orgJobNumberUnique: uniqueIndex("job_org_job_number_unique").on(
      table.organisationId,
      table.jobNumber,
    ),
  }),
);

/* =========================================================
   JOB LOADS / MOVEMENTS
   ---------------------------------------------------------
   This is the factual operational transaction.

   Jobs can have many loads.
   DWT receipts attach to a load, not to a carrier assignment.
========================================================= */

export const jobLoads = pgTable(
  "bb_job_load",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    jobId: text("jobId")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),

    loadNumber: integer("loadNumber").notNull(),

    status: text("status")
      .$type<JobLoadStatus>()
      .notNull()
      .default("planned"),

    direction: text("direction")
      .$type<JobDirection>()
      .notNull()
      .default("incoming"),

    movementAt: timestamp("movementAt", { mode: "date" }),
    receivedAt: timestamp("receivedAt", { mode: "date" }),

    /*
      Actual parties/sites used for this load.
      These are copied from job defaults when the load is created,
      but may be changed for the actual movement.
    */
    clientCounterpartyId: text("clientCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    clientSiteId: text("clientSiteId").references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    ownSiteId: text("ownSiteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    sitePermitId: text("sitePermitId").references(() => sitePermits.id, {
      onDelete: "set null",
    }),

    thirdPartyDestinationSiteId: text(
      "thirdPartyDestinationSiteId",
    ).references(() => counterpartySites.id, {
      onDelete: "set null",
    }),

    haulierCounterpartyId: text("haulierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    driverId: text("driverId").references(() => drivers.id, {
      onDelete: "set null",
    }),

    vehicleId: text("vehicleId").references(() => vehicles.id, {
      onDelete: "set null",
    }),

    materialProfileId: text("materialProfileId").references(
      () => materialProfiles.id,
      { onDelete: "set null" },
    ),

    /*
      Material snapshot.
      This deliberately duplicates critical values so later edits to a
      Material Profile do not rewrite what actually happened.
    */
    ewcCodeId: text("ewcCodeId").references(() => ewcCodes.id, {
      onDelete: "set null",
    }),

    ewcCodeSnapshot: text("ewcCodeSnapshot"),
    wasteDescriptionSnapshot: text("wasteDescriptionSnapshot"),

    physicalFormSnapshot: text("physicalFormSnapshot").$type<
      "Gas" | "Liquid" | "Solid" | "Powder" | "Sludge" | "Mixed"
    >(),

    numberOfContainers: integer("numberOfContainers"),
    containerTypeSnapshot: text("containerTypeSnapshot"),

    containsPops: boolean("containsPops").notNull().default(false),
    popsSourceOfComponents: text("popsSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),
    popsComponents: text("popsComponents"),

    containsHazardous: boolean("containsHazardous")
      .notNull()
      .default(false),

    hazardousSourceOfComponents: text("hazardousSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),
    hazardousHazCodes: text("hazardousHazCodes"),
    hazardousComponents: text("hazardousComponents"),

    disposalRecoveryCodeId: text("disposalRecoveryCodeId").references(
      () => disposalRecoveryCodes.id,
      { onDelete: "set null" },
    ),

    disposalRecoveryCodeSnapshot: text("disposalRecoveryCodeSnapshot"),

    /*
      Weight capture.
      The MVP supports manual entry; weighbridge/imported are future-safe.
    */
    grossWeight: numeric("grossWeight", {
      precision: 14,
      scale: 3,
    }),

    tareWeight: numeric("tareWeight", {
      precision: 14,
      scale: 3,
    }),

    netWeight: numeric("netWeight", {
      precision: 14,
      scale: 3,
    }),

    weightMetric: text("weightMetric")
      .$type<"Grams" | "Kilograms" | "Tonnes">()
      .notNull()
      .default("Tonnes"),

    weightIsEstimate: boolean("weightIsEstimate").notNull().default(false),

    weightSource: text("weightSource")
      .$type<WeightSource>()
      .notNull()
      .default("manual"),

    /*
      TRANSPORT CARBON INTELLIGENCE
      -----------------------------
      Carbon is calculated from the factual Job Load, not from the Job plan.

      Waste X stores the calculation inputs and factor snapshot on the Load so
      later factor updates never silently rewrite historical reporting.

      MVP method:
        tonnes moved × movement distance km × kg CO2e / tonne-km factor

      This is an estimated transport-emissions allocation only. It is NOT a
      complete organisational carbon footprint or full Scope 1/2/3 inventory.
    */
    transportDistanceKm: numeric("transportDistanceKm", {
      precision: 14,
      scale: 3,
    }),

    transportDistanceSource: text("transportDistanceSource").$type<
      "measured" | "estimated" | "customer_provided"
    >(),

    transportCarbonMethod: text("transportCarbonMethod").$type<"tonne_km">(),

    transportCarbonFactorKgPerTonneKm: numeric(
      "transportCarbonFactorKgPerTonneKm",
      {
        precision: 14,
        scale: 6,
      },
    ),

    transportCarbonFactorSource: text("transportCarbonFactorSource"),

    transportCarbonFactorYear: integer("transportCarbonFactorYear"),

    transportCo2eKg: numeric("transportCo2eKg", {
      precision: 14,
      scale: 3,
    }),

    transportCarbonCalculatedAt: timestamp("transportCarbonCalculatedAt", {
      mode: "date",
    }),

    ticketNumber: text("ticketNumber"),
    purchaseOrder: text("purchaseOrder"),
    customerReference: text("customerReference"),

    /*
      Commercial snapshots.
      Rates may later change; completed loads retain the values used.
    */
    customerChargeAmount: numeric("customerChargeAmount", {
      precision: 14,
      scale: 2,
    }),

    customerChargeUnit: text("customerChargeUnit").$type<CommercialRateUnit>(),

    haulageCostAmount: numeric("haulageCostAmount", {
      precision: 14,
      scale: 2,
    }),

    haulageCostUnit: text("haulageCostUnit").$type<CommercialRateUnit>(),

    tippingCostAmount: numeric("tippingCostAmount", {
      precision: 14,
      scale: 2,
    }),

    tippingCostUnit: text("tippingCostUnit").$type<CommercialRateUnit>(),

    currency: text("currency").notNull().default("GBP"),

    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    completedAt: timestamp("completedAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("job_load_org_idx").on(table.organisationId),
    jobIdx: index("job_load_job_idx").on(table.jobId),
    statusIdx: index("job_load_status_idx").on(table.status),
    movementAtIdx: index("job_load_movement_at_idx").on(table.movementAt),
    receivedAtIdx: index("job_load_received_at_idx").on(table.receivedAt),
    ownSiteIdx: index("job_load_own_site_idx").on(table.ownSiteId),
    sitePermitIdx: index("job_load_site_permit_idx").on(table.sitePermitId),
    haulierIdx: index("job_load_haulier_idx").on(
      table.haulierCounterpartyId,
    ),
    materialIdx: index("job_load_material_idx").on(table.materialProfileId),
    ticketIdx: index("job_load_ticket_idx").on(table.ticketNumber),
    jobLoadNumberUnique: uniqueIndex("job_load_job_number_unique").on(
      table.jobId,
      table.loadNumber,
    ),
  }),
);


export const invoices = pgTable(
  "bb_invoice",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    amount: integer("amount").notNull(),

    currency: text("currency").default("GBP"),

    status: text("status")
      .$type<"pending" | "paid" | "failed" | "refunded">()
      .notNull()
      .default("pending"),

    stripeInvoiceId: text("stripeInvoiceId"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    paidAt: timestamp("paidAt", { mode: "date" }),
  },
  (table) => ({
    orgIdx: index("invoice_org_idx").on(table.organisationId),
  }),
);

export const payments = pgTable(
  "bb_payment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    invoiceId: text("invoiceId")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),

    stripePaymentIntentId: text("stripePaymentIntentId"),

    amount: integer("amount").notNull(),

    status: text("status")
      .$type<"succeeded" | "failed" | "pending">()
      .notNull(),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    invoiceIdx: index("payment_invoice_idx").on(table.invoiceId),
  }),
);

/*
  LEGACY chain/network event stream.
  New Solo Workspace operational history should use jobs, jobLoads
  and auditEvents rather than depending on actorRole/assignment state.
*/
export const wasteEvents = pgTable(
  "bb_waste_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // 🔗 TENANT
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    // 🔗 CONTEXT
    listingId: integer("listingId").references(() => wasteListings.id, {
      onDelete: "set null",
    }),

    carrierAssignmentId: text("carrierAssignmentId").references(
      () => carrierAssignments.id,
      { onDelete: "set null" },
    ),

    // 👤 USER
    performedByUserId: text("performedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    // 🔥 EVENT TYPE
    eventType: text("eventType")
      .$type<
        | "WASTE_CREATED"
        | "TRANSFER_ASSIGNED"
        | "TRANSFER_ACCEPTED"
        | "WASTE_COLLECTED"
        | "WASTE_RECEIVED"
        | "WASTE_MOVED_INTERNAL"
        | "WASTE_PROCESSED"
        | "WASTE_DISPOSED"
      >()
      .notNull(),

    // 🧠 ACTOR
    actorOrganisationId: text("actorOrganisationId").notNull(),
    actorRole: text("actorRole")
      .$type<"generator" | "carrier" | "manager">()
      .notNull(),

    // 🎯 TARGET (optional)
    targetOrganisationId: text("targetOrganisationId"),

    // 📍 SITE (future-proof)
    siteId: text("siteId"),

    // 📦 SNAPSHOT
    wasteType: text("wasteType"),
    wasteQuantity: integer("wasteQuantity"),

    // 📦 FLEXIBLE DATA
    metadata: text("metadata"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("waste_event_org_idx").on(table.organisationId),
    listingIdx: index("waste_event_listing_idx").on(table.listingId),
    typeIdx: index("waste_event_type_idx").on(table.eventType),
    createdIdx: index("waste_event_created_idx").on(table.createdAt),
  }),
);
/* =========================================================
   USERS
========================================================= */

export const users = pgTable(
  "bb_user",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: timestamp("emailVerified", { mode: "date" }),
    image: text("image"),

    passwordHash: text("passwordHash"),

    organisationId: text("organisationId").references(() => organisations.id, {
      onDelete: "cascade",
    }),

    /*
      LEGACY / future network workspace only.
      Solo Workspace must not require departmentId.
    */
    departmentId: text("departmentId"),

    activeSessionToken: text("activeSessionToken"),
activeSessionStartedAt: timestamp("activeSessionStartedAt"),
lastSeenAt: timestamp("lastSeenAt"),

    /*
      Application access role.
      Legacy employee/seniorManagement values are retained for migration
      compatibility. New Solo Workspace screens should use:
      administrator | operations | accounts | read_only.
    */
    role: text("role")
      .$type<
        | "administrator"
        | "operations"
        | "accounts"
        | "read_only"
        | "employee"
        | "seniorManagement"
        | "platform_admin"
      >()
      .notNull()
      .default("operations"),
      soloAccessPreset: text("soloAccessPreset").$type<
  | "administrator"
  | "management"
  | "operations"
  | "compliance"
  | "accounts"
  | "read_only"
  | "custom"
>(),

    isActive: boolean("isActive").notNull().default(true),
    isSuspended: boolean("isSuspended").notNull().default(false),

    lastLoginAt: timestamp("lastLoginAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    inviteToken: text("inviteToken"),
    inviteExpiry: timestamp("inviteExpiry", { mode: "date" }),
    status: text("status")
      .$type<"INVITED" | "ACTIVE" | "SUSPENDED">()
      .notNull()
      .default("INVITED"),
  },
  (table) => ({
    emailIdx: uniqueIndex("user_email_unique").on(table.email),
    orgIdx: index("user_org_idx").on(table.organisationId),
    roleIdx: index("user_role_idx").on(table.role),
  }),

);

/* =========================================================
   SOLO USER PERMISSIONS
========================================================= */

export const userPermissions = pgTable(
  "bb_user_permission",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, {
        onDelete: "cascade",
      }),

    userId: text("userId")
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
      }),

    permission: text("permission").notNull(),

    effect: text("effect")
      .$type<"allow" | "deny">()
      .notNull(),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", {
      mode: "date",
    }).defaultNow(),

    updatedAt: timestamp("updatedAt", {
      mode: "date",
    }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [
        table.userId,
        table.permission,
      ],
    }),

    orgIdx: index("user_permission_org_idx").on(
      table.organisationId,
    ),

    userIdx: index("user_permission_user_idx").on(
      table.userId,
    ),

    permissionIdx: index(
      "user_permission_permission_idx",
    ).on(table.permission),
  }),
);

/* =========================================================
   USER PROFILES
========================================================= */

export const userProfiles = pgTable(
  "bb_user_profile",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    profilePicture: text("profilePicture"),

    fullName: text("fullName").notNull(),
    telephone: text("telephone"),
    emailAddress: text("emailAddress"),

    country: text("country"),
    streetAddress: text("streetAddress"),
    city: text("city"),
    region: text("region"),
    postCode: text("postCode"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    userUnique: uniqueIndex("user_profile_unique").on(table.userId),
  }),
);

/* =========================================================
   PASSWORD RESET TOKENS
========================================================= */

export const passwordResetTokens = pgTable(
  "bb_passwordResetToken",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    token: text("token").notNull(),
    email: text("email").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
    used: boolean("used").notNull().default(false),
  },
  (table) => ({
    tokenIdx: uniqueIndex("password_token_unique").on(table.token),
  }),
);

/* =========================================================
   NEXTAUTH TABLES
========================================================= */

export const accounts = pgTable(
  "bb_account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),

    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  }),
);

export const sessions = pgTable("bb_session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "bb_verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  }),
);

/* =========================================================
   WASTE LISTINGS
========================================================= */

export const wasteListings = pgTable("bb_waste_listing", {
  id: serial("id").primaryKey(),

  /* ===============================
     OWNERSHIP
  ============================== */

  userId: text("userId").notNull(),
    siteId: text("siteId").references(() => sites.id, {
    onDelete: "set null",
  }),
  organisationId: text("organisationId").notNull(),

  /* ===============================
     CORE BEHAVIOUR
  ============================== */

  participationMode: text("participationMode")
    .$type<"internal" | "external" | "mixed">()
    .notNull()
    .default("external"),

  marketMode: text("market_mode") // keep this as-is (you already had it)
    .$type<"open_market" | "direct_award" | "internal_only" | "hybrid">()
    .notNull()
    .default("open_market"),

  listingType: text("listing_type")
    .$type<"waste_collection" | "material_sale" | "internal_transfer">()
    .notNull(),

  visibility: text("visibility")
    .$type<"public" | "private" | "restricted">()
    .default("public"),

  /* ===============================
     ACCESS CONTROL
  ============================== */

  allowedCarrierIds: text("allowedCarrierIds"),

  /* ===============================
     ASSIGNMENT
  ============================== */

  assignmentMethod: text("assignmentMethod").$type<"bid" | "direct">(),
  assignedCarrierDepartmentId: text("assignedCarrierDepartmentId"),
  assignedCarrierOrganisationId: text("assignedCarrierOrganisationId"),
  assignedByOrganisationId: text("assignedByOrganisationId"),
  assignedAt: timestamp("assignedAt"),

  winnerBidId: integer("winner_bid_id"),

  /* ===============================
     TEMPLATE
  ============================== */

  templateId: text("templateId").notNull(),
  templateVersion: integer("templateVersion").notNull(),
  dwtSnapshotJson: text("dwtSnapshotJson"),

  /* ===============================
     CORE DATA
  ============================== */

  name: text("name").notNull(),
  location: text("location").notNull(),

  startingPrice: integer("startingPrice").default(0),
  currentBid: integer("currentBid").default(0),

  fileKey: text("fileKey").notNull(),
  endDate: timestamp("endDate").notNull(),

  /* ===============================
     LIFECYCLE
  ============================== */

  archived: boolean("archived").default(false),

  status: text("status")
    .$type<"open" | "assigned" | "in_progress" | "completed" | "cancelled">()
    .default("open"),
    createdAt: timestamp("createdAt").defaultNow(),
},
(table) => ({
  orgIdx: index("waste_listing_org_idx").on(table.organisationId),
  siteIdx: index("waste_listing_site_idx").on(table.siteId),
  statusIdx: index("waste_listing_status_idx").on(table.status),
  createdIdx: index("waste_listing_created_idx").on(table.createdAt),
}));

/* =========================================================
   BIDS
========================================================= */

export const bids = pgTable(
  "bb_bids",
  {
    id: serial("id").primaryKey(),

    amount: integer("amount").notNull(),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),

    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    status: text("status")
      .$type<"active" | "accepted" | "rejected" | "withdrawn">()
      .notNull()
      .default("active"),

    timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),
  },
  (table) => ({
    listingIdx: index("bid_listing_idx").on(table.listingId),
    orgIdx: index("bid_org_idx").on(table.organisationId),
  }),
);

/* =========================================================
   CARRIER ASSIGNMENTS — LEGACY / FUTURE NETWORK MODEL
   ---------------------------------------------------------
   Retained for Marketplace / future Generator & Carrier phases.
   The active Solo Workspace must not require this table.
========================================================= */

export const carrierAssignments = pgTable(
  "bb_carrier_assignment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /*
      organisationId = owning/generator-side organisation context.
      Keep this for backwards compatibility with your existing internal flow.
    */
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),


          siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    jobSource: text("jobSource")
      .$type<CarrierAssignmentJobSource>()
      .notNull()
      .default("wastex_marketplace"),

    externalCustomerName: text("externalCustomerName"),
    externalCustomerEmail: text("externalCustomerEmail"),
    externalCustomerPhone: text("externalCustomerPhone"),
    externalReference: text("externalReference"),

    externalPickupAddress: text("externalPickupAddress"),
    externalPickupPostcode: text("externalPickupPostcode"),

    externalDestinationName: text("externalDestinationName"),
    externalDestinationAddress: text("externalDestinationAddress"),
    externalDestinationPostcode: text("externalDestinationPostcode"),

    externalWasteDescription: text("externalWasteDescription"),
    externalEwcCode: text("externalEwcCode"),
    externalEstimatedWeight: numeric("externalEstimatedWeight", {
      precision: 14,
      scale: 3,
    }),

    externalCollectionDate: timestamp("externalCollectionDate", {
      mode: "date",
    }),

    externalNotes: text("externalNotes"),
    /*
      NEW EXTERNAL FLOW:
      Generator assigns manager first.
      Manager assigns carrier later.
      Therefore carrierOrganisationId MUST be nullable.
    */
    carrierOrganisationId: text("carrierOrganisationId").references(
      () => organisations.id,
      { onDelete: "cascade" },
    ),

    /*
      Organisation that originally assigned the work.
      Usually the generator organisation.
    */
    assignedByOrganisationId: text("assignedByOrganisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      Waste manager organisation.
      This is populated when a manager wins/is assigned a listing.
    */
    managerOrganisationId: text("managerOrganisationId").references(
      () => organisations.id,
      { onDelete: "cascade" },
    ),

    assignmentMethod: text("assignmentMethod")
      .$type<"bid" | "direct">()
      .notNull(),

    bidId: integer("bidId").references(() => bids.id),

    /*
      External manager-first flow:

      accepted
        → manager accepted, now manager needs to assign carrier

      carrier_pending
        → carrier has been assigned, waiting for carrier response

      in_progress
        → carrier accepted / collection underway

      completed
        → job complete

      rejected/cancelled
        → stopped
    */
    status: text("status")
      .$type<
        | "pending"
        | "accepted"
        | "in_progress"
        | "completed"
        | "rejected"
        | "cancelled"
      >()
      .notNull()
      .default("pending"),

    verificationCode: text("verificationCode"),
    codeGeneratedAt: timestamp("codeGeneratedAt", { mode: "date" }),
    codeUsedAt: timestamp("codeUsedAt", { mode: "date" }),

    managerAcceptedAt: timestamp("managerAcceptedAt", { mode: "date" }),

    carrierAssignedAt: timestamp("carrierAssignedAt", { mode: "date" }),

    assignedAt: timestamp("assignedAt", { mode: "date" }).defaultNow(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),
    collectedAt: timestamp("collectedAt", { mode: "date" }),
    completedAt: timestamp("completedAt", { mode: "date" }),
  },
  (table) => ({
    listingIdx: index("carrier_listing_idx").on(table.listingId),

    carrierIdx: index("carrier_org_idx").on(table.carrierOrganisationId),

    managerIdx: index("assignment_manager_org_idx").on(
      table.managerOrganisationId,
    ),

    orgIdx: index("carrier_assignment_org_idx").on(table.organisationId),

    assignedByIdx: index("assignment_assigned_by_org_idx").on(
      table.assignedByOrganisationId,
    ),
    siteIdx: index("carrier_assignment_site_idx").on(table.siteId),

    jobSourceIdx: index("carrier_assignment_job_source_idx").on(
      table.jobSource,
    ),

    externalCollectionDateIdx: index(
      "carrier_assignment_external_collection_date_idx",
    ).on(table.externalCollectionDate),
  }),
);

/* =========================================================
   INCIDENTS
========================================================= */

export const incidents = pgTable(
  "bb_incident",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    assignmentId: text("assignmentId")
      .notNull()
      .references(() => carrierAssignments.id, { onDelete: "cascade" }),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),

    reportedByUserId: text("reportedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    reportedByOrganisationId: text("reportedByOrganisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    incidentDate: timestamp("incidentDate", { mode: "date" }),
    incidentLocation: text("incidentLocation"),

    type: text("type").notNull(),
    summary: text("summary").notNull(),

    immediateAction: text("immediateAction"),
    investigationFindings: text("investigationFindings"),
    correctiveActions: text("correctiveActions"),
    preventativeMeasures: text("preventativeMeasures"),
    complianceReview: text("complianceReview"),

    responsiblePerson: text("responsiblePerson"),
    dateClosed: timestamp("dateClosed", { mode: "date" }),

    status: text("status")
      .$type<"open" | "under_review" | "resolved" | "rejected">()
      .notNull()
      .default("open"),

    resolvedByUserId: text("resolvedByUserId").references(() => users.id),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    resolvedAt: timestamp("resolvedAt", { mode: "date" }),
  },
  (table) => ({
    statusIdx: index("incident_status_idx").on(table.status),
    assignmentIdx: index("incident_assignment_idx").on(table.assignmentId),
    listingIdx: index("incident_listing_idx").on(table.listingId),
    orgIdx: index("incident_org_idx").on(table.organisationId),
        siteIdx: index("incident_site_idx").on(table.siteId),
  }),
);

/* =========================================================
   DIGITAL WASTE TRACKING - ORGANISATION SETTINGS
========================================================= */

export const wasteTrackingOrganisationSettings = pgTable(
  "bb_waste_tracking_organisation_setting",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      This is the receiving organisation API code issued through
      the Waste Tracking Service registration/test programme.
      Do not store API secrets here.
    */
    apiCode: text("apiCode"),

    environment: text("environment")
      .$type<"test" | "production">()
      .notNull()
      .default("test"),

    isEnabled: boolean("isEnabled").notNull().default(false),

    /*
      Optional carrier defaults for organisations that transport waste
      themselves. These are used only when a Solo job load has no external
      haulierCounterpartyId. They do not replace external haulier records.
    */
    ownCarrierRegistrationNumber: text("ownCarrierRegistrationNumber"),

    ownCarrierReasonForNoRegistrationNumber: text(
      "ownCarrierReasonForNoRegistrationNumber",
    ).$type<"ON_SITE" | "HOUSEHOLD" | "ONE_OFF" | "MARINE">(),

    ownCarrierMeansOfTransport: text("ownCarrierMeansOfTransport")
      .$type<
        | "Road"
        | "Rail"
        | "Air"
        | "Sea"
        | "Inland Waterway"
        | "Piped"
        | "Other"
      >()
      .notNull()
      .default("Road"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgUnique: uniqueIndex("waste_tracking_org_setting_org_unique").on(
      table.organisationId,
    ),
    orgIdx: index("waste_tracking_org_setting_org_idx").on(
      table.organisationId,
    ),
    environmentIdx: index("waste_tracking_org_setting_environment_idx").on(
      table.environment,
    ),
  }),
);

/* =========================================================
   DIGITAL WASTE TRACKING - REFERENCE DATA CACHE
========================================================= */

export const wasteTrackingReferenceData = pgTable(
  "bb_waste_tracking_reference_data",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    type: text("type")
      .$type<
        | "ewc_codes"
        | "hazardous_property_codes"
        | "disposal_or_recovery_codes"
        | "container_types"
        | "pop_names"
      >()
      .notNull(),

    code: text("code").notNull(),

    description: text("description"),

    /*
      Used mainly for EWC codes.
      Example:
      170904 = non-hazardous
      170903 = hazardous
    */
    isHazardous: boolean("isHazardous"),

    /*
      Keep flexible reference fields here as a JSON string.
      Examples:
      - EWC chapter/subChapter/entryTypeDesc
      - POP chemicalName
      - disposal/recovery isNotRecoveryToFinalProduct
      - hazardous shortDesc/longDesc
    */
    metadata: text("metadata"),

    environment: text("environment")
      .$type<"test" | "production">()
      .notNull()
      .default("test"),

    isActive: boolean("isActive").notNull().default(true),

    syncedAt: timestamp("syncedAt", { mode: "date" }).defaultNow(),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    typeCodeEnvironmentUnique: uniqueIndex(
      "waste_tracking_reference_type_code_env_unique",
    ).on(table.type, table.code, table.environment),

    typeIdx: index("waste_tracking_reference_type_idx").on(table.type),
    codeIdx: index("waste_tracking_reference_code_idx").on(table.code),
    environmentIdx: index("waste_tracking_reference_environment_idx").on(
      table.environment,
    ),
  }),
);

/* =========================================================
   WASTE RECEIPTS
   Receiver-confirmed intake record before/alongside Defra submission.
========================================================= */

export const wasteReceipts = pgTable(
  "bb_waste_receipt",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      NEW SOLO WORKSPACE LINK
      -----------------------
      A receipt belongs to the actual load received.

      This is nullable during migration so historical marketplace receipts
      remain valid. New Solo Workspace receipt creation should require it.
    */
    jobLoadId: text("jobLoadId").references(() => jobLoads.id, {
      onDelete: "cascade",
    }),

    /*
      LEGACY / FUTURE NETWORK LINKS
      -----------------------------
      Retained so old marketplace/assignment receipts and future network
      flows continue to have a migration path.
    */
    assignmentId: text("assignmentId").references(() => carrierAssignments.id, {
      onDelete: "set null",
    }),

    listingId: integer("listingId").references(() => wasteListings.id, {
      onDelete: "set null",
    }),

    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    sitePermitId: text("sitePermitId").references(() => sitePermits.id, {
      onDelete: "set null",
    }),

    receivedByUserId: text("receivedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    /*
      Waste X organisation links remain useful where the carrier or receiver
      is also a Waste X organisation.
    */
    carrierOrganisationId: text("carrierOrganisationId").references(
      () => organisations.id,
      { onDelete: "set null" },
    ),

    receiverOrganisationId: text("receiverOrganisationId").references(
      () => organisations.id,
      { onDelete: "set null" },
    ),

    /*
      Solo Workspace master-data links.
      These allow ordinary clients/hauliers/brokers to exist without needing
      to be registered Waste X organisations.
    */
    carrierCounterpartyId: text("carrierCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    brokerDealerCounterpartyId: text("brokerDealerCounterpartyId").references(
      () => counterparties.id,
      { onDelete: "set null" },
    ),

    receivedAt: timestamp("receivedAt", { mode: "date" }),

    status: text("status")
      .$type<"draft" | "confirmed" | "submitted">()
      .notNull()
      .default("draft"),

    /*
      Movement-level compliance fields.
    */
    hazardousWasteConsignmentCode: text("hazardousWasteConsignmentCode"),

    reasonForNoConsignmentCode: text("reasonForNoConsignmentCode").$type<
      "NON_HAZ_WASTE_TRANSFER" | "NO_DOC_WITH_WASTE" | "HWRC_RECEIPT"
    >(),

    yourUniqueReference: text("yourUniqueReference"),

    /*
      JSON string array:
      [{ label: "PO Number", reference: "PO-12345" }]
    */
    otherReferencesForMovement: text("otherReferencesForMovement"),

    specialHandlingRequirements: text("specialHandlingRequirements"),

    /*
      Carrier snapshot at receipt time.
      This protects the legal/audit record if master data changes later.
    */
    carrierRegistrationNumber: text("carrierRegistrationNumber"),

    carrierReasonForNoRegistrationNumber: text(
      "carrierReasonForNoRegistrationNumber",
    ).$type<"ON_SITE" | "HOUSEHOLD" | "ONE_OFF" | "MARINE">(),

    carrierOrganisationName: text("carrierOrganisationName"),
    carrierFullAddress: text("carrierFullAddress"),
    carrierPostcode: text("carrierPostcode"),
    carrierEmailAddress: text("carrierEmailAddress"),
    carrierPhoneNumber: text("carrierPhoneNumber"),
    carrierVehicleRegistration: text("carrierVehicleRegistration"),

    carrierMeansOfTransport: text("carrierMeansOfTransport").$type<
      | "Road"
      | "Rail"
      | "Air"
      | "Sea"
      | "Inland Waterway"
      | "Piped"
      | "Other"
    >(),

    /*
      Optional broker/dealer snapshot.
    */
    brokerDealerOrganisationName: text("brokerDealerOrganisationName"),
    brokerDealerFullAddress: text("brokerDealerFullAddress"),
    brokerDealerPostcode: text("brokerDealerPostcode"),
    brokerDealerEmailAddress: text("brokerDealerEmailAddress"),
    brokerDealerPhoneNumber: text("brokerDealerPhoneNumber"),
    brokerDealerRegistrationNumber: text("brokerDealerRegistrationNumber"),

    /*
      Receiver/site snapshot at receipt time.
    */
    receiverSiteName: text("receiverSiteName"),
    receiverEmailAddress: text("receiverEmailAddress"),
    receiverPhoneNumber: text("receiverPhoneNumber"),
    receiverAuthorisationNumber: text("receiverAuthorisationNumber"),

    /*
      JSON string integer array:
      [343, 456, 789]
    */
    receiverRegulatoryPositionStatements: text(
      "receiverRegulatoryPositionStatements",
    ),

    receiptFullAddress: text("receiptFullAddress"),
    receiptPostcode: text("receiptPostcode"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("waste_receipt_org_idx").on(table.organisationId),
    jobLoadUnique: uniqueIndex("waste_receipt_job_load_unique").on(
      table.jobLoadId,
    ),
    jobLoadIdx: index("waste_receipt_job_load_idx").on(table.jobLoadId),
    siteIdx: index("waste_receipt_site_idx").on(table.siteId),
    sitePermitIdx: index("waste_receipt_site_permit_idx").on(
      table.sitePermitId,
    ),
    assignmentIdx: index("waste_receipt_assignment_idx").on(
      table.assignmentId,
    ),
    listingIdx: index("waste_receipt_listing_idx").on(table.listingId),
    carrierCounterpartyIdx: index(
      "waste_receipt_carrier_counterparty_idx",
    ).on(table.carrierCounterpartyId),
    statusIdx: index("waste_receipt_status_idx").on(table.status),
    receivedAtIdx: index("waste_receipt_received_at_idx").on(table.receivedAt),
  }),
);

/* =========================================================
   WASTE RECEIPT ITEMS
   Actual received waste items confirmed by the manager/receiver.
========================================================= */

export const wasteReceiptItems = pgTable(
  "bb_waste_receipt_item",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    receiptId: text("receiptId")
      .notNull()
      .references(() => wasteReceipts.id, { onDelete: "cascade" }),

    /*
      JSON string array of EWC codes:
      ["170904", "150109"]
    */
    ewcCodes: text("ewcCodes").notNull(),

    wasteDescription: text("wasteDescription").notNull(),

    physicalForm: text("physicalForm")
      .$type<"Gas" | "Liquid" | "Solid" | "Powder" | "Sludge" | "Mixed">()
      .notNull(),

    numberOfContainers: integer("numberOfContainers").notNull(),

    typeOfContainers: text("typeOfContainers").notNull(),

    weightMetric: text("weightMetric")
      .$type<"Grams" | "Kilograms" | "Tonnes">()
      .notNull(),

    weightAmount: numeric("weightAmount", {
      precision: 14,
      scale: 3,
    }).notNull(),

    weightIsEstimate: boolean("weightIsEstimate").notNull().default(false),

    containsPops: boolean("containsPops").notNull().default(false),

    popsSourceOfComponents: text("popsSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),

    /*
      JSON string array:
      [{ code: "PFHXS", concentration: 12.5 }]
    */
    popsComponents: text("popsComponents"),

    containsHazardous: boolean("containsHazardous")
      .notNull()
      .default(false),

    hazardousSourceOfComponents: text("hazardousSourceOfComponents").$type<
      "NOT_PROVIDED" | "PROVIDED_WITH_WASTE" | "GUIDANCE" | "OWN_TESTING"
    >(),

    /*
      JSON string array:
      ["HP_5", "HP_10"]
    */
    hazardousHazCodes: text("hazardousHazCodes"),

    /*
      JSON string array:
      [{ name: "lead", concentration: 25.5 }]
    */
    hazardousComponents: text("hazardousComponents"),

    /*
      JSON string array:
      [
        {
          code: "R1",
          weight: {
            metric: "Tonnes",
            amount: 1.2,
            isEstimate: false
          }
        }
      ]
    */
    disposalOrRecoveryCodes: text("disposalOrRecoveryCodes"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("waste_receipt_item_org_idx").on(table.organisationId),
    receiptIdx: index("waste_receipt_item_receipt_idx").on(table.receiptId),
  }),
);

/* =========================================================
   DIGITAL WASTE TRACKING SUBMISSIONS

   Formal audit trail of requests/responses sent to Defra.
========================================================= */

export const wasteTrackingSubmissions = pgTable(
  "bb_waste_tracking_submission",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    /*
      New operational link.
      New Solo submissions should originate from a Waste X job load/receipt.
    */
    jobLoadId: text("jobLoadId").references(() => jobLoads.id, {
      onDelete: "set null",
    }),

    /*
      Legacy / future network links.
    */
    assignmentId: text("assignmentId").references(() => carrierAssignments.id, {
      onDelete: "set null",
    }),

    listingId: integer("listingId").references(() => wasteListings.id, {
      onDelete: "set null",
    }),

    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    receiptId: text("receiptId").references(() => wasteReceipts.id, {
      onDelete: "set null",
    }),

    submittedByUserId: text("submittedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    wasteTrackingId: text("wasteTrackingId"),

    submissionType: text("submissionType")
      .$type<"receive">()
      .notNull()
      .default("receive"),

    status: text("status")
      .$type<
        | "draft"
        | "submitted"
        | "accepted"
        | "accepted_with_warnings"
        | "rejected"
        | "failed"
      >()
      .notNull()
      .default("draft"),

    /*
      Nullable for draft/queued records.
      Populated when a submission attempt is made.
    */
    method: text("method").$type<"POST" | "PUT">(),

    endpoint: text("endpoint"),

    payloadSnapshot: text("payloadSnapshot"),

    responseSnapshot: text("responseSnapshot"),

    validationWarnings: text("validationWarnings"),
    validationErrors: text("validationErrors"),

    attemptNumber: integer("attemptNumber").notNull().default(1),

    submittedAt: timestamp("submittedAt", { mode: "date" }),
    lastAttemptedAt: timestamp("lastAttemptedAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("waste_tracking_submission_org_idx").on(
      table.organisationId,
    ),
    jobLoadIdx: index("waste_tracking_submission_job_load_idx").on(
      table.jobLoadId,
    ),
    assignmentIdx: index("waste_tracking_submission_assignment_idx").on(
      table.assignmentId,
    ),
    listingIdx: index("waste_tracking_submission_listing_idx").on(
      table.listingId,
    ),
    receiptIdx: index("waste_tracking_submission_receipt_idx").on(
      table.receiptId,
    ),
    wasteTrackingIdIdx: index("waste_tracking_submission_tracking_id_idx").on(
      table.wasteTrackingId,
    ),
    siteIdx: index("waste_tracking_submission_site_idx").on(table.siteId),
    statusIdx: index("waste_tracking_submission_status_idx").on(table.status),
  }),
);

/* =========================================================
   DIGITAL WASTE TRACKING - PAT RESULTS

   Production Approval Test evidence tracker for DEFRA.
   This is NOT the raw API log. The raw log remains
   wasteTrackingSubmissions.
========================================================= */

export const wasteTrackingPatResults = pgTable(
  "bb_waste_tracking_pat_result",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /*
      DEFRA scenario identity.
      Examples:
      R01, R02, R03, C01, H02, X01
    */
    scenarioId: text("scenarioId").notNull(),

    scenarioOrder: integer("scenarioOrder").notNull(),

    scenarioDescription: text("scenarioDescription").notNull(),

    feature: text("feature"),

    expectedResult: text("expectedResult")
      .$type<"success" | "error">()
      .notNull()
      .default("success"),

    /*
      DEFRA specifically asked for:
      - Scenario ID
      - Scenario description
      - WTID
      - EWC codes if required
      - Reason if required
    */
    wasteTrackingId: text("wasteTrackingId"),

    ewcCodes: text("ewcCodes"),

    reason: text("reason"),

    /*
      Waste X internal links.
      These are optional because expected-error scenarios may not create a WTID.
    */
    jobLoadId: text("jobLoadId").references(() => jobLoads.id, {
      onDelete: "set null",
    }),

    assignmentId: text("assignmentId").references(() => carrierAssignments.id, {
      onDelete: "set null",
    }),

    listingId: integer("listingId").references(() => wasteListings.id, {
      onDelete: "set null",
    }),

    receiptId: text("receiptId").references(() => wasteReceipts.id, {
      onDelete: "set null",
    }),

    dwtSubmissionId: text("dwtSubmissionId").references(
      () => wasteTrackingSubmissions.id,
      {
        onDelete: "set null",
      },
    ),

    /*
      Result evidence.
    */
    httpStatus: integer("httpStatus"),

    errorMessage: text("errorMessage"),

    testedAt: timestamp("testedAt", { mode: "date" }),

    /*
      DEFRA approval workflow.
    */
    defraStatus: text("defraStatus")
      .$type<
        | "not_started"
        | "ready_to_send"
        | "submitted_to_defra"
        | "confirmed_by_defra"
        | "needs_more_info"
        | "unable_to_run"
        | "failed"
      >()
      .notNull()
      .default("not_started"),

    defraSentAt: timestamp("defraSentAt", { mode: "date" }),

    defraConfirmedAt: timestamp("defraConfirmedAt", { mode: "date" }),

    unableToRunReason: text("unableToRunReason"),

    additionalDetails: text("additionalDetails"),

    notes: text("notes"),

    createdByUserId: text("createdByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    updatedByUserId: text("updatedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    scenarioUnique: uniqueIndex("waste_tracking_pat_result_scenario_unique").on(
      table.scenarioId,
    ),

    scenarioIdx: index("waste_tracking_pat_result_scenario_idx").on(
      table.scenarioId,
    ),

    statusIdx: index("waste_tracking_pat_result_status_idx").on(
      table.defraStatus,
    ),

    jobLoadIdx: index("waste_tracking_pat_result_job_load_idx").on(
      table.jobLoadId,
    ),

    assignmentIdx: index("waste_tracking_pat_result_assignment_idx").on(
      table.assignmentId,
    ),

    listingIdx: index("waste_tracking_pat_result_listing_idx").on(
      table.listingId,
    ),

    receiptIdx: index("waste_tracking_pat_result_receipt_idx").on(
      table.receiptId,
    ),

    submissionIdx: index("waste_tracking_pat_result_submission_idx").on(
      table.dwtSubmissionId,
    ),

    trackingIdx: index("waste_tracking_pat_result_wtid_idx").on(
      table.wasteTrackingId,
    ),
  }),
);

/* ================= DIGITAL WASTE TRACKING PAT RESULTS ================= */

export const wasteTrackingPatResultsRelations = relations(
  wasteTrackingPatResults,
  ({ one }) => ({
    jobLoad: one(jobLoads, {
      fields: [wasteTrackingPatResults.jobLoadId],
      references: [jobLoads.id],
    }),

    assignment: one(carrierAssignments, {
      fields: [wasteTrackingPatResults.assignmentId],
      references: [carrierAssignments.id],
    }),

    listing: one(wasteListings, {
      fields: [wasteTrackingPatResults.listingId],
      references: [wasteListings.id],
    }),

    receipt: one(wasteReceipts, {
      fields: [wasteTrackingPatResults.receiptId],
      references: [wasteReceipts.id],
    }),

    dwtSubmission: one(wasteTrackingSubmissions, {
      fields: [wasteTrackingPatResults.dwtSubmissionId],
      references: [wasteTrackingSubmissions.id],
    }),

    createdByUser: one(users, {
      fields: [wasteTrackingPatResults.createdByUserId],
      references: [users.id],
    }),

    updatedByUser: one(users, {
      fields: [wasteTrackingPatResults.updatedByUserId],
      references: [users.id],
    }),
  }),
);


export const notifications = pgTable(
  "bb_notification",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // ✅ NEW
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    recipientId: text("recipientId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    actorId: text("actorId").references(() => users.id, {
      onDelete: "set null",
    }),

    listingId: integer("listingId").references(() => wasteListings.id, {
      onDelete: "cascade",
    }),

    jobId: text("jobId").references(() => jobs.id, {
      onDelete: "cascade",
    }),

    jobLoadId: text("jobLoadId").references(() => jobLoads.id, {
      onDelete: "cascade",
    }),

    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),

    isRead: boolean("isRead").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("notification_org_idx").on(table.organisationId),
  }),
);

export const reviews = pgTable("bb_review", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  reviewerId: text("reviewerId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  reviewedOrganisationId: text("reviewedOrganisationId")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),

  listingId: integer("listingId").references(() => wasteListings.id, {
    onDelete: "set null",
  }),

  rating: integer("rating").notNull(), // 1–5
  comment: text("comment"),

  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
});

export const supportTickets = pgTable("bb_support_ticket", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  organisationId: text("organisationId")
    .notNull()
    .references(() => organisations.id, { onDelete: "cascade" }),

  createdByUserId: text("createdByUserId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),

  category: text("category")
    .$type<
      "bug" | "billing" | "access" | "feature_request" | "compliance" | "other"
    >()
    .notNull(),

  priority: text("priority")
    .$type<"low" | "medium" | "high" | "urgent">()
    .notNull()
    .default("medium"),

  status: text("status")
    .$type<"open" | "in_progress" | "waiting_on_user" | "resolved" | "closed">()
    .notNull()
    .default("open"),

  assignedToUserId: text("assignedToUserId").references(() => users.id, {
    onDelete: "set null",
  }),

  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
});

export const supportTicketMessages = pgTable(
  "bb_support_ticket_message",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // ✅ NEW
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    ticketId: text("ticketId")
      .notNull()
      .references(() => supportTickets.id, { onDelete: "cascade" }),

    senderUserId: text("senderUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    message: text("message").notNull(),

    isInternalNote: boolean("isInternalNote").notNull().default(false),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("support_ticket_message_org_idx").on(table.organisationId),
  }),
);

export const listingTemplates = pgTable(
  "bb_listing_template",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    name: text("name").notNull(),
    description: text("description"),
    dwtProfileJson: text("dwtProfileJson"),

    version: integer("version").notNull().default(1),

    isActive: boolean("isActive").notNull().default(true),
    isLocked: boolean("isLocked").notNull().default(false),

    createdByUserId: text("createdByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("template_org_idx").on(table.organisationId),
  }),
);

export const listingTemplateSections = pgTable(
  "bb_listing_template_section",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    templateId: text("templateId")
      .notNull()
      .references(() => listingTemplates.id, { onDelete: "cascade" }),

    title: text("title").notNull(),
    orderIndex: integer("orderIndex").notNull(),
  },
  (table) => ({
    templateIdx: index("template_section_idx").on(table.templateId),
  }),
);

export const listingTemplateFields = pgTable(
  "bb_listing_template_field",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    templateId: text("templateId")
      .notNull()
      .references(() => listingTemplates.id, { onDelete: "cascade" }),

    sectionId: text("sectionId")
      .notNull()
      .references(() => listingTemplateSections.id, { onDelete: "cascade" }),

    key: text("key").notNull(), // machine key
    label: text("label").notNull(),

    fieldType: text("fieldType")
      .$type<"text" | "number" | "dropdown" | "boolean" | "file">()
      .notNull(),

    required: boolean("required").notNull().default(false),

    optionsJson: text("optionsJson"), // JSON string for dropdown values
    helpText: text("helpText"),

    orderIndex: integer("orderIndex").notNull(),
  },
  (table) => ({
    templateIdx: index("template_field_template_idx").on(table.templateId),
    sectionIdx: index("template_field_section_idx").on(table.sectionId),
  }),
);

export const listingTemplateData = pgTable(
  "bb_listing_template_data",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    // ✅ NEW
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),

    templateId: text("templateId")
      .notNull()
      .references(() => listingTemplates.id),

    templateVersion: integer("templateVersion").notNull(),
    dataJson: text("dataJson").notNull(),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    listingIdx: index("template_data_listing_idx").on(table.listingId),
    templateIdx: index("template_data_template_idx").on(table.templateId),
    orgIdx: index("template_data_org_idx").on(table.organisationId),
  }),
);

export const auditEvents = pgTable(
  "bb_audit_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    userId: text("userId").references(() => users.id, {
      onDelete: "set null",
    }),

    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    action: text("action").notNull(),

    previousState: text("previousState"),
    newState: text("newState"),

    ipAddress: text("ipAddress"),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("audit_event_org_idx").on(table.organisationId),
  }),
);

export const errorLogs = pgTable(
  "bb_error_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),

    severity: text("severity")
      .$type<"low" | "medium" | "high" | "critical">()
      .notNull(),

    code: text("code").notNull(),
    message: text("message").notNull(),

    layer: text("layer")
      .$type<"api" | "db" | "auth" | "validation" | "external">()
      .notNull(),

    // 🔗 RELATIONS (aligned with your system)
    userId: text("userId").references(() => users.id, {
      onDelete: "set null",
    }),

    organisationId: text("organisationId").references(() => organisations.id, {
      onDelete: "set null",
    }),

    // 🌐 REQUEST CONTEXT
    route: text("route"),
    method: text("method"),

    // 📦 FLEXIBLE DATA
    metadata: text("metadata"), // JSON string (consistent with your schema style)

    resolved: boolean("resolved").default(false),
  },
  (table) => ({
    orgIdx: index("error_org_idx").on(table.organisationId),
    userIdx: index("error_user_idx").on(table.userId),
    codeIdx: index("error_code_idx").on(table.code),
    createdIdx: index("error_created_idx").on(table.createdAt),
  }),
);

/* =========================================================
REPORTS EXPORTS
========================================================= */
export const reportExports = pgTable(
  "bb_report_export",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    requestedByUserId: text("requestedByUserId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    /*
      LEGACY / future network reporting context.
      Solo reports do not require a department.
    */
    departmentId: text("departmentId"),

    reportType: text("reportType")
      .$type<
        | "daily_worksheet"
        | "job_summary"
        | "quarterly_return"
        | "billing_export"
        | "dwt_submissions"
        | "waste_receipts"
        | "assignment_summary"
        | "chain_of_custody"
        | "incident_log"
        | "listing_activity"
        | "carrier_performance"
        | "user_access_audit"
        | "compliance_audit_pack"
      >()
      .notNull(),

    format: text("format").$type<"csv" | "pdf" | "json">().notNull(),

    status: text("status")
      .$type<"pending" | "generating" | "completed" | "failed">()
      .notNull()
      .default("pending"),

    title: text("title").notNull(),

    filtersJson: text("filtersJson"),

    fileKey: text("fileKey"),
    fileName: text("fileName"),
    mimeType: text("mimeType"),

    rowCount: integer("rowCount").default(0),

    generatedAt: timestamp("generatedAt", { mode: "date" }),
    downloadedAt: timestamp("downloadedAt", { mode: "date" }),
    expiresAt: timestamp("expiresAt", { mode: "date" }),

    errorMessage: text("errorMessage"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("report_export_org_idx").on(table.organisationId),
    userIdx: index("report_export_user_idx").on(table.requestedByUserId),
    typeIdx: index("report_export_type_idx").on(table.reportType),
    statusIdx: index("report_export_status_idx").on(table.status),
    createdIdx: index("report_export_created_idx").on(table.createdAt),
    siteIdx: index("report_export_site_idx").on(table.siteId),
  }),
);


/* =========================================================
   RELATIONS
========================================================= */

export const errorLogsRelations = relations(errorLogs, ({ one }) => ({
  user: one(users, {
    fields: [errorLogs.userId],
    references: [users.id],
  }),

  organisation: one(organisations, {
    fields: [errorLogs.organisationId],
    references: [organisations.id],
  }),
}));

export const listingTemplatesRelations = relations(
  listingTemplates,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [listingTemplates.organisationId],
      references: [organisations.id],
    }),

    createdBy: one(users, {
      fields: [listingTemplates.createdByUserId],
      references: [users.id],
    }),

    sections: many(listingTemplateSections),
    fields: many(listingTemplateFields),
    listingsData: many(listingTemplateData),
  }),
);

export const listingTemplateSectionsRelations = relations(
  listingTemplateSections,
  ({ one, many }) => ({
    template: one(listingTemplates, {
      fields: [listingTemplateSections.templateId],
      references: [listingTemplates.id],
    }),

    fields: many(listingTemplateFields),
  }),
);

export const listingTemplateFieldsRelations = relations(
  listingTemplateFields,
  ({ one }) => ({
    template: one(listingTemplates, {
      fields: [listingTemplateFields.templateId],
      references: [listingTemplates.id],
    }),

    section: one(listingTemplateSections, {
      fields: [listingTemplateFields.sectionId],
      references: [listingTemplateSections.id],
    }),
  }),
);

export const listingTemplateDataRelations = relations(
  listingTemplateData,
  ({ one }) => ({
    listing: one(wasteListings, {
      fields: [listingTemplateData.listingId],
      references: [wasteListings.id],
    }),

    template: one(listingTemplates, {
      fields: [listingTemplateData.templateId],
      references: [listingTemplates.id],
    }),

    organisation: one(organisations, {
      fields: [listingTemplateData.organisationId],
      references: [organisations.id],
    }),
  }),
);

export const usersRelations = relations(users, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [users.organisationId],
    references: [organisations.id],
  }),

  profile: one(userProfiles, {
    fields: [users.id],
    references: [userProfiles.userId],
  }),

  /*
    Active Solo Workspace creation/audit links.
  */
  createdSitePermits: many(sitePermits),
  configuredPermitEwcCodes: many(permitEwcCodes),
  createdMaterialProfiles: many(materialProfiles),
  createdJobTemplates: many(jobTemplates),
  createdJobs: many(jobs),
  createdJobLoads: many(jobLoads),

  notificationsReceived: many(notifications, {
    relationName: "notificationRecipient",
  }),

  notificationsSent: many(notifications, {
    relationName: "notificationActor",
  }),

  wasteReceiptsReceived: many(wasteReceipts),

  wasteTrackingSubmissionsSubmitted: many(wasteTrackingSubmissions),

  /*
    Legacy / future network links.
  */
  listings: many(wasteListings),
  bids: many(bids),

  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),

  reviewsWritten: many(reviews),
}));


/* ================= USER PROFILES ================= */

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, {
    fields: [userProfiles.userId],
    references: [users.id],
  }),
}));

/* ================= ORGANISATIONS ================= */

export const organisationsRelations = relations(
  organisations,
  ({ one, many }) => ({
    members: many(users),

    /*
      Active Solo Workspace domain.
    */
    sites: many(sites),
    sitePermits: many(sitePermits),
    permitEwcCodes: many(permitEwcCodes),

    counterparties: many(counterparties),
    counterpartyRoles: many(counterpartyRoles),
    counterpartySites: many(counterpartySites),

    drivers: many(drivers),
    vehicles: many(vehicles),

    materialProfiles: many(materialProfiles),
    rates: many(rates),

    jobTemplates: many(jobTemplates),
    jobs: many(jobs),
    jobLoads: many(jobLoads),

    /*
      Marketplace / future network domain.
    */
    listings: many(wasteListings, {
      relationName: "ownerOrganisation",
    }),

    bids: many(bids),

    carrierAssignmentsReceived: many(carrierAssignments, {
      relationName: "carrierOrganisation",
    }),

    managerAssignmentsReceived: many(carrierAssignments, {
      relationName: "managerOrganisation",
    }),

    assignmentsCreated: many(carrierAssignments, {
      relationName: "assignedByOrganisation",
    }),

    departments: many(departments),

    reviews: many(reviews),
    subscriptions: many(organisationSubscriptions),
    invoices: many(invoices),

    wasteTrackingSettings: one(wasteTrackingOrganisationSettings, {
      fields: [organisations.id],
      references: [wasteTrackingOrganisationSettings.organisationId],
    }),

    wasteReceipts: many(wasteReceipts, {
      relationName: "wasteReceiptTenantOrganisation",
    }),

    carrierWasteReceipts: many(wasteReceipts, {
      relationName: "wasteReceiptCarrierOrganisation",
    }),

    receiverWasteReceipts: many(wasteReceipts, {
      relationName: "wasteReceiptReceiverOrganisation",
    }),

    wasteReceiptItems: many(wasteReceiptItems),

    wasteTrackingSubmissions: many(wasteTrackingSubmissions),
  }),
);


/* ================= SOLO WORKSPACE CORE RELATIONS ================= */

export const ewcCodesRelations = relations(ewcCodes, ({ many }) => ({
  permitLinks: many(permitEwcCodes),
  externalFacilityAuthorisationLinks: many(counterpartySiteEwcCodes),
  materialProfiles: many(materialProfiles),
  jobLoads: many(jobLoads),
}));

export const disposalRecoveryCodesRelations = relations(
  disposalRecoveryCodes,
  ({ many }) => ({
    materialProfiles: many(materialProfiles),
    jobLoads: many(jobLoads),
  }),
);

export const sitePermitsRelations = relations(
  sitePermits,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [sitePermits.organisationId],
      references: [organisations.id],
    }),

    site: one(sites, {
      fields: [sitePermits.siteId],
      references: [sites.id],
    }),

    createdBy: one(users, {
      fields: [sitePermits.createdByUserId],
      references: [users.id],
    }),

    permittedEwcCodes: many(permitEwcCodes),
    jobTemplates: many(jobTemplates),
    jobs: many(jobs),
    jobLoads: many(jobLoads),
    wasteReceipts: many(wasteReceipts),
  }),
);

export const permitEwcCodesRelations = relations(
  permitEwcCodes,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [permitEwcCodes.organisationId],
      references: [organisations.id],
    }),

    permit: one(sitePermits, {
      fields: [permitEwcCodes.permitId],
      references: [sitePermits.id],
    }),

    ewcCode: one(ewcCodes, {
      fields: [permitEwcCodes.ewcCodeId],
      references: [ewcCodes.id],
    }),

    configuredBy: one(users, {
      fields: [permitEwcCodes.configuredByUserId],
      references: [users.id],
    }),
  }),
);

export const counterpartiesRelations = relations(
  counterparties,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [counterparties.organisationId],
      references: [organisations.id],
    }),

    roles: many(counterpartyRoles),
    sites: many(counterpartySites),

    drivers: many(drivers, {
      relationName: "driverHaulier",
    }),

    vehicles: many(vehicles, {
      relationName: "vehicleHaulier",
    }),

    rates: many(rates),

    clientJobTemplates: many(jobTemplates, {
      relationName: "jobTemplateClient",
    }),

    haulierJobTemplates: many(jobTemplates, {
      relationName: "jobTemplateHaulier",
    }),

    clientJobs: many(jobs, {
      relationName: "jobClient",
    }),

    haulierJobs: many(jobs, {
      relationName: "jobHaulier",
    }),

    clientJobLoads: many(jobLoads, {
      relationName: "jobLoadClient",
    }),

    haulierJobLoads: many(jobLoads, {
      relationName: "jobLoadHaulier",
    }),

    carrierWasteReceipts: many(wasteReceipts, {
      relationName: "wasteReceiptCarrierCounterparty",
    }),

    brokerDealerWasteReceipts: many(wasteReceipts, {
      relationName: "wasteReceiptBrokerDealerCounterparty",
    }),
  }),
);

export const counterpartyRolesRelations = relations(
  counterpartyRoles,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [counterpartyRoles.organisationId],
      references: [organisations.id],
    }),

    counterparty: one(counterparties, {
      fields: [counterpartyRoles.counterpartyId],
      references: [counterparties.id],
    }),
  }),
);

export const counterpartySitesRelations = relations(
  counterpartySites,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [counterpartySites.organisationId],
      references: [organisations.id],
    }),

    counterparty: one(counterparties, {
      fields: [counterpartySites.counterpartyId],
      references: [counterparties.id],
    }),

    authorisations: many(counterpartySiteAuthorisations),

    rates: many(rates),

    clientJobTemplates: many(jobTemplates, {
      relationName: "jobTemplateClientSite",
    }),

    destinationJobTemplates: many(jobTemplates, {
      relationName: "jobTemplateThirdPartyDestination",
    }),

    clientJobs: many(jobs, {
      relationName: "jobClientSite",
    }),

    destinationJobs: many(jobs, {
      relationName: "jobThirdPartyDestination",
    }),

    clientJobLoads: many(jobLoads, {
      relationName: "jobLoadClientSite",
    }),

    destinationJobLoads: many(jobLoads, {
      relationName: "jobLoadThirdPartyDestination",
    }),
  }),
);

export const counterpartySiteAuthorisationsRelations = relations(
  counterpartySiteAuthorisations,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [counterpartySiteAuthorisations.organisationId],
      references: [organisations.id],
    }),

    site: one(counterpartySites, {
      fields: [counterpartySiteAuthorisations.counterpartySiteId],
      references: [counterpartySites.id],
    }),

    createdBy: one(users, {
      fields: [counterpartySiteAuthorisations.createdByUserId],
      references: [users.id],
    }),

    permittedEwcCodes: many(counterpartySiteEwcCodes),
  }),
);

export const counterpartySiteEwcCodesRelations = relations(
  counterpartySiteEwcCodes,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [counterpartySiteEwcCodes.organisationId],
      references: [organisations.id],
    }),

    authorisation: one(counterpartySiteAuthorisations, {
      fields: [counterpartySiteEwcCodes.authorisationId],
      references: [counterpartySiteAuthorisations.id],
    }),

    ewcCode: one(ewcCodes, {
      fields: [counterpartySiteEwcCodes.ewcCodeId],
      references: [ewcCodes.id],
    }),

    configuredBy: one(users, {
      fields: [counterpartySiteEwcCodes.configuredByUserId],
      references: [users.id],
    }),
  }),
);

export const driversRelations = relations(drivers, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [drivers.organisationId],
    references: [organisations.id],
  }),

  haulier: one(counterparties, {
    relationName: "driverHaulier",
    fields: [drivers.haulierCounterpartyId],
    references: [counterparties.id],
  }),

  defaultVehicle: one(vehicles, {
    relationName: "driverDefaultVehicle",
    fields: [drivers.defaultVehicleId],
    references: [vehicles.id],
  }),

  jobTemplates: many(jobTemplates),
  jobs: many(jobs),
  jobLoads: many(jobLoads),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [vehicles.organisationId],
    references: [organisations.id],
  }),

  haulier: one(counterparties, {
    relationName: "vehicleHaulier",
    fields: [vehicles.haulierCounterpartyId],
    references: [counterparties.id],
  }),

  defaultForDrivers: many(drivers, {
    relationName: "driverDefaultVehicle",
  }),

  jobTemplates: many(jobTemplates),
  jobs: many(jobs),
  jobLoads: many(jobLoads),
}));

export const materialProfilesRelations = relations(
  materialProfiles,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [materialProfiles.organisationId],
      references: [organisations.id],
    }),

    site: one(sites, {
      fields: [materialProfiles.siteId],
      references: [sites.id],
    }),

    ewcCode: one(ewcCodes, {
      fields: [materialProfiles.ewcCodeId],
      references: [ewcCodes.id],
    }),

    defaultDisposalRecoveryCode: one(disposalRecoveryCodes, {
      fields: [materialProfiles.defaultDisposalRecoveryCodeId],
      references: [disposalRecoveryCodes.id],
    }),

    createdBy: one(users, {
      fields: [materialProfiles.createdByUserId],
      references: [users.id],
    }),

    rates: many(rates),
    jobTemplates: many(jobTemplates),
    jobs: many(jobs),
    jobLoads: many(jobLoads),
  }),
);

export const ratesRelations = relations(rates, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [rates.organisationId],
    references: [organisations.id],
  }),

  counterparty: one(counterparties, {
    fields: [rates.counterpartyId],
    references: [counterparties.id],
  }),

  counterpartySite: one(counterpartySites, {
    fields: [rates.counterpartySiteId],
    references: [counterpartySites.id],
  }),

  ownSite: one(sites, {
    fields: [rates.ownSiteId],
    references: [sites.id],
  }),

  materialProfile: one(materialProfiles, {
    fields: [rates.materialProfileId],
    references: [materialProfiles.id],
  }),

  jobTemplates: many(jobTemplates),
  jobs: many(jobs),
}));

export const jobTemplatesRelations = relations(
  jobTemplates,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [jobTemplates.organisationId],
      references: [organisations.id],
    }),

    client: one(counterparties, {
      relationName: "jobTemplateClient",
      fields: [jobTemplates.clientCounterpartyId],
      references: [counterparties.id],
    }),

    clientSite: one(counterpartySites, {
      relationName: "jobTemplateClientSite",
      fields: [jobTemplates.clientSiteId],
      references: [counterpartySites.id],
    }),

    ownSite: one(sites, {
      fields: [jobTemplates.ownSiteId],
      references: [sites.id],
    }),

    sitePermit: one(sitePermits, {
      fields: [jobTemplates.sitePermitId],
      references: [sitePermits.id],
    }),

    thirdPartyDestinationSite: one(counterpartySites, {
      relationName: "jobTemplateThirdPartyDestination",
      fields: [jobTemplates.thirdPartyDestinationSiteId],
      references: [counterpartySites.id],
    }),

    haulier: one(counterparties, {
      relationName: "jobTemplateHaulier",
      fields: [jobTemplates.haulierCounterpartyId],
      references: [counterparties.id],
    }),

    driver: one(drivers, {
      fields: [jobTemplates.driverId],
      references: [drivers.id],
    }),

    vehicle: one(vehicles, {
      fields: [jobTemplates.vehicleId],
      references: [vehicles.id],
    }),

    materialProfile: one(materialProfiles, {
      fields: [jobTemplates.materialProfileId],
      references: [materialProfiles.id],
    }),

    rate: one(rates, {
      fields: [jobTemplates.rateId],
      references: [rates.id],
    }),

    createdBy: one(users, {
      fields: [jobTemplates.createdByUserId],
      references: [users.id],
    }),

    jobs: many(jobs),
  }),
);

export const jobsRelations = relations(jobs, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [jobs.organisationId],
    references: [organisations.id],
  }),

  client: one(counterparties, {
    relationName: "jobClient",
    fields: [jobs.clientCounterpartyId],
    references: [counterparties.id],
  }),

  clientSite: one(counterpartySites, {
    relationName: "jobClientSite",
    fields: [jobs.clientSiteId],
    references: [counterpartySites.id],
  }),

  ownSite: one(sites, {
    fields: [jobs.ownSiteId],
    references: [sites.id],
  }),

  sitePermit: one(sitePermits, {
    fields: [jobs.sitePermitId],
    references: [sitePermits.id],
  }),

  thirdPartyDestinationSite: one(counterpartySites, {
    relationName: "jobThirdPartyDestination",
    fields: [jobs.thirdPartyDestinationSiteId],
    references: [counterpartySites.id],
  }),

  haulier: one(counterparties, {
    relationName: "jobHaulier",
    fields: [jobs.haulierCounterpartyId],
    references: [counterparties.id],
  }),

  driver: one(drivers, {
    fields: [jobs.driverId],
    references: [drivers.id],
  }),

  vehicle: one(vehicles, {
    fields: [jobs.vehicleId],
    references: [vehicles.id],
  }),

  materialProfile: one(materialProfiles, {
    fields: [jobs.materialProfileId],
    references: [materialProfiles.id],
  }),

  rate: one(rates, {
    fields: [jobs.rateId],
    references: [rates.id],
  }),

  sourceTemplate: one(jobTemplates, {
    fields: [jobs.sourceTemplateId],
    references: [jobTemplates.id],
  }),

  marketplaceListing: one(wasteListings, {
    fields: [jobs.marketplaceListingId],
    references: [wasteListings.id],
  }),

  legacyAssignment: one(carrierAssignments, {
    fields: [jobs.legacyAssignmentId],
    references: [carrierAssignments.id],
  }),

  createdBy: one(users, {
    fields: [jobs.createdByUserId],
    references: [users.id],
  }),

  loads: many(jobLoads),
  notifications: many(notifications),
}));

export const jobLoadsRelations = relations(jobLoads, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [jobLoads.organisationId],
    references: [organisations.id],
  }),

  job: one(jobs, {
    fields: [jobLoads.jobId],
    references: [jobs.id],
  }),

  client: one(counterparties, {
    relationName: "jobLoadClient",
    fields: [jobLoads.clientCounterpartyId],
    references: [counterparties.id],
  }),

  clientSite: one(counterpartySites, {
    relationName: "jobLoadClientSite",
    fields: [jobLoads.clientSiteId],
    references: [counterpartySites.id],
  }),

  ownSite: one(sites, {
    fields: [jobLoads.ownSiteId],
    references: [sites.id],
  }),

  sitePermit: one(sitePermits, {
    fields: [jobLoads.sitePermitId],
    references: [sitePermits.id],
  }),

  thirdPartyDestinationSite: one(counterpartySites, {
    relationName: "jobLoadThirdPartyDestination",
    fields: [jobLoads.thirdPartyDestinationSiteId],
    references: [counterpartySites.id],
  }),

  haulier: one(counterparties, {
    relationName: "jobLoadHaulier",
    fields: [jobLoads.haulierCounterpartyId],
    references: [counterparties.id],
  }),

  driver: one(drivers, {
    fields: [jobLoads.driverId],
    references: [drivers.id],
  }),

  vehicle: one(vehicles, {
    fields: [jobLoads.vehicleId],
    references: [vehicles.id],
  }),

  materialProfile: one(materialProfiles, {
    fields: [jobLoads.materialProfileId],
    references: [materialProfiles.id],
  }),

  ewcCode: one(ewcCodes, {
    fields: [jobLoads.ewcCodeId],
    references: [ewcCodes.id],
  }),

  disposalRecoveryCode: one(disposalRecoveryCodes, {
    fields: [jobLoads.disposalRecoveryCodeId],
    references: [disposalRecoveryCodes.id],
  }),

  createdBy: one(users, {
    fields: [jobLoads.createdByUserId],
    references: [users.id],
  }),

  receipt: one(wasteReceipts),

  submissions: many(wasteTrackingSubmissions),
  notifications: many(notifications),
}));


/* ================= WASTE LISTINGS ================= */

export const wasteListingsRelations = relations(
  wasteListings,
  ({ one, many }) => ({
    user: one(users, {
      fields: [wasteListings.userId],
      references: [users.id],
    }),

    organisation: one(organisations, {
      relationName: "ownerOrganisation",
      fields: [wasteListings.organisationId],
      references: [organisations.id],
    }),

    site: one(sites, {
      fields: [wasteListings.siteId],
      references: [sites.id],
    }),

    bids: many(bids),
    carrierAssignments: many(carrierAssignments),
    incidents: many(incidents),
    notifications: many(notifications),
    reviews: many(reviews),
    templateData: many(listingTemplateData),

    /*
      Marketplace can create/seed an operational job,
      but jobs do not require marketplace listings.
    */
    jobs: many(jobs),

    wasteReceipts: many(wasteReceipts),
    wasteTrackingSubmissions: many(wasteTrackingSubmissions),
  }),
);


/* ================= BIDS ================= */

export const bidsRelations = relations(bids, ({ one }) => ({
  listing: one(wasteListings, {
    fields: [bids.listingId],
    references: [wasteListings.id],
  }),

  user: one(users, {
    fields: [bids.userId],
    references: [users.id],
  }),

  organisation: one(organisations, {
    fields: [bids.organisationId],
    references: [organisations.id],
  }),
}));

/* ================= CARRIER ASSIGNMENTS ================= */

export const carrierAssignmentsRelations = relations(
  carrierAssignments,
  ({ one, many }) => ({
    listing: one(wasteListings, {
      fields: [carrierAssignments.listingId],
      references: [wasteListings.id],
    }),

    organisation: one(organisations, {
      fields: [carrierAssignments.organisationId],
      references: [organisations.id],
    }),

    carrierOrganisation: one(organisations, {
      relationName: "carrierOrganisation",
      fields: [carrierAssignments.carrierOrganisationId],
      references: [organisations.id],
    }),

    managerOrganisation: one(organisations, {
      relationName: "managerOrganisation",
      fields: [carrierAssignments.managerOrganisationId],
      references: [organisations.id],
    }),

    site: one(sites, {
      fields: [carrierAssignments.siteId],
      references: [sites.id],
    }),

    assignedByOrganisation: one(organisations, {
      relationName: "assignedByOrganisation",
      fields: [carrierAssignments.assignedByOrganisationId],
      references: [organisations.id],
    }),

    bid: one(bids, {
      fields: [carrierAssignments.bidId],
      references: [bids.id],
    }),

    incidents: many(incidents),

    wasteReceipts: many(wasteReceipts),

    wasteTrackingSubmissions: many(wasteTrackingSubmissions),

    legacySoloJobs: many(jobs),
  }),
);
/* ================= INCIDENTS ================= */

export const incidentsRelations = relations(incidents, ({ one }) => ({
  listing: one(wasteListings, {
    fields: [incidents.listingId],
    references: [wasteListings.id],
  }),

  assignment: one(carrierAssignments, {
    fields: [incidents.assignmentId],
    references: [carrierAssignments.id],
  }),

  organisation: one(organisations, {
    fields: [incidents.organisationId],
    references: [organisations.id],
  }),

  reportedByUser: one(users, {
    fields: [incidents.reportedByUserId],
    references: [users.id],
  }),

    site: one(sites, {
    fields: [incidents.siteId],
    references: [sites.id],
  }),

  reportedByOrganisation: one(organisations, {
    fields: [incidents.reportedByOrganisationId],
    references: [organisations.id],
  }),
}));

/* ================= REVIEWS ================= */

export const reviewsRelations = relations(reviews, ({ one }) => ({
  reviewer: one(users, {
    fields: [reviews.reviewerId],
    references: [users.id],
  }),

  reviewedOrganisation: one(organisations, {
    fields: [reviews.reviewedOrganisationId],
    references: [organisations.id],
  }),

  listing: one(wasteListings, {
    fields: [reviews.listingId],
    references: [wasteListings.id],
  }),
}));

/* ================= NOTIFICATIONS ================= */

export const notificationsRelations = relations(notifications, ({ one }) => ({
  recipient: one(users, {
    fields: [notifications.recipientId],
    references: [users.id],
    relationName: "notificationRecipient",
  }),

  actor: one(users, {
    fields: [notifications.actorId],
    references: [users.id],
    relationName: "notificationActor",
  }),

  organisation: one(organisations, {
    fields: [notifications.organisationId],
    references: [organisations.id],
  }),

  job: one(jobs, {
    fields: [notifications.jobId],
    references: [jobs.id],
  }),

  jobLoad: one(jobLoads, {
    fields: [notifications.jobLoadId],
    references: [jobLoads.id],
  }),

  listing: one(wasteListings, {
    fields: [notifications.listingId],
    references: [wasteListings.id],
  }),
}));


export const supportTicketsRelations = relations(
  supportTickets,
  ({ one, many }) => ({
    organisation: one(organisations, {
      fields: [supportTickets.organisationId],
      references: [organisations.id],
    }),

    createdBy: one(users, {
      fields: [supportTickets.createdByUserId],
      references: [users.id],
    }),

    assignedTo: one(users, {
      fields: [supportTickets.assignedToUserId],
      references: [users.id],
    }),

    messages: many(supportTicketMessages),
  }),
);

export const supportTicketMessagesRelations = relations(
  supportTicketMessages,
  ({ one }) => ({
    ticket: one(supportTickets, {
      fields: [supportTicketMessages.ticketId],
      references: [supportTickets.id],
    }),

    sender: one(users, {
      fields: [supportTicketMessages.senderUserId],
      references: [users.id],
    }),
  }),
);

export const auditEventsRelations = relations(auditEvents, ({ one }) => ({
  organisation: one(organisations, {
    fields: [auditEvents.organisationId],
    references: [organisations.id],
  }),

  user: one(users, {
    fields: [auditEvents.userId],
    references: [users.id],
  }),
}));

export const organisationSubscriptionsRelations = relations(
  organisationSubscriptions,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [organisationSubscriptions.organisationId],
      references: [organisations.id],
    }),
  }),
);

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [invoices.organisationId],
    references: [organisations.id],
  }),

  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
}));

export const wasteEventsRelations = relations(wasteEvents, ({ one }) => ({
  organisation: one(organisations, {
    fields: [wasteEvents.organisationId],
    references: [organisations.id],
  }),

  listing: one(wasteListings, {
    fields: [wasteEvents.listingId],
    references: [wasteListings.id],
  }),

  user: one(users, {
    fields: [wasteEvents.performedByUserId],
    references: [users.id],
  }),
}));

export const departmentsRelations = relations(departments, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [departments.organisationId],
    references: [organisations.id],
  }),

  members: many(users),
}));

/* ================= DIGITAL WASTE TRACKING SETTINGS ================= */

export const wasteTrackingOrganisationSettingsRelations = relations(
  wasteTrackingOrganisationSettings,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [wasteTrackingOrganisationSettings.organisationId],
      references: [organisations.id],
    }),
  }),
);

/* ================= DIGITAL WASTE TRACKING REFERENCE DATA ================= */

export const wasteTrackingReferenceDataRelations = relations(
  wasteTrackingReferenceData,
  () => ({}),
);

/* ================= WASTE RECEIPTS ================= */

export const wasteReceiptsRelations = relations(
  wasteReceipts,
  ({ one, many }) => ({
    organisation: one(organisations, {
      relationName: "wasteReceiptTenantOrganisation",
      fields: [wasteReceipts.organisationId],
      references: [organisations.id],
    }),

    jobLoad: one(jobLoads, {
      fields: [wasteReceipts.jobLoadId],
      references: [jobLoads.id],
    }),

    assignment: one(carrierAssignments, {
      fields: [wasteReceipts.assignmentId],
      references: [carrierAssignments.id],
    }),

    listing: one(wasteListings, {
      fields: [wasteReceipts.listingId],
      references: [wasteListings.id],
    }),

    site: one(sites, {
      fields: [wasteReceipts.siteId],
      references: [sites.id],
    }),

    sitePermit: one(sitePermits, {
      fields: [wasteReceipts.sitePermitId],
      references: [sitePermits.id],
    }),

    receivedByUser: one(users, {
      fields: [wasteReceipts.receivedByUserId],
      references: [users.id],
    }),

    carrierOrganisation: one(organisations, {
      relationName: "wasteReceiptCarrierOrganisation",
      fields: [wasteReceipts.carrierOrganisationId],
      references: [organisations.id],
    }),

    receiverOrganisation: one(organisations, {
      relationName: "wasteReceiptReceiverOrganisation",
      fields: [wasteReceipts.receiverOrganisationId],
      references: [organisations.id],
    }),

    carrierCounterparty: one(counterparties, {
      relationName: "wasteReceiptCarrierCounterparty",
      fields: [wasteReceipts.carrierCounterpartyId],
      references: [counterparties.id],
    }),

    brokerDealerCounterparty: one(counterparties, {
      relationName: "wasteReceiptBrokerDealerCounterparty",
      fields: [wasteReceipts.brokerDealerCounterpartyId],
      references: [counterparties.id],
    }),

    items: many(wasteReceiptItems),
    submissions: many(wasteTrackingSubmissions),
  }),
);


/* ================= WASTE RECEIPT ITEMS ================= */

export const wasteReceiptItemsRelations = relations(
  wasteReceiptItems,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [wasteReceiptItems.organisationId],
      references: [organisations.id],
    }),

    receipt: one(wasteReceipts, {
      fields: [wasteReceiptItems.receiptId],
      references: [wasteReceipts.id],
    }),
  }),
);

/* ================= DIGITAL WASTE TRACKING SUBMISSIONS ================= */

export const wasteTrackingSubmissionsRelations = relations(
  wasteTrackingSubmissions,
  ({ one }) => ({
    organisation: one(organisations, {
      fields: [wasteTrackingSubmissions.organisationId],
      references: [organisations.id],
    }),

    jobLoad: one(jobLoads, {
      fields: [wasteTrackingSubmissions.jobLoadId],
      references: [jobLoads.id],
    }),

    assignment: one(carrierAssignments, {
      fields: [wasteTrackingSubmissions.assignmentId],
      references: [carrierAssignments.id],
    }),

    listing: one(wasteListings, {
      fields: [wasteTrackingSubmissions.listingId],
      references: [wasteListings.id],
    }),

    receipt: one(wasteReceipts, {
      fields: [wasteTrackingSubmissions.receiptId],
      references: [wasteReceipts.id],
    }),

    submittedByUser: one(users, {
      fields: [wasteTrackingSubmissions.submittedByUserId],
      references: [users.id],
    }),

    site: one(sites, {
      fields: [wasteTrackingSubmissions.siteId],
      references: [sites.id],
    }),
  }),
);


/* ================= REPORT EXPORTS ================= */

export const reportExportsRelations = relations(reportExports, ({ one }) => ({
  organisation: one(organisations, {
    fields: [reportExports.organisationId],
    references: [organisations.id],
  }),

  requestedBy: one(users, {
    fields: [reportExports.requestedByUserId],
    references: [users.id],
  }),

  department: one(departments, {
    fields: [reportExports.departmentId],
    references: [departments.id],
  }),

  site: one(sites, {
    fields: [reportExports.siteId],
    references: [sites.id],
  }),
}));

/* ================= SITES ================= */

export const sitesRelations = relations(sites, ({ one, many }) => ({
  organisation: one(organisations, {
    fields: [sites.organisationId],
    references: [organisations.id],
  }),

  /*
    Active Solo Workspace.
  */
  permits: many(sitePermits),
  materialProfiles: many(materialProfiles),
  rates: many(rates),
  jobTemplates: many(jobTemplates),
  jobs: many(jobs),
  jobLoads: many(jobLoads),

  wasteReceipts: many(wasteReceipts),
  wasteTrackingSubmissions: many(wasteTrackingSubmissions),
  reportExports: many(reportExports),

  /*
    Marketplace / future network.
  */
  listings: many(wasteListings),
  carrierAssignments: many(carrierAssignments),
  incidents: many(incidents),
}));
