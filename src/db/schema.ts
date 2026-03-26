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
} from "drizzle-orm/pg-core";
import type { AdapterAccount } from "next-auth/adapters";
import { ChainOfCustodyType } from "@/util/types";
import { relations } from "drizzle-orm";

/* =========================================================
   ORGANISATIONS
========================================================= */

export const organisations = pgTable("bb_organisation", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),

  teamName: text("teamName").notNull(),
  profilePicture: text("profilePicture"),
  chainOfCustody: text("chainOfCustody").$type<ChainOfCustodyType>().notNull(),
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
  billingCustomerId: text("billingCustomerId"), // Stripe customer ID

  subscriptionStatus: text("subscriptionStatus")
    .$type<"trial" | "active" | "past_due" | "cancelled">()
    .default("trial"),

  subscriptionPlan: text("subscriptionPlan")
    .$type<"starter" | "pro" | "enterprise">()
    .default("starter"),

  trialEndsAt: timestamp("trialEndsAt", { mode: "date" }),

  billingEmail: text("billingEmail"),
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
      .$type<"INVITED" | "ACTIVE">()
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

export const wasteListings = pgTable(
  "bb_waste_listing",
  {
    id: serial("id").primaryKey(),

    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    winningBidId: integer("winningBidId"),

    winningOrganisationId: text("winningOrganisationId").references(
      () => organisations.id,
      { onDelete: "set null" },
    ),

    assignedCarrierOrganisationId: text(
      "assignedCarrierOrganisationId",
    ).references(() => organisations.id, { onDelete: "set null" }),

    assignedByOrganisationId: text("assignedByOrganisationId").references(
      () => organisations.id,
      { onDelete: "set null" },
    ),
    platformFee: integer("platformFee"),

    /* ===============================
       TEMPLATE LOCKING
    ============================== */

    templateId: text("templateId")
      .notNull()
      .references(() => listingTemplates.id),

    templateVersion: integer("templateVersion").notNull(),

    /* ===============================
       AUCTION CORE
    ============================== */

    name: text("name").notNull(),
    location: text("location").notNull(),
    startingPrice: integer("startingPrice").notNull().default(0),
    currentBid: integer("currentBid").notNull().default(0),

    fileKey: text("fileKey").notNull(),

    endDate: timestamp("endDate", { mode: "date" }).notNull(),

    /* ===============================
       WORKFLOW / LIFECYCLE
    ============================== */

    assignedAt: timestamp("assignedAt", { mode: "date" }),

    archived: boolean("archived").notNull().default(false),
    offerAccepted: boolean("offerAccepted").notNull().default(false),
    assigned: boolean("assigned").notNull().default(false),

    status: text("status")
      .$type<
        | "draft"
        | "open"
        | "offer_accepted"
        | "assigned"
        | "collected"
        | "completed"
        | "cancelled"
      >()
      .notNull()
      .default("draft"),

    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("listing_org_idx").on(table.organisationId),
    userIdx: index("listing_user_idx").on(table.userId),
    archivedIdx: index("listing_archived_idx").on(table.archived),
    statusIdx: index("listing_status_idx").on(table.status),
  }),
);
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

    timestamp: timestamp("timestamp", { mode: "date" }).notNull().defaultNow(),

    declinedOffer: boolean("declinedOffer").notNull().default(false),
    cancelledJob: boolean("cancelledJob").notNull().default(false),
    cancellationReason: text("cancellationReason"),
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

    // ✅ NEW — explicit tenant ownership
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    listingId: integer("listingId")
      .notNull()
      .references(() => wasteListings.id, { onDelete: "cascade" }),

    carrierOrganisationId: text("carrierOrganisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    assignedByOrganisationId: text("assignedByOrganisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),

    status: text("status")
      .$type<"pending" | "accepted" | "collected" | "completed" | "rejected">()
      .notNull()
      .default("pending"),

    verificationCode: text("verificationCode"),
    codeGeneratedAt: timestamp("codeGeneratedAt", { mode: "date" }),
    codeUsedAt: timestamp("codeUsedAt", { mode: "date" }),

    assignedAt: timestamp("assignedAt", { mode: "date" }).defaultNow(),
    respondedAt: timestamp("respondedAt", { mode: "date" }),
    collectedAt: timestamp("collectedAt", { mode: "date" }),
    completedAt: timestamp("completedAt", { mode: "date" }),
  },
  (table) => ({
    listingIdx: index("carrier_listing_idx").on(table.listingId),
    carrierIdx: index("carrier_org_idx").on(table.carrierOrganisationId),
    orgIdx: index("carrier_assignment_org_idx").on(table.organisationId),
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

    // ✅ NEW
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

/* =========================================================
   RELATIONS
========================================================= */

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

export const organisationsRelations = relations(organisations, ({ many }) => ({
  members: many(users),

  listings: many(wasteListings, {
    relationName: "ownerOrganisation",
  }),

  bids: many(bids),

  carrierJobs: many(carrierAssignments, {
    relationName: "carrierOrganisation",
  }),

  assignedCarrierJobs: many(carrierAssignments, {
    relationName: "assignedByOrganisation",
  }),

  reviews: many(reviews),
  subscriptions: many(organisationSubscriptions),
  invoices: many(invoices),
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

    winningOrganisation: one(organisations, {
      relationName: "winningOrganisation",
      fields: [wasteListings.winningOrganisationId],
      references: [organisations.id],
    }),
    bids: many(bids),

    carrierAssignments: many(carrierAssignments),

    incidents: many(incidents),

    notifications: many(notifications),

    reviews: many(reviews),
    templateData: many(listingTemplateData),
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

    assignedByOrganisation: one(organisations, {
      relationName: "assignedByOrganisation",
      fields: [carrierAssignments.assignedByOrganisationId],
      references: [organisations.id],
    }),

    incidents: many(incidents),
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
