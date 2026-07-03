// src/modules/digital-waste-tracking/types/receiveMovement.types.ts

/* =========================================================
   DEFRA RECEIVE MOVEMENT TYPES
   Used for POST /movements/receive
   and PUT /movements/{wasteTrackingId}/receive
========================================================= */

/* =========================================================
   ENUM-LIKE CONSTANTS
========================================================= */

export const WEIGHT_METRICS = ["Grams", "Kilograms", "Tonnes"] as const;

export const PHYSICAL_FORMS = [
  "Gas",
  "Liquid",
  "Solid",
  "Powder",
  "Sludge",
  "Mixed",
] as const;

export const MEANS_OF_TRANSPORT = [
  "Road",
  "Rail",
  "Air",
  "Sea",
  "Inland Waterway",
  "Piped",
  "Other",
] as const;

export const SOURCE_OF_COMPONENTS = [
  "NOT_PROVIDED",
  "PROVIDED_WITH_WASTE",
  "GUIDANCE",
  "OWN_TESTING",
] as const;

export const REASON_FOR_NO_CONSIGNMENT_CODE = [
  "NON_HAZ_WASTE_TRANSFER",
  "NO_DOC_WITH_WASTE",
  "HWRC_RECEIPT",
] as const;

export const REASON_FOR_NO_REGISTRATION_NUMBER = [
  "ON_SITE",
  "HOUSEHOLD",
  "ONE_OFF",
  "MARINE",
] as const;

export const RECEIVE_MOVEMENT_SUBMISSION_STATUSES = [
  "draft",
  "submitted",
  "accepted",
  "accepted_with_warnings",
  "rejected",
  "failed",
] as const;

export const WASTE_RECEIPT_STATUSES = [
  "draft",
  "confirmed",
  "submitted",
] as const;

/* =========================================================
   TYPE ALIASES
========================================================= */

export type WeightMetric = (typeof WEIGHT_METRICS)[number];

export type PhysicalForm = (typeof PHYSICAL_FORMS)[number];

export type MeansOfTransport = (typeof MEANS_OF_TRANSPORT)[number];

export type SourceOfComponents = (typeof SOURCE_OF_COMPONENTS)[number];

export type ReasonForNoConsignmentCode =
  (typeof REASON_FOR_NO_CONSIGNMENT_CODE)[number];

export type ReasonForNoRegistrationNumber =
  (typeof REASON_FOR_NO_REGISTRATION_NUMBER)[number];

export type ReceiveMovementSubmissionStatus =
  (typeof RECEIVE_MOVEMENT_SUBMISSION_STATUSES)[number];

export type WasteReceiptStatus = (typeof WASTE_RECEIPT_STATUSES)[number];

export type ReceiveMovementSubmissionMethod = "POST" | "PUT";

export type ReceiveMovementSubmissionType = "receive";

/* =========================================================
   SHARED SMALL TYPES
========================================================= */

export type ReceiveMovementAddress = {
  fullAddress?: string;
  postcode: string;
};

export type ReceiveMovementReceiptAddress = {
  fullAddress: string;
  postcode: string;
};

export type ReceiveMovementReference = {
  label: string;
  reference: string;
};

export type ReceiveMovementWeight = {
  metric: WeightMetric;
  amount: number;
  isEstimate: boolean;
};

/* =========================================================
   POPS
========================================================= */

export type ReceiveMovementPopComponent = {
  code: string;
  concentration?: number;
};

export type ReceiveMovementPops = {
  sourceOfComponents: SourceOfComponents;
  components?: ReceiveMovementPopComponent[];
};

/* =========================================================
   HAZARDOUS
========================================================= */

export type ReceiveMovementHazardousComponent = {
  name: string;
  concentration?: number;
};

export type ReceiveMovementHazardous = {
  sourceOfComponents: SourceOfComponents;
  hazCodes?: string[];
  components?: ReceiveMovementHazardousComponent[];
};

/* =========================================================
   DISPOSAL / RECOVERY
========================================================= */

