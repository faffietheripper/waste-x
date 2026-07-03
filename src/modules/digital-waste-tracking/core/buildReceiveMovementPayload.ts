// src/modules/digital-waste-tracking/core/buildReceiveMovementPayload.ts

import type {
  ReceiveMovementBrokerOrDealer,
  ReceiveMovementCarrier,
  ReceiveMovementDisposalOrRecoveryCode,
  ReceiveMovementHazardous,
  ReceiveMovementHazardousComponent,
  ReceiveMovementInput,
  ReceiveMovementInputBrokerOrDealer,
  ReceiveMovementInputCarrier,
  ReceiveMovementInputWasteItem,
  ReceiveMovementPayload,
  ReceiveMovementPopComponent,
  ReceiveMovementPops,
  ReceiveMovementReference,
  ReceiveMovementReceiver,
  ReceiveMovementReceipt,
  ReceiveMovementWasteItem,
} from "../types/receiveMovement.types";

/* =========================================================
   SMALL CLEANING HELPERS
========================================================= */

function cleanString(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function cleanNullableString(value: string | null | undefined): string | null {
  return cleanString(value) ?? null;
}

function cleanStringArray(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) return [];

  return values
    .map((value) => cleanString(value))
    .filter((value): value is string => typeof value === "string");
}

function cleanPositiveNumberArray(
  values: number[] | null | undefined,
): number[] {
  if (!Array.isArray(values)) return [];

  return values.filter((value) => Number.isFinite(value) && value > 0);
}

function cleanPositiveNumber(value: number | null | undefined): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (value <= 0) return null;

  return value;
}

function cleanNonNegativeInteger(value: number | null | undefined): number {
  if (typeof value !== "number") return 0;
  if (!Number.isInteger(value)) return 0;
  if (value < 0) return 0;

  return value;
}

function normaliseEwcCodeForPayload(code: string | null | undefined): string {
  if (typeof code !== "string") return "";

  return code.replace(/\s+/g, "").trim();
}

/* =========================================================
   REFERENCES
========================================================= */

function buildOtherReferences(
  references: ReceiveMovementReference[] | null | undefined,
): ReceiveMovementReference[] | undefined {
  if (!Array.isArray(references)) return undefined;

  const cleanedReferences: ReceiveMovementReference[] = [];

  for (const reference of references) {
    const label = cleanString(reference.label);
    const referenceValue = cleanString(reference.reference);

    if (!label || !referenceValue) continue;

    cleanedReferences.push({
      label,
      reference: referenceValue,
    });
  }

  return cleanedReferences.length > 0 ? cleanedReferences : undefined;
}

/* =========================================================
   POPS
========================================================= */

function buildPopsComponents(
  components: ReceiveMovementPopComponent[] | null | undefined,
): ReceiveMovementPopComponent[] | undefined {
  if (!Array.isArray(components)) return undefined;

  const cleanedComponents: ReceiveMovementPopComponent[] = [];

  for (const component of components) {
    const code = cleanString(component.code);

    if (!code) continue;

    const cleanedComponent: ReceiveMovementPopComponent = {
      code,
    };

    const concentration = cleanPositiveNumber(component.concentration);

    if (concentration !== null) {
      cleanedComponent.concentration = concentration;
    }

    cleanedComponents.push(cleanedComponent);
  }

  return cleanedComponents.length > 0 ? cleanedComponents : undefined;
}

function buildPops(
  item: ReceiveMovementInputWasteItem,
): ReceiveMovementPops | undefined {
  if (!item.containsPops) return undefined;
  if (!item.popsSourceOfComponents) return undefined;

  const pops: ReceiveMovementPops = {
    sourceOfComponents: item.popsSourceOfComponents,
  };

  const components = buildPopsComponents(item.popsComponents);

  if (components) {
    pops.components = components;
  }

  return pops;
}

/* =========================================================
   HAZARDOUS
========================================================= */

