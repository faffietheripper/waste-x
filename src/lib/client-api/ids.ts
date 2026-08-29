import crypto from "node:crypto";

/**
 * Generates an RFC 9562 UUIDv7 using the current Unix epoch milliseconds plus
 * cryptographically secure random bytes. UUIDv7 keeps offline-created Waste X
 * identifiers globally unique while remaining broadly time-sortable.
 */
export function uuidV7(now = Date.now()) {
  const bytes = crypto.randomBytes(16);
  const timestamp = BigInt(now);

  bytes[0] = Number((timestamp >> 40n) & 0xffn);
  bytes[1] = Number((timestamp >> 32n) & 0xffn);
  bytes[2] = Number((timestamp >> 24n) & 0xffn);
  bytes[3] = Number((timestamp >> 16n) & 0xffn);
  bytes[4] = Number((timestamp >> 8n) & 0xffn);
  bytes[5] = Number(timestamp & 0xffn);

  // Version 7 in the high nibble of octet 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 / RFC 9562 variant in octet 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
