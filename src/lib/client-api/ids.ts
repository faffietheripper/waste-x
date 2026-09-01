import crypto from "node:crypto";

const MAX_UUID_V7_TIMESTAMP = 281_474_976_710_655; // 2^48 - 1

/**
 * Generates an RFC 9562 UUIDv7 using the current Unix epoch milliseconds plus
 * cryptographically secure random bytes. UUIDv7 keeps offline-created Waste X
 * identifiers globally unique while remaining broadly time-sortable.
 *
 * This intentionally avoids BigInt literals so it remains compatible with the
 * existing Waste X Next.js TypeScript target.
 */
export function uuidV7(now = Date.now()) {
  const timestamp = Math.floor(now);

  if (
    !Number.isFinite(timestamp) ||
    timestamp < 0 ||
    timestamp > MAX_UUID_V7_TIMESTAMP
  ) {
    throw new RangeError("UUIDv7 timestamp must fit within 48 bits.");
  }

  const bytes = crypto.randomBytes(16);
  let remainingTimestamp = timestamp;

  // UUIDv7 stores Unix epoch milliseconds in the first 48 bits, big-endian.
  for (let index = 5; index >= 0; index -= 1) {
    bytes[index] = remainingTimestamp % 256;
    remainingTimestamp = Math.floor(remainingTimestamp / 256);
  }

  // Version 7 in the high nibble of octet 6.
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  // RFC 4122 / RFC 9562 variant in octet 8.
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
