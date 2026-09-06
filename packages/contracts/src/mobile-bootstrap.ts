export type MobileDriverScopeResolutionV1 =
  | "MATCHED"
  | "NO_DRIVER_MATCH"
  | "AMBIGUOUS_DRIVER_MATCH";

/**
 * Driver progress is intentionally small. The Driver confirms only physical
 * transport milestones they directly control. Site acceptance/rejection,
 * weights, completion and receiving-site ticketing belong to Web/Desktop.
 *
 * The one exception is a pre-collection refusal: while still ASSIGNED the
 * Driver may reject the booked collection if the waste/site is unsuitable.
 * That is recorded as FIELD_COLLECTION_REJECTED and becomes unavailable as
 * soon as FIELD_COLLECTED has been recorded.
 */
export type MobileFieldWorkflowStepV1 =
  | "ASSIGNED"
  | "COLLECTED"
  | "IN_TRANSIT"
  | "ARRIVED_DESTINATION";

export type MobileFieldWorkflowEventTypeV1 =
  | "FIELD_COLLECTED"
  | "FIELD_IN_TRANSIT"
  | "FIELD_ARRIVED_DESTINATION";

export type MobileFieldActivityEventTypeV1 =
  | "FIELD_COLLECTION_REJECTED"
  | "FIELD_DELIVERY_NOTE_ADDED"
  | "FIELD_ISSUE_REPORTED";

export type MobileFieldIssueTypeV1 =
  | "DELAY"
  | "SITE_ACCESS"
  | "WASTE_MISMATCH"
  | "VEHICLE"
  | "SAFETY"
  | "OTHER";

export type MobileSiteRejectionCategoryV1 =
  | "WASTE_MISMATCH"
  | "CONTAMINATION"
  | "PERMIT_OR_COMPLIANCE"
  | "UNSAFE_LOAD"
  | "DOCUMENTATION"
  | "SITE_CAPACITY"
  | "OTHER";

export interface MobileSiteRejectionV1 {
  category: MobileSiteRejectionCategoryV1;
  categoryLabel: string;
  reason: string;
  rejectedAt: string | null;
}

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
    /** Read-only on Driver Mobile. Issued by receiving-site Web/Desktop. */
    ticketNumber: string | null;
    /**
     * Present only when the receiving site has refused the load after Driver
     * destination arrival. Driver pre-collection refusal remains fieldActivity
     * and is intentionally a different authority/event.
     */
    siteRejection?: MobileSiteRejectionV1 | null;
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
   * Driver-facing progress is separate from the canonical site/compliance load
   * status. Missing/legacy state is normalised to the simplified workflow by
   * the clients/API rather than giving the Driver site authority.
   */
  workflow?: MobileFieldWorkflowStateV1;
  /**
   * Driver collection refusals, arrival notes and field issues stay attached
   * to the same immutable load. Only FIELD_COLLECTION_REJECTED is a terminal
   * Driver decision, and it is valid solely before collection. Site acceptance
   * and destination rejection remain Web/Desktop authority.
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
