export type MobileDriverScopeResolutionV1 =
  | "MATCHED"
  | "NO_DRIVER_MATCH"
  | "AMBIGUOUS_DRIVER_MATCH";

export type MobileFieldWorkflowStepV1 =
  | "ASSIGNED"
  | "STARTED"
  | "EN_ROUTE"
  | "ARRIVED_COLLECTION"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION"
  | "DELIVERED";

export type MobileFieldWorkflowEventTypeV1 =
  | "FIELD_JOB_STARTED"
  | "FIELD_EN_ROUTE"
  | "FIELD_ARRIVED_COLLECTION"
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION"
  | "FIELD_DELIVERED";

export type MobileCollectionConfirmationKindV1 =
  | "WASTE"
  | "QUANTITY"
  | "MANUAL_WEIGHT";

export type MobileFieldActivityEventTypeV1 =
  | "FIELD_DELIVERY_NOTE_ADDED"
  | "FIELD_ISSUE_REPORTED";

export type MobileFieldIssueTypeV1 =
  | "DELAY"
  | "SITE_ACCESS"
  | "WASTE_MISMATCH"
  | "VEHICLE"
  | "SAFETY"
  | "OTHER";

export interface MobileFieldActivityV1 {
  eventType: MobileFieldActivityEventTypeV1;
  occurredAt: string;
  text: string;
  issueType: MobileFieldIssueTypeV1 | null;
}

export interface MobileFieldWorkflowStateV1 {
  step: MobileFieldWorkflowStepV1;
  updatedAt: string | null;
  lastEventType: MobileFieldWorkflowEventTypeV1 | null;
}

export interface MobileCollectionChecksV1 {
  wasteConfirmedAt: string | null;
  quantityConfirmedAt: string | null;
  manualWeightRecordedAt: string | null;
}

export interface MobileDriverIdentityV1 {
  id: string;
  name: string;
  email: string | null;
  telephone: string | null;
  defaultVehicleId: string | null;
}

export interface MobileAssignmentLocationV1 {
  kind: "OWN_SITE" | "COUNTERPARTY_SITE";
  id: string;
  name: string;
  fullAddress: string | null;
  postcode: string | null;
}

export interface MobileAssignmentV1 {
  job: {
    id: string;
    jobNumber: string;
    jobDate: string;
    status: string;
    direction: "incoming" | "outgoing";
    customerReference: string | null;
    purchaseOrder: string | null;
    notes: string | null;
  };
  load: {
    id: string;
    loadNumber: number;
    status: string;
    direction: "incoming" | "outgoing";
    entityVersion: number;
    movementAt: string | null;
    ewcCode: string | null;
    wasteDescription: string | null;
    grossWeight?: string | null;
    tareWeight?: string | null;
    netWeight: string | null;
    weightMetric: "Grams" | "Kilograms" | "Tonnes";
    weightIsEstimate?: boolean;
    weightSource?: "manual" | "weighbridge" | "imported" | null;
    ticketNumber: string | null;
  };
  transport: {
    driverId: string;
    driverName: string;
    vehicleId: string | null;
    vehicleRegistration: string | null;
  };
  material: {
    id: string;
    name: string;
  } | null;
  origin: MobileAssignmentLocationV1 | null;
  destination: MobileAssignmentLocationV1 | null;
  /**
   * Driver-facing field progress is deliberately separate from the canonical
   * waste/compliance load status. Older cached snapshots may not have this
   * field, so Mobile must treat a missing value as ASSIGNED.
   */
  workflow?: MobileFieldWorkflowStateV1;
  /**
   * Collection confirmations are hydrated from immutable LOAD_DETAILS_UPDATED
   * event metadata. They are optional for backwards compatibility with older
   * encrypted Mobile snapshots.
   */
  collectionChecks?: MobileCollectionChecksV1;
  /**
   * Delivery notes and field issues are immutable field events attached to the
   * same job_load ID. Cloud bootstrap rehydrates these events so they remain
   * visible after a successful sync/refresh.
   */
  fieldActivity?: MobileFieldActivityV1[];
}

export interface MobileAssignmentBootstrapV1 {
  schemaVersion: 1;
  generatedAt: string;
  workingSet: {
    forwardDays: 14;
    horizonStart: string;
    horizonEnd: string;
  };
  scope: {
    resolution: MobileDriverScopeResolutionV1;
    userId: string;
    driver: MobileDriverIdentityV1 | null;
  };
  assignments: MobileAssignmentV1[];
}
