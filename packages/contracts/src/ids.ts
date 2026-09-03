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

// These helpers mark identifiers only at trusted persistence/API boundaries.
// Runtime validation belongs to the schema/parser that accepted the value;
// branding then prevents unrelated string IDs being mixed inside domain code.
export const asOrganisationId = (value: string) => value as OrganisationId;
export const asSiteId = (value: string) => value as SiteId;
export const asUserId = (value: string) => value as UserId;
export const asDeviceId = (value: string) => value as DeviceId;
export const asHardwareDeviceId = (value: string) => value as HardwareDeviceId;
export const asJobId = (value: string) => value as JobId;
export const asJobLoadId = (value: string) => value as JobLoadId;
export const asTicketId = (value: string) => value as TicketId;
export const asEvidenceId = (value: string) => value as EvidenceId;
export const asSyncEventId = (value: string) => value as SyncEventId;
