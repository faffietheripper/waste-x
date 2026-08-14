// src/app/home/receiving/intake/[assignmentId]/receiveMovementFormTypes.ts

import type {
  MeansOfTransport,
  PhysicalForm,
  ReasonForNoConsignmentCode,
  ReasonForNoRegistrationNumber,
  SourceOfComponents,
  WeightMetric,
} from "@/modules/digital-waste-tracking/types/receiveMovement.types";

export type DefaultCarrier = {
  organisationName: string;
  fullAddress: string;
  postcode: string;
  emailAddress: string;
  phoneNumber: string;
  registrationNumber?: string | null;
  reasonForNoRegistrationNumber?: ReasonForNoRegistrationNumber | "" | null;
  meansOfTransport?: MeansOfTransport | null;
  vehicleRegistration?: string | null;
};

export type DefaultReceiver = {
  siteName: string;
  fullAddress: string;
  postcode: string;
  emailAddress: string;
  phoneNumber: string;
  authorisationNumber?: string | null;
  regulatoryPositionStatements?: string | null;
};

export type DefaultMovementDraft = {
  dateTimeReceived?: string | null;
  hazardousWasteConsignmentCode?: string | null;
  reasonForNoConsignmentCode?: ReasonForNoConsignmentCode | "" | null;
  yourUniqueReference?: string | null;
  specialHandlingRequirements?: string | null;
};

export type ReceiveMovementFormProps = {
  assignmentId: string;
  listingId: number;
  listingName: string;
  listingLocation: string;
  canSubmit: boolean;
  existingWasteTrackingId?: string | null;
  defaultReceiverApiCode: string;
  defaultCarrier: DefaultCarrier;
  defaultReceiver: DefaultReceiver;

  /**
   * Draft data created by External Job + DWT Draft Builder.
   */
  receiptId?: string | null;
  defaultMovement?: DefaultMovementDraft | null;
  defaultWasteItems?: WasteItemFormState[];
};

export type FeedbackType = "success" | "warning" | "error" | "info";

export type SubmitFeedback = {
  type: FeedbackType;
  title: string;
  message: string;
  details?: string[];
  isExpectedPatRejection?: boolean;
};

export type FormIssue = {
  key: string;
  section: string;
  message: string;
};

export type PatScenarioId =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R07"
  | "C01"
  | "C02"
  | "B01"
  | "P01"
  | "H01"
  | "H02"
  | "H03"
  | "X01";

export type PatExpectedErrorOverride = "" | "C01" | "H02";

export type DisposalRecoveryFormState = {
  id: string;
  code: string;
  weightAmount: string;
  weightMetric: WeightMetric;
  weightIsEstimate: boolean;
};

export type PopsComponentFormState = {
  id: string;
  code: string;
  concentration: string;
};

export type HazardousComponentFormState = {
  id: string;
  name: string;
  concentration: string;
};

export type WasteItemFormState = {
  id: string;
  ewcCodes: string;
  wasteDescription: string;
  physicalForm: PhysicalForm;
  numberOfContainers: string;
  typeOfContainers: string;
  weightMetric: WeightMetric;
  weightAmount: string;
  weightIsEstimate: boolean;

  containsPops: boolean;
  popsSourceOfComponents: SourceOfComponents;
  popsComponents: PopsComponentFormState[];

  containsHazardous: boolean;
  hazardousSourceOfComponents: SourceOfComponents;
  hazCodes: string;
  hazardousComponents: HazardousComponentFormState[];

  disposalOrRecoveryCodes: DisposalRecoveryFormState[];
};

export type BrokerDealerFormState = {
  organisationName: string;
  fullAddress: string;
  postcode: string;
  emailAddress: string;
  phoneNumber: string;
  registrationNumber: string;
};

export type PatScenarioTemplate = {
  scenarioId: PatScenarioId;
  label: string;
  description: string;
  expectedResult: "success" | "error";
  expectedErrorScenarioId?: PatExpectedErrorOverride;

  yourUniqueReference: string;
  specialHandlingRequirements: string;
  hazardousWasteConsignmentCode: string;
  reasonForNoConsignmentCode: ReasonForNoConsignmentCode | "";

  carrierRegistrationNumber: string;
  carrierReasonForNoRegistrationNumber: ReasonForNoRegistrationNumber | "";
  carrierOrganisationName: string;
  carrierFullAddress: string;
  carrierPostcode: string;
  carrierEmailAddress: string;
  carrierPhoneNumber: string;
  carrierMeansOfTransport: MeansOfTransport;
  carrierVehicleRegistration: string;

  receiverSiteName: string;
  receiverAuthorisationNumber: string;
  receiverEmailAddress: string;
  receiverPhoneNumber: string;
  receiptFullAddress: string;
  receiptPostcode: string;

  brokerDealerEnabled: boolean;
  brokerOrDealer: BrokerDealerFormState;

  wasteItems: WasteItemFormState[];
};

export function createFormId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function createDisposalRecoveryCode(
  overrides?: Partial<DisposalRecoveryFormState>,
): DisposalRecoveryFormState {
  return {
    id: createFormId("rd"),
    code: "",
    weightAmount: "",
    weightMetric: "Tonnes",
    weightIsEstimate: true,
    ...overrides,
  };
}

export function createPopsComponent(
  overrides?: Partial<PopsComponentFormState>,
): PopsComponentFormState {
  return {
    id: createFormId("pop"),
    code: "",
    concentration: "",
    ...overrides,
  };
}

export function createHazardousComponent(
  overrides?: Partial<HazardousComponentFormState>,
): HazardousComponentFormState {
  return {
    id: createFormId("haz"),
    name: "",
    concentration: "",
    ...overrides,
  };
}

export function createDefaultWasteItem(
  listingName = "",
  overrides?: Partial<WasteItemFormState>,
): WasteItemFormState {
  return {
    id: createFormId("waste"),
    ewcCodes: "",
    wasteDescription: listingName,
    physicalForm: "Solid",
    numberOfContainers: "1",
    typeOfContainers: "SKI",
    weightMetric: "Tonnes",
    weightAmount: "",
    weightIsEstimate: true,

    containsPops: false,
    popsSourceOfComponents: "NOT_PROVIDED",
    popsComponents: [],

    containsHazardous: false,
    hazardousSourceOfComponents: "NOT_PROVIDED",
    hazCodes: "",
    hazardousComponents: [],

    disposalOrRecoveryCodes: [createDisposalRecoveryCode()],
    ...overrides,
  };
}

export function createDefaultBrokerDealer(
  overrides?: Partial<BrokerDealerFormState>,
): BrokerDealerFormState {
  return {
    organisationName: "",
    fullAddress: "",
    postcode: "",
    emailAddress: "",
    phoneNumber: "",
    registrationNumber: "",
    ...overrides,
  };
}