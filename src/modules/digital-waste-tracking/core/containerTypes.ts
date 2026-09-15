/*
 * WASTE_X_DWT_CONTAINER_CANONICAL_V1
 *
 * DEFRA Receipt of Waste requires typeOfContainers to be a case-sensitive
 * three-letter reference-data code. Waste X historically stored operator-facing
 * labels such as "Bulk" and "Skip". This boundary keeps those historical
 * snapshots usable while every DWT payload receives a valid current code.
 *
 * Current DEFRA container codes (Receipt API reference data, 2026):
 * BAG, BAL, BOX, CAN, CAR, CAS, CON, DRU, FIB, IBC, LOO, PAL, ROR, SKI, TAN, WBI.
 *
 * Unknown legacy labels intentionally become CON ("Container unspecified")
 * rather than being sent as invalid free text. Loose/bulk waste becomes LOO and
 * therefore carries a zero container count.
 */

export const DWT_CONTAINER_TYPE_CODES = [
  "BAG",
  "BAL",
  "BOX",
  "CAN",
  "CAR",
  "CAS",
  "CON",
  "DRU",
  "FIB",
  "IBC",
  "LOO",
  "PAL",
  "ROR",
  "SKI",
  "TAN",
  "WBI",
] as const;

export type DwtContainerTypeCode =
  (typeof DWT_CONTAINER_TYPE_CODES)[number];

const CODE_SET = new Set<string>(DWT_CONTAINER_TYPE_CODES);

function aliasKey(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ALIASES: Record<string, DwtContainerTypeCode> = {
  bag: "BAG",
  bags: "BAG",
  sack: "BAG",
  sacks: "BAG",
  "bag sack": "BAG",
  "rubble bag": "BAG",
  "refuse sack": "BAG",

  bale: "BAL",
  bales: "BAL",

  box: "BOX",
  boxes: "BOX",
  carton: "BOX",
  cartons: "BOX",
  crate: "BOX",
  crates: "BOX",
  "box carton crate": "BOX",

  can: "CAN",
  cans: "CAN",
  jerrycan: "CAN",
  jerrycans: "CAN",
  "can jerrycan": "CAN",

  carrier: "CAR",
  "pallet cage": "CAR",
  cage: "CAR",

  cask: "CAS",
  casks: "CAS",

  container: "CON",
  "container unspecified": "CON",
  unspecified: "CON",

  drum: "DRU",
  drums: "DRU",
  "205l drum": "DRU",

  "fibre drum": "FIB",
  "fiber drum": "FIB",

  ibc: "IBC",
  "intermediate bulk container": "IBC",

  loose: "LOO",
  bulk: "LOO",
  "loose bulk": "LOO",
  "bulk loose": "LOO",
  "no container": "LOO",
  "loose no container": "LOO",

  pallet: "PAL",
  pallets: "PAL",
  "shrink wrapped pallet": "PAL",

  ror: "ROR",
  roro: "ROR",
  "roll on roll off": "ROR",
  "roll on roll off container": "ROR",

  skip: "SKI",
  skips: "SKI",

  tank: "TAN",
  tanker: "TAN",
  "tanker tank": "TAN",

  bin: "WBI",
  "wheelie bin": "WBI",
  "wheelie bins": "WBI",
};

export function isDwtContainerTypeCode(
  value: string | null | undefined,
): value is DwtContainerTypeCode {
  return CODE_SET.has((value ?? "").trim());
}

export function canonicaliseDwtContainer(params: {
  typeOfContainers: string | null | undefined;
  numberOfContainers: number | null | undefined;
}) {
  const raw = (params.typeOfContainers ?? "").trim();
  const upper = raw.toUpperCase();

  const code: DwtContainerTypeCode = CODE_SET.has(upper)
    ? (upper as DwtContainerTypeCode)
    : ALIASES[aliasKey(raw)] ??
      (Number(params.numberOfContainers ?? 0) === 0 ? "LOO" : "CON");

  const rawCount = Number(params.numberOfContainers ?? 0);
  const safeCount =
    Number.isInteger(rawCount) && rawCount >= 0 ? rawCount : 0;

  return {
    code,
    numberOfContainers: code === "LOO" ? 0 : safeCount,
  };
}
