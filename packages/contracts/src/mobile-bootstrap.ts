export type MobileDriverScopeResolutionV1 =
  | "MATCHED"
  | "NO_DRIVER_MATCH"
  | "AMBIGUOUS_DRIVER_MATCH";

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
    movementAt: string | null;
    ewcCode: string | null;
    wasteDescription: string | null;
    netWeight: string | null;
    weightMetric: "Grams" | "Kilograms" | "Tonnes";
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
