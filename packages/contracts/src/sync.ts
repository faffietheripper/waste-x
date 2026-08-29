import type {
  DeviceId,
  OrganisationId,
  SiteId,
  SyncEventId,
  UserId,
} from "./ids";

export type SyncEntityType =
  | "job"
  | "job_load"
  | "ticket"
  | "evidence"
  | "operational_event";

export type SyncEventDeliveryStatus =
  | "PENDING"
  | "SENDING"
  | "SYNCED"
  | "CONFLICT"
  | "FAILED";

export type SyncApplyStatus =
  | "APPLIED"
  | "DUPLICATE"
  | "CONFLICT"
  | "RETRYABLE_ERROR"
  | "REJECTED";

export interface SyncEventV1<TPayload = unknown> {
  schemaVersion: 1;
  eventId: SyncEventId;
  organisationId: OrganisationId;
  siteId: SiteId | null;
  deviceId: DeviceId;
  actorUserId: UserId;
  entityType: SyncEntityType;
  entityId: string;
  eventType: string;
  baseVersion: number | null;
  deviceSequence: number;
  occurredAt: string;
  recordedAt: string;
  payload: TPayload;
  payloadHash: string;
}

export interface SyncPushRequestV1 {
  protocolVersion: 1;
  deviceId: DeviceId;
  batchId: string;
  events: SyncEventV1[];
}

export interface SyncPushResultV1 {
  eventId: SyncEventId;
  status: SyncApplyStatus;
  entityVersion: number | null;
  reasonCode?: string;
}

export interface SyncPushResponseV1 {
  protocolVersion: 1;
  results: SyncPushResultV1[];
}

export interface SyncPullRequestV1 {
  protocolVersion: 1;
  deviceId: DeviceId;
  cursor: string | null;
  limit?: number;
}

export interface SyncChangeV1 {
  cursor: string;
  entityType: SyncEntityType;
  entityId: string;
  entityVersion: number;
  changeType: "UPSERT" | "DELETE";
  changedAt: string;
  payload: unknown;
}

export interface SyncPullResponseV1 {
  protocolVersion: 1;
  changes: SyncChangeV1[];
  nextCursor: string | null;
  hasMore: boolean;
}