function buildHazardousComponents(
  components: ReceiveMovementHazardousComponent[] | null | undefined,
): ReceiveMovementHazardousComponent[] | undefined {
  if (!Array.isArray(components)) return undefined;

  const cleanedComponents: ReceiveMovementHazardousComponent[] = [];

  for (const component of components) {
    const name = cleanString(component.name);

    if (!name) continue;

    const cleanedComponent: ReceiveMovementHazardousComponent = {
      name,
    };

    const concentration = cleanPositiveNumber(component.concentration);

    if (concentration !== null) {
      cleanedComponent.concentration = concentration;
    }

    cleanedComponents.push(cleanedComponent);
  }

  return cleanedComponents.length > 0 ? cleanedComponents : undefined;
}

function buildHazardous(
  item: ReceiveMovementInputWasteItem,
): ReceiveMovementHazardous | undefined {
  if (!item.containsHazardous) return undefined;
  if (!item.hazardousSourceOfComponents) return undefined;

  const hazardous: ReceiveMovementHazardous = {
    sourceOfComponents: item.hazardousSourceOfComponents,
  };

  const hazCodes = cleanStringArray(item.hazCodes);

  if (hazCodes.length > 0) {
    hazardous.hazCodes = hazCodes;
  }

  const components = buildHazardousComponents(item.hazardousComponents);

  if (components) {
    hazardous.components = components;
  }

  return hazardous;
}

/* =========================================================
   DISPOSAL / RECOVERY
========================================================= */

function buildDisposalOrRecoveryCodes(
  item: ReceiveMovementInputWasteItem,
): ReceiveMovementDisposalOrRecoveryCode[] | undefined {
  if (!Array.isArray(item.disposalOrRecoveryCodes)) return undefined;

  const cleanedCodes: ReceiveMovementDisposalOrRecoveryCode[] = [];

  for (const entry of item.disposalOrRecoveryCodes) {
    const code = cleanString(entry.code);

    if (!code) continue;
    if (!entry.weight) continue;

    const amount = cleanPositiveNumber(entry.weight.amount);

    if (amount === null) continue;

    cleanedCodes.push({
      code,
      weight: {
        metric: entry.weight.metric,
        amount,
        isEstimate: Boolean(entry.weight.isEstimate),
      },
    });
  }

  return cleanedCodes.length > 0 ? cleanedCodes : undefined;
}

/* =========================================================
   WASTE ITEMS
========================================================= */

function buildWasteItem(
  item: ReceiveMovementInputWasteItem,
): ReceiveMovementWasteItem {
  const ewcCodes = cleanStringArray(item.ewcCodes)
    .map((code) => normaliseEwcCodeForPayload(code))
    .filter((code) => code.length > 0);

  const weightAmount = cleanPositiveNumber(item.weight?.amount) ?? 0;

  const wasteItem: ReceiveMovementWasteItem = {
    ewcCodes,

    wasteDescription: cleanString(item.wasteDescription) ?? "",

    physicalForm: item.physicalForm,

    numberOfContainers: cleanNonNegativeInteger(item.numberOfContainers),

    typeOfContainers: cleanString(item.typeOfContainers) ?? "",

    weight: {
      metric: item.weight.metric,
      amount: weightAmount,
      isEstimate: Boolean(item.weight.isEstimate),
    },

    containsPops: Boolean(item.containsPops),

    containsHazardous: Boolean(item.containsHazardous),
  };

  const pops = buildPops(item);

  if (pops) {
    wasteItem.pops = pops;
  }

  const hazardous = buildHazardous(item);

  if (hazardous) {
    wasteItem.hazardous = hazardous;
  }

  const disposalOrRecoveryCodes = buildDisposalOrRecoveryCodes(item);

  if (disposalOrRecoveryCodes) {
    wasteItem.disposalOrRecoveryCodes = disposalOrRecoveryCodes;
  }

  return wasteItem;
}

