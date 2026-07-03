// src/modules/digital-waste-tracking/types/referenceData.types.ts

/* =========================================================
   DEFRA REFERENCE DATA TYPES
   Used by:
   GET /reference-data/ewc-codes
   GET /reference-data/hazardous-property-codes
   GET /reference-data/disposal-or-recovery-codes
   GET /reference-data/container-types
   GET /reference-data/pop-names
========================================================= */

/* =========================================================
   CONSTANTS
========================================================= */

export const WASTE_TRACKING_REFERENCE_DATA_TYPES = [
  "ewc_codes",
  "hazardous_property_codes",
  "disposal_or_recovery_codes",
  "container_types",
  "pop_names",
] as const;

export const WASTE_TRACKING_ENVIRONMENTS = ["test", "production"] as const;

/* =========================================================
   TYPE ALIASES
========================================================= */

export type WasteTrackingReferenceDataType =
  (typeof WASTE_TRACKING_REFERENCE_DATA_TYPES)[number];

export type WasteTrackingEnvironment =
  (typeof WASTE_TRACKING_ENVIRONMENTS)[number];

/* =========================================================
   RAW DEFRA RESPONSE TYPES
========================================================= */

export type DefraEwcCode = {
  code: string;
  isHazardous: boolean;
  entryTypeDesc?: string;
  entryTypeDescription?: string;
  chapter?: string;
  subChapter?: string;
  description?: string;
};

export type DefraHazardousPropertyCode = {
  code: string;
  shortDesc?: string;
  longDesc?: string;
};

export type DefraDisposalOrRecoveryCode = {
  code: string;
  isNotRecoveryToFinalProduct?: boolean;
  description?: string;
};

export type DefraContainerType = {
  code: string;
  description?: string;
};

export type DefraPopName = {
  code: string;
  chemicalName?: string;
};

export type DefraReferenceDataResponse =
  | DefraEwcCode[]
  | DefraHazardousPropertyCode[]
  | DefraDisposalOrRecoveryCode[]
  | DefraContainerType[]
  | DefraPopName[];

/* =========================================================
   NORMALISED INTERNAL REFERENCE DATA
   This matches the schema table:
   bb_waste_tracking_reference_data
========================================================= */

export type NormalisedWasteTrackingReferenceDataItem = {
  type: WasteTrackingReferenceDataType;

  code: string;

  description?: string | null;

  isHazardous?: boolean | null;

  metadata?: Record<string, unknown> | null;

  environment: WasteTrackingEnvironment;

  isActive: boolean;
};

/* =========================================================
   REFERENCE DATA GROUPS
   Used by forms/dropdowns.
========================================================= */

export type WasteTrackingReferenceDataGroups = {
  ewcCodes: NormalisedWasteTrackingReferenceDataItem[];

  hazardousPropertyCodes: NormalisedWasteTrackingReferenceDataItem[];

  disposalOrRecoveryCodes: NormalisedWasteTrackingReferenceDataItem[];

  containerTypes: NormalisedWasteTrackingReferenceDataItem[];

  popNames: NormalisedWasteTrackingReferenceDataItem[];
};

/* =========================================================
   SYNC RESULT TYPES
========================================================= */

export type WasteTrackingReferenceDataSyncTarget = {
  type: WasteTrackingReferenceDataType;
  endpoint: string;
};

export type WasteTrackingReferenceDataSyncResult = {
  type: WasteTrackingReferenceDataType;

  endpoint: string;

  fetched: number;

  insertedOrUpdated: number;

  failed: number;

  environment: WasteTrackingEnvironment;

  message: string;
};

export type WasteTrackingReferenceDataSyncSummary = {
  ok: boolean;

  environment: WasteTrackingEnvironment;

  results: WasteTrackingReferenceDataSyncResult[];

  startedAt: Date;

  finishedAt: Date;
};

/* =========================================================
   LOOKUP TYPES
========================================================= */

export type EwcCodeLookupResult = {
  code: string;

  isHazardous: boolean;

  description?: string | null;

  entryTypeDesc?: string | null;

  chapter?: string | null;

  subChapter?: string | null;
};

export type HazardousPropertyCodeLookupResult = {
  code: string;

  shortDesc?: string | null;

  longDesc?: string | null;
};

export type DisposalOrRecoveryCodeLookupResult = {
  code: string;

  description?: string | null;

  isNotRecoveryToFinalProduct?: boolean | null;
};

export type ContainerTypeLookupResult = {
  code: string;

  description?: string | null;
};

export type PopNameLookupResult = {
  code: string;

  chemicalName?: string | null;
};

/* =========================================================
   TYPE GUARDS
========================================================= */

export function isWasteTrackingReferenceDataType(
  value: string,
): value is WasteTrackingReferenceDataType {
  return WASTE_TRACKING_REFERENCE_DATA_TYPES.includes(
    value as WasteTrackingReferenceDataType,
  );
}

export function isWasteTrackingEnvironment(
  value: string,
): value is WasteTrackingEnvironment {
  return WASTE_TRACKING_ENVIRONMENTS.includes(
    value as WasteTrackingEnvironment,
  );
}

/* =========================================================
   ENDPOINT MAP
   Used later by syncReferenceDataAction.
========================================================= */

export const WASTE_TRACKING_REFERENCE_DATA_ENDPOINTS: WasteTrackingReferenceDataSyncTarget[] =
  [
    {
      type: "ewc_codes",
      endpoint: "/reference-data/ewc-codes",
    },
    {
      type: "hazardous_property_codes",
      endpoint: "/reference-data/hazardous-property-codes",
    },
    {
      type: "disposal_or_recovery_codes",
      endpoint: "/reference-data/disposal-or-recovery-codes",
    },
    {
      type: "container_types",
      endpoint: "/reference-data/container-types",
    },
    {
      type: "pop_names",
      endpoint: "/reference-data/pop-names",
    },
  ];