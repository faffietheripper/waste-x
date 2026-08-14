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
import type { AdapterAccount } from "next-auth/adapters";
import { ChainOfCustodyType } from "@/util/types";
import { relations } from "drizzle-orm";


export type OrganisationOperatingMode =
  | "solo"
  | "team"
  | "multi_site"
  | "carrier_ops"
  | "enterprise";

export type SiteType =
  | "main_site"
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
    .default("team"),

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

    departmentId: text("departmentId"),

    activeSessionToken: text("activeSessionToken"),
activeSessionStartedAt: timestamp("activeSessionStartedAt"),
lastSeenAt: timestamp("lastSeenAt"),

    role: text("role")
      .$type<
        "administrator" | "employee" | "seniorManagement" | "platform_admin"
      >()
      .notNull()
      .default("employee"),

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
   CARRIER ASSIGNMENTS
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

    /*
      Tenant organisation context.
      For manager/receiver workflows, this is usually the manager organisation.
    */
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    assignmentId: text("assignmentId")
      .notNull()
      .references(() => carrierAssignments.id, { onDelete: "cascade" }),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),

    siteId: text("siteId").references(() => sites.id, {
      onDelete: "set null",
    }),

    receivedByUserId: text("receivedByUserId").references(() => users.id, {
      onDelete: "set null",
    }),

    carrierOrganisationId: text("carrierOrganisationId").references(
      () => organisations.id,
      { onDelete: "set null" },
    ),

    receiverOrganisationId: text("receiverOrganisationId").references(
      () => organisations.id,
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
      This protects the audit record if organisation details change later.
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
    siteIdx: index("waste_receipt_site_idx").on(table.siteId),
    assignmentIdx: index("waste_receipt_assignment_idx").on(
      table.assignmentId,
    ),
    listingIdx: index("waste_receipt_listing_idx").on(table.listingId),
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

    assignmentId: text("assignmentId")
      .notNull()
      .references(() => carrierAssignments.id, { onDelete: "cascade" }),

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

    method: text("method").$type<"POST" | "PUT">().notNull(),

    endpoint: text("endpoint").notNull(),

    /*
      JSON string of the exact payload submitted.
      Keep this as text to stay consistent with your current schema style.
    */
    payloadSnapshot: text("payloadSnapshot").notNull(),

    /*
      JSON string of the exact response returned by Defra.
    */
    responseSnapshot: text("responseSnapshot"),

    /*
      JSON string arrays from Defra validation response.
    */
    validationWarnings: text("validationWarnings"),
    validationErrors: text("validationErrors"),

    submittedAt: timestamp("submittedAt", { mode: "date" }),
    lastAttemptedAt: timestamp("lastAttemptedAt", { mode: "date" }),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("waste_tracking_submission_org_idx").on(
      table.organisationId,
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
      These are optional because C01 and H02 are expected-error
      scenarios and may not create a WTID.
    */
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

    departmentId: text("departmentId"),

    reportType: text("reportType")
      .$type<
        | "assignment_summary"
        | "chain_of_custody"
        | "incident_log"
        | "dwt_submissions"
        | "waste_receipts"
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

  listings: many(wasteListings),

  bids: many(bids),

  notificationsReceived: many(notifications, {
    relationName: "notificationRecipient",
  }),

  notificationsSent: many(notifications, {
    relationName: "notificationActor",
  }),

  department: one(departments, {
    fields: [users.departmentId],
    references: [departments.id],
  }),

  reviewsWritten: many(reviews),

  wasteReceiptsReceived: many(wasteReceipts),

  wasteTrackingSubmissionsSubmitted: many(wasteTrackingSubmissions),
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

    sites: many(sites),

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

    bids: many(bids),

    carrierAssignments: many(carrierAssignments),

    incidents: many(incidents),

    notifications: many(notifications),

    reviews: many(reviews),

    templateData: many(listingTemplateData),

    wasteReceipts: many(wasteReceipts),

      site: one(sites, {
      fields: [wasteListings.siteId],
      references: [sites.id],
    }),

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

  listing: one(wasteListings, {
    fields: [notifications.listingId],
    references: [wasteListings.id],
  }),
  organisation: one(organisations, {
    fields: [notifications.organisationId],
    references: [organisations.id],
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

    assignment: one(carrierAssignments, {
      fields: [wasteReceipts.assignmentId],
      references: [carrierAssignments.id],
    }),

    listing: one(wasteListings, {
      fields: [wasteReceipts.listingId],
      references: [wasteListings.id],
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

    items: many(wasteReceiptItems),

    submissions: many(wasteTrackingSubmissions),

        site: one(sites, {
      fields: [wasteReceipts.siteId],
      references: [sites.id],
    }),
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

  listings: many(wasteListings),
  carrierAssignments: many(carrierAssignments),
  incidents: many(incidents),
  wasteReceipts: many(wasteReceipts),
  wasteTrackingSubmissions: many(wasteTrackingSubmissions),
  reportExports: many(reportExports),
}));