function buildWasteItems(
  items: ReceiveMovementInputWasteItem[] | null | undefined,
): ReceiveMovementWasteItem[] {
  if (!Array.isArray(items)) return [];

  return items.map((item) => buildWasteItem(item));
}

/* =========================================================
   CARRIER
========================================================= */

function buildCarrier(
  carrier: ReceiveMovementInputCarrier,
): ReceiveMovementCarrier {
  const registrationNumber = cleanNullableString(carrier.registrationNumber);

  const builtCarrier: ReceiveMovementCarrier = {
    registrationNumber,

    organisationName: cleanString(carrier.organisationName) ?? "",

    address: {
      postcode: cleanString(carrier.address.postcode) ?? "",
    },

    meansOfTransport: carrier.meansOfTransport,
  };

  const fullAddress = cleanString(carrier.address.fullAddress);

  if (fullAddress) {
    builtCarrier.address.fullAddress = fullAddress;
  }

  if (!registrationNumber && carrier.reasonForNoRegistrationNumber) {
    builtCarrier.reasonForNoRegistrationNumber =
      carrier.reasonForNoRegistrationNumber;
  }

  const emailAddress = cleanString(carrier.emailAddress);

  if (emailAddress) {
    builtCarrier.emailAddress = emailAddress;
  }

  const phoneNumber = cleanString(carrier.phoneNumber);

  if (phoneNumber) {
    builtCarrier.phoneNumber = phoneNumber;
  }

  const vehicleRegistration = cleanString(carrier.vehicleRegistration);

  if (carrier.meansOfTransport === "Road" && vehicleRegistration) {
    builtCarrier.vehicleRegistration = vehicleRegistration;
  }

  return builtCarrier;
}

/* =========================================================
   BROKER OR DEALER
========================================================= */

function buildBrokerOrDealer(
  brokerOrDealer: ReceiveMovementInputBrokerOrDealer | null | undefined,
): ReceiveMovementBrokerOrDealer | undefined {
  if (!brokerOrDealer) return undefined;

  const organisationName = cleanString(brokerOrDealer.organisationName);

  if (!organisationName) return undefined;

  const builtBrokerOrDealer: ReceiveMovementBrokerOrDealer = {
    organisationName,
  };

  if (brokerOrDealer.address) {
    const postcode = cleanString(brokerOrDealer.address.postcode);
    const fullAddress = cleanString(brokerOrDealer.address.fullAddress);

    if (postcode || fullAddress) {
      builtBrokerOrDealer.address = {
        postcode: postcode ?? "",
      };

      if (fullAddress) {
        builtBrokerOrDealer.address.fullAddress = fullAddress;
      }
    }
  }

  const emailAddress = cleanString(brokerOrDealer.emailAddress);

  if (emailAddress) {
    builtBrokerOrDealer.emailAddress = emailAddress;
  }

  const phoneNumber = cleanString(brokerOrDealer.phoneNumber);

  if (phoneNumber) {
    builtBrokerOrDealer.phoneNumber = phoneNumber;
  }

  const registrationNumber = cleanString(brokerOrDealer.registrationNumber);

  if (registrationNumber) {
    builtBrokerOrDealer.registrationNumber = registrationNumber;
  }

  return builtBrokerOrDealer;
}

/* =========================================================
   RECEIVER
========================================================= */

function buildReceiver(
  receiver: ReceiveMovementInput["receiver"],
): ReceiveMovementReceiver {
  const builtReceiver: ReceiveMovementReceiver = {
    siteName: cleanString(receiver.siteName) ?? "",

    authorisationNumber: cleanString(receiver.authorisationNumber) ?? "",
  };

  const emailAddress = cleanString(receiver.emailAddress);

  if (emailAddress) {
    builtReceiver.emailAddress = emailAddress;
  }

  const phoneNumber = cleanString(receiver.phoneNumber);

  if (phoneNumber) {
    builtReceiver.phoneNumber = phoneNumber;
  }

  const regulatoryPositionStatements = cleanPositiveNumberArray(
    receiver.regulatoryPositionStatements,
  );

  if (regulatoryPositionStatements.length > 0) {
    builtReceiver.regulatoryPositionStatements =
      regulatoryPositionStatements;
  }

  return builtReceiver;
}