export type ReceiveMovementDisposalOrRecoveryCode = {
  code: string;
  weight: ReceiveMovementWeight;
};

/* =========================================================
   WASTE ITEM
========================================================= */

export type ReceiveMovementWasteItem = {
  ewcCodes: string[];

  wasteDescription: string;

  physicalForm: PhysicalForm;

  numberOfContainers: number;

  typeOfContainers: string;

  weight: ReceiveMovementWeight;

  containsPops: boolean;

  pops?: ReceiveMovementPops;

  containsHazardous: boolean;

  hazardous?: ReceiveMovementHazardous;

  disposalOrRecoveryCodes?: ReceiveMovementDisposalOrRecoveryCode[];
};

/* =========================================================
   CARRIER
========================================================= */

export type ReceiveMovementCarrier = {
  registrationNumber: string | null;

  reasonForNoRegistrationNumber?: ReasonForNoRegistrationNumber;

  organisationName: string;

  address: ReceiveMovementAddress;

  emailAddress?: string;

  phoneNumber?: string;

  vehicleRegistration?: string;

  meansOfTransport: MeansOfTransport;
};

/* =========================================================
   BROKER OR DEALER
========================================================= */

export type ReceiveMovementBrokerOrDealer = {
  organisationName: string;

  address?: ReceiveMovementAddress;

  emailAddress?: string;

  phoneNumber?: string;

  registrationNumber?: string;
};

/* =========================================================
   RECEIVER
========================================================= */

export type ReceiveMovementReceiver = {
  siteName: string;

  emailAddress?: string;

  phoneNumber?: string;

  authorisationNumber: string;

  regulatoryPositionStatements?: number[];
};

/* =========================================================
   RECEIPT
========================================================= */

export type ReceiveMovementReceipt = {
  address: ReceiveMovementReceiptAddress;
};

/* =========================================================
   FINAL DEFRA PAYLOAD
========================================================= */

export type ReceiveMovementPayload = {
  apiCode: string;

  dateTimeReceived: string;

  hazardousWasteConsignmentCode?: string;

  reasonForNoConsignmentCode?: ReasonForNoConsignmentCode;

  yourUniqueReference?: string;

  otherReferencesForMovement?: ReceiveMovementReference[];

  specialHandlingRequirements?: string;

  wasteItems: ReceiveMovementWasteItem[];

  carrier: ReceiveMovementCarrier;

  brokerOrDealer?: ReceiveMovementBrokerOrDealer;

  receiver: ReceiveMovementReceiver;

  receipt: ReceiveMovementReceipt;
};

/* =========================================================
   FORM / CORE INPUT TYPE
   This is the internal Waste X input shape before building
   the final Defra payload.
========================================================= */

export type ReceiveMovementInput = {
  receiverApiCode: string;

  dateTimeReceived: string;

  hazardousWasteConsignmentCode?: string | null;

  reasonForNoConsignmentCode?: ReasonForNoConsignmentCode | null;

  yourUniqueReference?: string | null;

  otherReferencesForMovement?: ReceiveMovementReference[];

  specialHandlingRequirements?: string | null;

  wasteItems: ReceiveMovementInputWasteItem[];

  carrier: ReceiveMovementInputCarrier;

  brokerOrDealer?: ReceiveMovementInputBrokerOrDealer | null;

  receiver: ReceiveMovementInputReceiver;

  receipt: ReceiveMovementInputReceipt;
};

export type ReceiveMovementInputWasteItem = {
  ewcCodes: string[];

  wasteDescription: string;

  physicalForm: PhysicalForm;

  numberOfContainers: number;

  typeOfContainers: string;

  weight: ReceiveMovementWeight;

  containsPops: boolean;

  popsSourceOfComponents?: SourceOfComponents | null;

  popsComponents?: ReceiveMovementPopComponent[];

  containsHazardous: boolean;

  hazardousSourceOfComponents?: SourceOfComponents | null;

  hazCodes?: string[];

  hazardousComponents?: ReceiveMovementHazardousComponent[];

  disposalOrRecoveryCodes?: ReceiveMovementDisposalOrRecoveryCode[];
};

