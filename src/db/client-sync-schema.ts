import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { organisations, sites, users } from "./schema";

export type ClientDeviceType = "DESKTOP" | "MOBILE";
export type ClientDevicePlatform =
  | "WINDOWS"
  | "MACOS"
  | "LINUX"
  | "IOS"
  | "ANDROID";
export type ClientDeviceStatus = "ACTIVE" | "REVOKED" | "SUSPENDED";

export const clientDevices = pgTable(
  "bb_client_device",
  {
    id: text("id").primaryKey(),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    defaultSiteId: text("defaultSiteId").references(() => sites.id, {
      onDelete: "set null",
    }),
    displayName: text("displayName").notNull(),
    deviceType: text("deviceType").$type<ClientDeviceType>().notNull(),
    platform: text("platform").$type<ClientDevicePlatform>().notNull(),
    status: text("status")
      .$type<ClientDeviceStatus>()
      .notNull()
      .default("ACTIVE"),
    secretHash: text("secretHash").notNull(),
    registeredByUserId: text("registeredByUserId").references(() => users.id, {
      onDelete: "set null",
    }),
    lastSeenAt: timestamp("lastSeenAt", { mode: "date" }),
    revokedAt: timestamp("revokedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgIdx: index("client_device_org_idx").on(table.organisationId),
    statusIdx: index("client_device_status_idx").on(table.status),
    orgStatusIdx: index("client_device_org_status_idx").on(
      table.organisationId,
      table.status,
    ),
  }),
);

export const clientSessions = pgTable(
  "bb_client_session",
  {
    id: text("id").primaryKey(),
    deviceId: text("deviceId")
      .notNull()
      .references(() => clientDevices.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    tokenHash: text("tokenHash").notNull(),
    expiresAt: timestamp("expiresAt", { mode: "date" }).notNull(),
    lastSeenAt: timestamp("lastSeenAt", { mode: "date" }),
    revokedAt: timestamp("revokedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    tokenUnique: uniqueIndex("client_session_token_unique").on(table.tokenHash),
    deviceIdx: index("client_session_device_idx").on(table.deviceId),
    userIdx: index("client_session_user_idx").on(table.userId),
    orgIdx: index("client_session_org_idx").on(table.organisationId),
    expiryIdx: index("client_session_expiry_idx").on(table.expiresAt),
  }),
);

export type SyncResultStatus =
  | "APPLIED"
  | "DUPLICATE"
  | "CONFLICT"
  | "RETRYABLE_ERROR"
  | "REJECTED";

export const syncEventInbox = pgTable(
  "bb_sync_event_inbox",
  {
    eventId: text("eventId").primaryKey(),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    siteId: text("siteId"),
    deviceId: text("deviceId")
      .notNull()
      .references(() => clientDevices.id, { onDelete: "cascade" }),
    actorUserId: text("actorUserId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    eventType: text("eventType").notNull(),
    baseVersion: integer("baseVersion"),
    deviceSequence: integer("deviceSequence").notNull(),
    payload: jsonb("payload").$type<unknown>().notNull(),
    payloadHash: text("payloadHash").notNull(),
    occurredAt: timestamp("occurredAt", { mode: "date" }).notNull(),
    recordedAt: timestamp("recordedAt", { mode: "date" }).notNull(),
    receivedAt: timestamp("receivedAt", { mode: "date" }).defaultNow(),
    resultStatus: text("resultStatus").$type<SyncResultStatus>().notNull(),
    resultEntityVersion: integer("resultEntityVersion"),
    reasonCode: text("reasonCode"),
  },
  (table) => ({
    deviceSequenceUnique: uniqueIndex("sync_event_device_sequence_unique").on(
      table.deviceId,
      table.deviceSequence,
    ),
    orgIdx: index("sync_event_org_idx").on(table.organisationId),
    entityIdx: index("sync_event_entity_idx").on(
      table.organisationId,
      table.entityType,
      table.entityId,
    ),
    receivedIdx: index("sync_event_received_idx").on(table.receivedAt),
  }),
);

export const syncEntityVersions = pgTable(
  "bb_sync_entity_version",
  {
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({
      columns: [table.organisationId, table.entityType, table.entityId],
    }),
    entityIdx: index("sync_entity_version_entity_idx").on(
      table.entityType,
      table.entityId,
    ),
  }),
);

export const syncChangeFeed = pgTable(
  "bb_sync_change_feed",
  {
    sequence: bigserial("sequence", { mode: "number" }).primaryKey(),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    siteId: text("siteId"),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    entityVersion: integer("entityVersion").notNull(),
    changeType: text("changeType")
      .$type<"UPSERT" | "DELETE">()
      .notNull(),
    payload: jsonb("payload").$type<unknown>(),
    changedAt: timestamp("changedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    orgSequenceIdx: index("sync_change_feed_org_sequence_idx").on(
      table.organisationId,
      table.sequence,
    ),
    entityIdx: index("sync_change_feed_entity_idx").on(
      table.organisationId,
      table.entityType,
      table.entityId,
    ),
  }),
);

export type ClientEvidenceStatus =
  | "PENDING_UPLOAD"
  | "UPLOADED"
  | "FAILED";

export const clientEvidenceUploads = pgTable(
  "bb_client_evidence_upload",
  {
    evidenceId: text("evidenceId").primaryKey(),
    organisationId: text("organisationId")
      .notNull()
      .references(() => organisations.id, { onDelete: "cascade" }),
    siteId: text("siteId"),
    deviceId: text("deviceId")
      .notNull()
      .references(() => clientDevices.id, { onDelete: "cascade" }),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    entityType: text("entityType").notNull(),
    entityId: text("entityId").notNull(),
    fileName: text("fileName").notNull(),
    contentType: text("contentType").notNull(),
    byteSize: integer("byteSize").notNull(),
    sha256: text("sha256").notNull(),
    storageKey: text("storageKey").notNull(),
    status: text("status")
      .$type<ClientEvidenceStatus>()
      .notNull()
      .default("PENDING_UPLOAD"),
    uploadedAt: timestamp("uploadedAt", { mode: "date" }),
    createdAt: timestamp("createdAt", { mode: "date" }).defaultNow(),
    updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow(),
  },
  (table) => ({
    storageKeyUnique: uniqueIndex("client_evidence_storage_key_unique").on(
      table.storageKey,
    ),
    orgIdx: index("client_evidence_org_idx").on(table.organisationId),
    entityIdx: index("client_evidence_entity_idx").on(
      table.organisationId,
      table.entityType,
      table.entityId,
    ),
    statusIdx: index("client_evidence_status_idx").on(table.status),
  }),
);
