// src/lib/ewc.ts

/**
 * Canonical Waste X EWC storage format:
 * six numeric characters, no spaces and no hazardous asterisk.
 *
 * Examples:
 *   "17 05 04"  -> "170504"
 *   "17-05-04"  -> "170504"
 *   "17 05 03*" -> "170503"
 */
export function normaliseEwcCode(
  value: string,
) {
  return value.replace(/\D/g, "");
}

/**
 * UI-only formatter.
 * Hazardous status is data, not part of the stored code.
 */
export function formatEwcCode(
  value: string,
  isHazardous = false,
) {
  const code =
    normaliseEwcCode(value);

  const formatted =
    code.length === 6
      ? `${code.slice(
          0,
          2,
        )} ${code.slice(
          2,
          4,
        )} ${code.slice(4, 6)}`
      : value;

  return isHazardous
    ? `${formatted}*`
    : formatted;
}