/* =========================================================
   RECEIPT
========================================================= */

function buildReceipt(
  receipt: ReceiveMovementInput["receipt"],
): ReceiveMovementReceipt {
  return {
    address: {
      fullAddress: cleanString(receipt.address.fullAddress) ?? "",
      postcode: cleanString(receipt.address.postcode) ?? "",
    },
  };
}

/* =========================================================
   MAIN BUILDER
========================================================= */

export function buildReceiveMovementPayload(
  input: ReceiveMovementInput,
): ReceiveMovementPayload {
  const payload: ReceiveMovementPayload = {
    apiCode: cleanString(input.receiverApiCode) ?? "",

    dateTimeReceived: cleanString(input.dateTimeReceived) ?? "",

    wasteItems: buildWasteItems(input.wasteItems),

    carrier: buildCarrier(input.carrier),

    receiver: buildReceiver(input.receiver),

    receipt: buildReceipt(input.receipt),
  };

  const hazardousWasteConsignmentCode = cleanString(
    input.hazardousWasteConsignmentCode,
  );

  if (hazardousWasteConsignmentCode) {
    payload.hazardousWasteConsignmentCode = hazardousWasteConsignmentCode;
  }

  /*
    Defra rule:
    If hazardousWasteConsignmentCode is provided,
    reasonForNoConsignmentCode should not be provided.
  */
  if (!hazardousWasteConsignmentCode && input.reasonForNoConsignmentCode) {
    payload.reasonForNoConsignmentCode = input.reasonForNoConsignmentCode;
  }

  const yourUniqueReference = cleanString(input.yourUniqueReference);

  if (yourUniqueReference) {
    payload.yourUniqueReference = yourUniqueReference;
  }

  const otherReferencesForMovement = buildOtherReferences(
    input.otherReferencesForMovement,
  );

  if (otherReferencesForMovement) {
    payload.otherReferencesForMovement = otherReferencesForMovement;
  }

  const specialHandlingRequirements = cleanString(
    input.specialHandlingRequirements,
  );

  if (specialHandlingRequirements) {
    payload.specialHandlingRequirements = specialHandlingRequirements;
  }

  const brokerOrDealer = buildBrokerOrDealer(input.brokerOrDealer);

  if (brokerOrDealer) {
    payload.brokerOrDealer = brokerOrDealer;
  }

  return payload;
}

/* =========================================================
   SUBMISSION ENDPOINT HELPERS
========================================================= */

export function getReceiveMovementEndpoint(
  wasteTrackingId?: string | null,
): string {
  const cleanedWasteTrackingId = cleanString(wasteTrackingId);

  if (!cleanedWasteTrackingId) {
    return "/movements/receive";
  }

  return `/movements/${encodeURIComponent(cleanedWasteTrackingId)}/receive`;
}

export function getReceiveMovementMethod(
  wasteTrackingId?: string | null,
): "POST" | "PUT" {
  return cleanString(wasteTrackingId) ? "PUT" : "POST";
}

/* =========================================================
   PAYLOAD SERIALISATION
   Used when saving payloadSnapshot to text column.
========================================================= */

export function serialiseReceiveMovementPayload(
  payload: ReceiveMovementPayload,
): string {
  return JSON.stringify(payload);
}

export function parseReceiveMovementPayload(
  payloadSnapshot: string | null | undefined,
): ReceiveMovementPayload | null {
  if (!payloadSnapshot) return null;

  try {
    const parsed: unknown = JSON.parse(payloadSnapshot);

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    return parsed as ReceiveMovementPayload;
  } catch {
    return null;
  }
}