export type ReceiveMovementInputCarrier = {
  registrationNumber?: string | null;

  reasonForNoRegistrationNumber?: ReasonForNoRegistrationNumber | null;

  organisationName: string;

  address: ReceiveMovementAddress;

  emailAddress?: string | null;

  phoneNumber?: string | null;

  vehicleRegistration?: string | null;

  meansOfTransport: MeansOfTransport;
};

export type ReceiveMovementInputBrokerOrDealer = {
  organisationName?: string | null;

  address?: ReceiveMovementAddress | null;

  emailAddress?: string | null;

  phoneNumber?: string | null;

  registrationNumber?: string | null;
};

export type ReceiveMovementInputReceiver = {
  siteName: string;

  emailAddress?: string | null;

  phoneNumber?: string | null;

  authorisationNumber: string;

  regulatoryPositionStatements?: number[];
};

export type ReceiveMovementInputReceipt = {
  address: ReceiveMovementReceiptAddress;
};

/* =========================================================
   DEFRA VALIDATION RESPONSE TYPES
========================================================= */

export type DefraValidationErrorType =
  | "NotProvided"
  | "NotAllowed"
  | "InvalidType"
  | "InvalidFormat"
  | "InvalidValue"
  | "OutOfRange"
  | "BusinessRuleViolation"
  | "Required"
  | string;

export type DefraValidationResult = {
  key: string;
  errorType: DefraValidationErrorType;
  message: string;
};

export type DefraReceiveMovementSuccessResponse = {
  wasteTrackingId?: string;
  validation?: {
    warnings?: DefraValidationResult[];
  };
};

export type DefraReceiveMovementErrorResponse = {
  validation?: {
    errors?: DefraValidationResult[];
  };
};

export type DefraReceiveMovementResponse =
  | DefraReceiveMovementSuccessResponse
  | DefraReceiveMovementErrorResponse;

/* =========================================================
   INTERNAL ACTION RESULT TYPES
========================================================= */

export type ReceiveMovementSubmissionResult =
  | {
      ok: true;
      statusCode: number;
      method: ReceiveMovementSubmissionMethod;
      endpoint: string;
      wasteTrackingId?: string;
      warnings: DefraValidationResult[];
      message: string;
    }
  | {
      ok: false;
      statusCode?: number;
      method?: ReceiveMovementSubmissionMethod;
      endpoint?: string;
      errors: DefraValidationResult[];
      message: string;
    };

export type ReceiveMovementLocalValidationResult =
  | {
      valid: true;
      warnings: DefraValidationResult[];
    }
  | {
      valid: false;
      errors: DefraValidationResult[];
      warnings: DefraValidationResult[];
    };

/* =========================================================
   TYPE GUARDS / SMALL HELPERS
   These are intentionally dependency-free.
========================================================= */

export function isWeightMetric(value: string): value is WeightMetric {
  return WEIGHT_METRICS.includes(value as WeightMetric);
}

export function isPhysicalForm(value: string): value is PhysicalForm {
  return PHYSICAL_FORMS.includes(value as PhysicalForm);
}

export function isMeansOfTransport(value: string): value is MeansOfTransport {
  return MEANS_OF_TRANSPORT.includes(value as MeansOfTransport);
}

export function isSourceOfComponents(
  value: string,
): value is SourceOfComponents {
  return SOURCE_OF_COMPONENTS.includes(value as SourceOfComponents);
}

export function isReasonForNoConsignmentCode(
  value: string,
): value is ReasonForNoConsignmentCode {
  return REASON_FOR_NO_CONSIGNMENT_CODE.includes(
    value as ReasonForNoConsignmentCode,
  );
}

export function isReasonForNoRegistrationNumber(
  value: string,
): value is ReasonForNoRegistrationNumber {
  return REASON_FOR_NO_REGISTRATION_NUMBER.includes(
    value as ReasonForNoRegistrationNumber,
  );
}