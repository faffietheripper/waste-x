// src/modules/digital-waste-tracking/core/normaliseReferenceData.ts

import type {
  DefraContainerType,
  DefraDisposalOrRecoveryCode,
  DefraEwcCode,
  DefraHazardousPropertyCode,
  DefraPopName,
  NormalisedWasteTrackingReferenceDataItem,
  WasteTrackingEnvironment,
  WasteTrackingReferenceDataType,
} from "../types/referenceData.types";

/* =========================================================
   SMALL INTERNAL HELPERS
========================================================= */

function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : null;
}

function cleanCode(value: unknown): string | null {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  /*
    Keep original case for codes where Defra is case-sensitive:
    - HP_1
    - R1
    - BAG
    - PFHXS

    For EWC codes, the value should already be numeric string.
  */
  return cleaned;
}

function cleanBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;

  return null;
}

function removeNullishMetadata(
  metadata: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value === null || value === undefined) return false;
      if (typeof value === "string" && value.trim().length === 0) return false;

      return true;
    }),
  );
}

function makeReferenceItem(params: {
  type: WasteTrackingReferenceDataType;
  code: string;
  description?: string | null;
  isHazardous?: boolean | null;
  metadata?: Record<string, unknown> | null;
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem {
  return {
    type: params.type,
    code: params.code,
    description: params.description ?? null,
    isHazardous: params.isHazardous ?? null,
    metadata: params.metadata ?? null,
    environment: params.environment,
    isActive: true,
  };
}

/* =========================================================
   EWC CODES
   GET /reference-data/ewc-codes
========================================================= */

export function normaliseEwcCodes(params: {
  items: DefraEwcCode[];
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem[] {
  return params.items
    .map((item) => {
      const code = cleanCode(item.code);

      if (!code) return null;

      const description = cleanString(item.description);

      const entryTypeDesc =
        cleanString(item.entryTypeDesc) ??
        cleanString(item.entryTypeDescription);

      const metadata = removeNullishMetadata({
        entryTypeDesc,
        chapter: cleanString(item.chapter),
        subChapter: cleanString(item.subChapter),
        original: item,
      });

      return makeReferenceItem({
        type: "ewc_codes",
        code,
        description,
        isHazardous: cleanBoolean(item.isHazardous) ?? false,
        metadata,
        environment: params.environment,
      });
    })
    .filter(
      (item): item is NormalisedWasteTrackingReferenceDataItem =>
        item !== null,
    );
}

/* =========================================================
   HAZARDOUS PROPERTY CODES
   GET /reference-data/hazardous-property-codes
========================================================= */

export function normaliseHazardousPropertyCodes(params: {
  items: DefraHazardousPropertyCode[];
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem[] {
  return params.items
    .map((item) => {
      const code = cleanCode(item.code);

      if (!code) return null;

      const shortDesc = cleanString(item.shortDesc);
      const longDesc = cleanString(item.longDesc);

      const metadata = removeNullishMetadata({
        shortDesc,
        longDesc,
        original: item,
      });

      return makeReferenceItem({
        type: "hazardous_property_codes",
        code,
        description: shortDesc ?? longDesc,
        isHazardous: null,
        metadata,
        environment: params.environment,
      });
    })
    .filter(
      (item): item is NormalisedWasteTrackingReferenceDataItem =>
        item !== null,
    );
}

/* =========================================================
   DISPOSAL OR RECOVERY CODES
   GET /reference-data/disposal-or-recovery-codes
========================================================= */

export function normaliseDisposalOrRecoveryCodes(params: {
  items: DefraDisposalOrRecoveryCode[];
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem[] {
  return params.items
    .map((item) => {
      const code = cleanCode(item.code);

      if (!code) return null;

      const description = cleanString(item.description);

      const metadata = removeNullishMetadata({
        isNotRecoveryToFinalProduct: cleanBoolean(
          item.isNotRecoveryToFinalProduct,
        ),
        original: item,
      });

      return makeReferenceItem({
        type: "disposal_or_recovery_codes",
        code,
        description,
        isHazardous: null,
        metadata,
        environment: params.environment,
      });
    })
    .filter(
      (item): item is NormalisedWasteTrackingReferenceDataItem =>
        item !== null,
    );
}

/* =========================================================
   CONTAINER TYPES
   GET /reference-data/container-types
========================================================= */

export function normaliseContainerTypes(params: {
  items: DefraContainerType[];
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem[] {
  return params.items
    .map((item) => {
      const code = cleanCode(item.code);

      if (!code) return null;

      const description = cleanString(item.description);

      const metadata = removeNullishMetadata({
        original: item,
      });

      return makeReferenceItem({
        type: "container_types",
        code,
        description,
        isHazardous: null,
        metadata,
        environment: params.environment,
      });
    })
    .filter(
      (item): item is NormalisedWasteTrackingReferenceDataItem =>
        item !== null,
    );
}

/* =========================================================
   POP NAMES
   GET /reference-data/pop-names
========================================================= */

export function normalisePopNames(params: {
  items: DefraPopName[];
  environment: WasteTrackingEnvironment;
}): NormalisedWasteTrackingReferenceDataItem[] {
  return params.items
    .map((item) => {
      const code = cleanCode(item.code);

      if (!code) return null;

      const chemicalName = cleanString(item.chemicalName);

      const metadata = removeNullishMetadata({
        chemicalName,
        original: item,
      });

      return makeReferenceItem({
        type: "pop_names",
        code,
        description: chemicalName,
        isHazardous: null,
        metadata,
        environment: params.environment,
      });
    })
    .filter(
      (item): item is NormalisedWasteTrackingReferenceDataItem =>
        item !== null,
    );
}

/* =========================================================
   GENERIC NORMALISER
   Used later by syncReferenceDataAction.
========================================================= */

export function normaliseReferenceData(params:
  | {
      type: "ewc_codes";
      items: DefraEwcCode[];
      environment: WasteTrackingEnvironment;
    }
  | {
      type: "hazardous_property_codes";
      items: DefraHazardousPropertyCode[];
      environment: WasteTrackingEnvironment;
    }
  | {
      type: "disposal_or_recovery_codes";
      items: DefraDisposalOrRecoveryCode[];
      environment: WasteTrackingEnvironment;
    }
  | {
      type: "container_types";
      items: DefraContainerType[];
      environment: WasteTrackingEnvironment;
    }
  | {
      type: "pop_names";
      items: DefraPopName[];
      environment: WasteTrackingEnvironment;
    }): NormalisedWasteTrackingReferenceDataItem[] {
  if (params.type === "ewc_codes") {
    return normaliseEwcCodes({
      items: params.items,
      environment: params.environment,
    });
  }

  if (params.type === "hazardous_property_codes") {
    return normaliseHazardousPropertyCodes({
      items: params.items,
      environment: params.environment,
    });
  }

  if (params.type === "disposal_or_recovery_codes") {
    return normaliseDisposalOrRecoveryCodes({
      items: params.items,
      environment: params.environment,
    });
  }

  if (params.type === "container_types") {
    return normaliseContainerTypes({
      items: params.items,
      environment: params.environment,
    });
  }

  if (params.type === "pop_names") {
    return normalisePopNames({
      items: params.items,
      environment: params.environment,
    });
  }

  return [];
}

/* =========================================================
   DB SERIALISATION HELPERS
   Your schema stores metadata as text, not jsonb.
========================================================= */

export function serialiseReferenceMetadata(
  metadata: Record<string, unknown> | null | undefined,
): string | null {
  if (!metadata) return null;

  try {
    return JSON.stringify(metadata);
  } catch {
    return null;
  }
}

export function parseReferenceMetadata(
  metadata: string | null | undefined,
): Record<string, unknown> | null {
  if (!metadata) return null;

  try {
    const parsed = JSON.parse(metadata);

    if (
      parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
    ) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

/* =========================================================
   LOOKUP HELPERS
   Used later by local validation.
========================================================= */

export function normaliseEwcCodeInput(code: string): string {
  /*
    EWC codes must be six digits, no spaces.
    This helper removes common user formatting like:
    "17 09 04" -> "170904"
  */
  return code.replace(/\s+/g, "").trim();
}

export function isValidEwcCodeFormat(code: string): boolean {
  return /^\d{6}$/.test(normaliseEwcCodeInput(code));
}

export function isValidPositiveNumber(value: unknown): boolean {
  if (typeof value !== "number") return false;

  return Number.isFinite(value) && value > 0;
}

export function isValidNonNegativeInteger(value: unknown): boolean {
  if (typeof value !== "number") return false;

  return Number.isInteger(value) && value >= 0;
}

/* =========================================================
   DISPLAY HELPERS
   Used by forms/cards later.
========================================================= */

export function formatReferenceDataLabel(
  item: NormalisedWasteTrackingReferenceDataItem,
): string {
  if (item.description) {
    return `${item.code} — ${item.description}`;
  }

  return item.code;
}

export function groupReferenceDataByType(
  items: NormalisedWasteTrackingReferenceDataItem[],
): Record<
  WasteTrackingReferenceDataType,
  NormalisedWasteTrackingReferenceDataItem[]
> {
  return {
    ewc_codes: items.filter((item) => item.type === "ewc_codes"),
    hazardous_property_codes: items.filter(
      (item) => item.type === "hazardous_property_codes",
    ),
    disposal_or_recovery_codes: items.filter(
      (item) => item.type === "disposal_or_recovery_codes",
    ),
    container_types: items.filter((item) => item.type === "container_types"),
    pop_names: items.filter((item) => item.type === "pop_names"),
  };
}