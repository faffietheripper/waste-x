export type Brand<T, Name extends string> = T & {
  readonly __brand: Name;
};

export type OrganisationId = Brand<string, "OrganisationId">;
export type SiteId = Brand<string, "SiteId">;
export type UserId = Brand<string, "UserId">;
export type DeviceId = Brand<string, "DeviceId">;
export type HardwareDeviceId = Brand<string, "HardwareDeviceId">;
export type JobId = Brand<string, "JobId">;
export type JobLoadId = Brand<string, "JobLoadId">;
export type TicketId = Brand<string, "TicketId">;
export type EvidenceId = Brand<string, "EvidenceId">;
export type SyncEventId = Brand<string, "SyncEventId">;
