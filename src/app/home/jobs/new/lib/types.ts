export type BookJobClient = {
  id: string;
  name: string;
  accountReference: string | null;
};

export type BookJobClientSite = {
  id: string;
  counterpartyId: string;
  name: string;
  fullAddress: string | null;
  postcode: string | null;
  isDefault: boolean;
};

export type BookJobHaulier = {
  id: string;
  name: string;
  carrierRegistrationNumber: string | null;
};

export type BookJobDriver = {
  id: string;
  name: string;
  haulierCounterpartyId: string | null;
  defaultVehicleId: string | null;
};

export type BookJobVehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  haulierCounterpartyId: string | null;
};

export type BookJobMaterial = {
  id: string;
  name: string;
  ewcCodeId: string;
  ewcCode: string;
  wasteDescription: string;
  physicalForm: string;
  defaultWeightMetric: string;
  isFavourite: boolean;
};

export type BookJobPermittedEwc = {
  id: string;
  code: string;
  description: string;
  isHazardous: boolean | null;
};

export type BookJobRate = {
  id: string;
  rateType:
    | "customer_charge"
    | "haulage_cost"
    | "tipping_cost"
    | "material_sale"
    | "other";
  unit: "tonne" | "load" | "job";
  amount: string;
  currency: string;
  counterpartyId: string | null;
  counterpartySiteId: string | null;
  ownSiteId: string | null;
  materialProfileId: string | null;
  effectiveFrom: string | null;
  effectiveTo: string | null;
};

export type BookJobFormData = {
  receivingSite: {
    id: string;
    name: string;
    fullAddress: string | null;
    postcode: string | null;
  };
  primaryPermit: {
    id: string;
    permitNumber: string;
  };
  permittedEwcCodeIds: string[];
  permittedEwcCodes: BookJobPermittedEwc[];
  clients: BookJobClient[];
  clientSites: BookJobClientSite[];
  hauliers: BookJobHaulier[];
  drivers: BookJobDriver[];
  vehicles: BookJobVehicle[];
  materials: BookJobMaterial[];
  rates: BookJobRate[];
};

export type BookJobInitialValues = {
  jobDate?: string;
  plannedLoads?: number;
  purchaseOrder?: string;
  customerReference?: string;
  clientId?: string;
  clientSiteId?: string;
  transportMode?: "own" | "external";
  haulierId?: string;
  driverId?: string;
  vehicleId?: string;
  materialProfileId?: string;
  notes?: string;
  source?: "manual" | "repeat" | "template";
  sourceTemplateId?: string;
  sourceLabel?: string;
};

export type BookJobTemplateOption = {
  id: string;
  name: string;
  clientName: string | null;
  materialName: string | null;
  plannedLoads: number;
  lastUsedAt: string | null;
};

export type QuickCreateResult<T> =
  | {
      ok: true;
      data: T;
    }
  | {
      ok: false;
      error: string;
    };
