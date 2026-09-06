function normaliseJobNumber(value: string) {
  const normalised = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalised || "WX-JOB";
}

function loadCode(loadId: string) {
  const code = loadId
    .replace(/[^a-fA-F0-9]/g, "")
    .slice(0, 8)
    .toUpperCase();

  if (code) return code;

  // UUID job/load IDs are the production path. This non-cryptographic fallback
  // only keeps fixtures/non-UUID imports deterministic; immutable loadId stays
  // the canonical identity regardless of the human ticket reference.
  let hash = 2166136261;
  for (const character of loadId) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, "0").slice(0, 8);
}

/**
 * Offline-safe MVP receiving-site ticket reference.
 *
 * The immutable load ID prevents collisions across devices without requiring a
 * live Cloud counter. If customers later require strictly sequential site
 * numbers, use pre-allocated offline ranges rather than renumbering tickets.
 */
export function deriveReceivingSiteTicketNumber(input: {
  jobNumber: string;
  loadNumber: number;
  loadId: string;
}) {
  const loadNumber = Number.isInteger(input.loadNumber) && input.loadNumber > 0
    ? input.loadNumber
    : 1;
  return `${normaliseJobNumber(input.jobNumber)}-L${String(loadNumber).padStart(2, "0")}-${loadCode(input.loadId)}`;
}
