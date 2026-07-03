// src/modules/digital-waste-tracking/core/validateReceiveMovementInput.ts

import type {
  DefraValidationResult,
  ReceiveMovementInput,
  ReceiveMovementInputWasteItem,
  ReceiveMovementLocalValidationResult,
} from "../types/receiveMovement.types";

import {
  isMeansOfTransport,
  isPhysicalForm,
  isReasonForNoConsignmentCode,
  isReasonForNoRegistrationNumber,
  isSourceOfComponents,
  isWeightMetric,
} from "../types/receiveMovement.types";

import type {
  NormalisedWasteTrackingReferenceDataItem,
  WasteTrackingReferenceDataType,
} from "../types/referenceData.types";


/* =========================================================
   VALIDATION OPTIONS
========================================================= */

export type ValidateReceiveMovementInputOptions = {
  /*
    Optional reference data from bb_waste_tracking_reference_data.

    If supplied, validation can check:
    - EWC codes exist
    - EWC hazardous status
    - container type codes exist
    - hazardous property codes exist
    - disposal/recovery codes exist
    - POP codes exist

    If not supplied, validation still checks required fields,
    formats and business rules.
  */
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
};

/* =========================================================
   INTERNAL ISSUE HELPERS
========================================================= */

function error(
  key: string,
  errorType: DefraValidationResult["errorType"],
  message: string,
): DefraValidationResult {
  return {
    key,
    errorType,
    message,
  };
}

function warning(
  key: string,
  errorType: DefraValidationResult["errorType"],
  message: string,
): DefraValidationResult {
  return {
    key,
    errorType,
    message,
  };
}

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

function isBlank(value: unknown): boolean {
  return cleanString(value).length === 0;
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isValidEmail(value: string): boolean {
  if (isBlank(value)) return true;

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isUuidLike(value: string): boolean {
  /*
    DEFRA describes apiCode as string($uuid).
    This is intentionally UUID-shaped rather than version-specific.
  */
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function isValidIsoDateTime(value: string): boolean {
  if (isBlank(value)) return false;

  const parsed = new Date(value);

  return !Number.isNaN(parsed.getTime());
}

function isValidUkPostcode(value: string): boolean {
  if (isBlank(value)) return false;

  const normalised = value.trim().toUpperCase();

  return (
    /^GIR\s?0AA$/.test(normalised) ||
    /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/.test(normalised)
  );
}

function isValidHazardousConsignmentCode(value: string): boolean {
  const cleaned = value.trim().toUpperCase();

  /*
    England & Wales:
    XXXXXX/YYYYY
    X = alphanumeric
  */
  const englandWales = /^[A-Z0-9]{6}\/[A-Z0-9]{5}$/.test(cleaned);

  /*
    Scotland:
    SA, SB or SC followed by 7 digits
  */
  const scotland = /^(SA|SB|SC)\d{7}$/.test(cleaned);

  /*
    Northern Ireland / Eire:
    DA, DB or DC followed by 7 digits
  */
  const northernIrelandOrEire = /^(DA|DB|DC)\d{7}$/.test(cleaned);

  return englandWales || scotland || northernIrelandOrEire;
}

function isProbablyValidAuthorisationNumber(value: string): boolean {
  /*
    DEFRA supports many UK nation-specific permit formats.
    This local check is deliberately permissive so Waste X does not
    block valid real-world permit numbers too aggressively.

    DEFRA remains the final validation authority.
  */
  const cleaned = value.trim();

  if (cleaned.length < 4) return false;
  if (cleaned.length > 80) return false;

  return /^[A-Z0-9/\-\s.]+$/i.test(cleaned);
}


function normaliseEwcCodeInput(code: unknown): string {
  if (typeof code !== "string") return "";

  return code.replace(/\s+/g, "").trim();
}

function isValidEwcCodeFormat(code: unknown): boolean {
  return /^\d{6}$/.test(normaliseEwcCodeInput(code));
}

function isValidPositiveNumber(value: unknown): boolean {
  if (typeof value !== "number") return false;

  return Number.isFinite(value) && value > 0;
}

function isValidNonNegativeInteger(value: unknown): boolean {
  if (typeof value !== "number") return false;

  return Number.isInteger(value) && value >= 0;
}

/* =========================================================
   REFERENCE DATA LOOKUPS
========================================================= */

function getReferenceItems(
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
  type: WasteTrackingReferenceDataType,
): NormalisedWasteTrackingReferenceDataItem[] {
  if (!Array.isArray(referenceData)) return [];

  return referenceData.filter(
    (item) => item.type === type && item.isActive !== false,
  );
}

function hasReferenceData(
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
  type: WasteTrackingReferenceDataType,
): boolean {
  return getReferenceItems(referenceData, type).length > 0;
}

function referenceCodeExists(
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
  type: WasteTrackingReferenceDataType,
  code: string,
): boolean {
  const items = getReferenceItems(referenceData, type);

  if (items.length === 0) return true;

  const normalisedCode = code.trim();

  return items.some((item) => item.code === normalisedCode);
}

function findEwcReference(
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
  code: string,
): NormalisedWasteTrackingReferenceDataItem | null {
  const items = getReferenceItems(referenceData, "ewc_codes");

  if (items.length === 0) return null;

  const normalisedCode = normaliseEwcCodeInput(code);

  return items.find((item) => item.code === normalisedCode) ?? null;
}

function isWasteItemHazardousByReferenceData(
  item: ReceiveMovementInputWasteItem,
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
): boolean {
  for (const code of item.ewcCodes ?? []) {
    const ewcReference = findEwcReference(referenceData, code);

    if (ewcReference?.isHazardous === true) {
      return true;
    }
  }

  return false;
}

function movementContainsHazardousWaste(
  input: ReceiveMovementInput,
  referenceData: NormalisedWasteTrackingReferenceDataItem[] | undefined,
): boolean {
  return input.wasteItems.some((item) => {
    return (
      item.containsHazardous === true ||
      isWasteItemHazardousByReferenceData(item, referenceData)
    );
  });
}

/* =========================================================
   FIELD VALIDATORS
========================================================= */

function validateMovementLevelFields(params: {
  input: ReceiveMovementInput;
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
  errors: DefraValidationResult[];
  warnings: DefraValidationResult[];
}) {
  const { input, referenceData, errors, warnings } = params;

  if (isBlank(input.receiverApiCode)) {
    errors.push(
      error("apiCode", "NotProvided", "Receiver API code is required."),
    );
  } else if (!isUuidLike(input.receiverApiCode)) {
    errors.push(
      error(
        "apiCode",
        "InvalidFormat",
        "Receiver API code must be a valid UUID.",
      ),
    );
  }

  if (isBlank(input.dateTimeReceived)) {
    errors.push(
      error(
        "dateTimeReceived",
        "NotProvided",
        "Date and time received is required.",
      ),
    );
  } else if (!isValidIsoDateTime(input.dateTimeReceived)) {
    errors.push(
      error(
        "dateTimeReceived",
        "InvalidFormat",
        "Date and time received must be a valid ISO 8601 date-time.",
      ),
    );
  }

  const hasHazardousWaste = movementContainsHazardousWaste(
    input,
    referenceData,
  );

  const hasConsignmentCode = !isBlank(input.hazardousWasteConsignmentCode);
  const hasNoConsignmentReason = !isBlank(input.reasonForNoConsignmentCode);

  if (hasConsignmentCode) {
    if (
      !isValidHazardousConsignmentCode(
        cleanString(input.hazardousWasteConsignmentCode),
      )
    ) {
      errors.push(
        error(
          "hazardousWasteConsignmentCode",
          "InvalidFormat",
          "Hazardous waste consignment code must match a valid England, Wales, Scotland, Northern Ireland or Eire format.",
        ),
      );
    }
  }

  if (hasHazardousWaste && !hasConsignmentCode && !hasNoConsignmentReason) {
    errors.push(
      error(
        "reasonForNoConsignmentCode",
        "BusinessRuleViolation",
        "A hazardous waste consignment code or a reason for no consignment code is required when hazardous waste is present.",
      ),
    );
  }

  if (hasNoConsignmentReason) {
    const reason = cleanString(input.reasonForNoConsignmentCode);

    if (!isReasonForNoConsignmentCode(reason)) {
      errors.push(
        error(
          "reasonForNoConsignmentCode",
          "InvalidValue",
          "Reason for no consignment code must be NON_HAZ_WASTE_TRANSFER, NO_DOC_WITH_WASTE or HWRC_RECEIPT.",
        ),
      );
    }
  }

  if (hasConsignmentCode && hasNoConsignmentReason) {
    warnings.push(
      warning(
        "reasonForNoConsignmentCode",
        "NotAllowed",
        "Reason for no consignment code will be ignored because a hazardous waste consignment code was provided.",
      ),
    );
  }

  if (
    input.specialHandlingRequirements &&
    input.specialHandlingRequirements.length > 5000
  ) {
    errors.push(
      error(
        "specialHandlingRequirements",
        "OutOfRange",
        "Special handling requirements must be 5,000 characters or fewer.",
      ),
    );
  }

  input.otherReferencesForMovement?.forEach((reference, index) => {
    const label = cleanString(reference.label);
    const referenceValue = cleanString(reference.reference);

    if (!label && !referenceValue) return;

    if (!label) {
      errors.push(
        error(
          `otherReferencesForMovement[${index}].label`,
          "NotProvided",
          "Reference label is required when a reference value is provided.",
        ),
      );
    }

    if (!referenceValue) {
      errors.push(
        error(
          `otherReferencesForMovement[${index}].reference`,
          "NotProvided",
          "Reference value is required when a reference label is provided.",
        ),
      );
    }
  });
}

function validateWasteItem(params: {
  item: ReceiveMovementInputWasteItem;
  index: number;
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
  errors: DefraValidationResult[];
  warnings: DefraValidationResult[];
}) {
  const { item, index, referenceData, errors, warnings } = params;

  const key = `wasteItems[${index}]`;

  const ewcCodes = Array.isArray(item.ewcCodes) ? item.ewcCodes : [];

  if (ewcCodes.length === 0) {
    errors.push(
      error(`${key}.ewcCodes`, "NotProvided", "At least one EWC code is required."),
    );
  }

  if (ewcCodes.length > 5) {
    errors.push(
      error(
        `${key}.ewcCodes`,
        "OutOfRange",
        "A waste item can have a maximum of five EWC codes.",
      ),
    );
  }

 const normalisedEwcCodes = ewcCodes.map((code) =>
  normaliseEwcCodeInput(code),
);

  normalisedEwcCodes.forEach((code, codeIndex) => {
    if (!isValidEwcCodeFormat(code)) {
      errors.push(
        error(
          `${key}.ewcCodes[${codeIndex}]`,
          "InvalidFormat",
          "EWC code must be six digits with no spaces.",
        ),
      );

      return;
    }

    if (
      hasReferenceData(referenceData, "ewc_codes") &&
      !referenceCodeExists(referenceData, "ewc_codes", code)
    ) {
      errors.push(
        error(
          `${key}.ewcCodes[${codeIndex}]`,
          "InvalidValue",
          "EWC code was not found in the synced Waste Tracking reference data.",
        ),
      );
    }
  });

  if (isBlank(item.wasteDescription)) {
    errors.push(
      error(
        `${key}.wasteDescription`,
        "NotProvided",
        "Waste description is required.",
      ),
    );
  }

  if (!isPhysicalForm(String(item.physicalForm))) {
    errors.push(
      error(
        `${key}.physicalForm`,
        "InvalidValue",
        "Physical form must be Gas, Liquid, Solid, Powder, Sludge or Mixed.",
      ),
    );
  }

  if (!isValidNonNegativeInteger(item.numberOfContainers)) {
    errors.push(
      error(
        `${key}.numberOfContainers`,
        "InvalidValue",
        "Number of containers must be a non-negative integer.",
      ),
    );
  }

  if (isBlank(item.typeOfContainers)) {
    errors.push(
      error(
        `${key}.typeOfContainers`,
        "NotProvided",
        "Container type is required.",
      ),
    );
  } else if (
    hasReferenceData(referenceData, "container_types") &&
    !referenceCodeExists(
      referenceData,
      "container_types",
      cleanString(item.typeOfContainers),
    )
  ) {
    errors.push(
      error(
        `${key}.typeOfContainers`,
        "InvalidValue",
        "Container type was not found in the synced Waste Tracking reference data.",
      ),
    );
  }

  if (!item.weight) {
    errors.push(error(`${key}.weight`, "NotProvided", "Weight is required."));
  } else {
    if (!isWeightMetric(String(item.weight.metric))) {
      errors.push(
        error(
          `${key}.weight.metric`,
          "InvalidValue",
          "Weight metric must be Grams, Kilograms or Tonnes.",
        ),
      );
    }

    if (!isValidPositiveNumber(item.weight.amount)) {
      errors.push(
        error(
          `${key}.weight.amount`,
          "InvalidValue",
          "Weight amount must be a positive number greater than 0.",
        ),
      );
    }

    if (!isBoolean(item.weight.isEstimate)) {
      errors.push(
        error(
          `${key}.weight.isEstimate`,
          "InvalidType",
          "Weight estimate value must be true or false.",
        ),
      );
    }
  }

  validatePops({
    item,
    key,
    referenceData,
    errors,
    warnings,
  });

  validateHazardous({
    item,
    key,
    referenceData,
    errors,
    warnings,
  });

  validateDisposalOrRecoveryCodes({
    item,
    key,
    referenceData,
    errors,
  });
}

function validatePops(params: {
  item: ReceiveMovementInputWasteItem;
  key: string;
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
  errors: DefraValidationResult[];
  warnings: DefraValidationResult[];
}) {
  const { item, key, referenceData, errors, warnings } = params;

  if (!isBoolean(item.containsPops)) {
    errors.push(
      error(
        `${key}.containsPops`,
        "InvalidType",
        "containsPops must be true or false.",
      ),
    );

    return;
  }

  if (!item.containsPops) {
    if (item.popsSourceOfComponents || item.popsComponents?.length) {
      warnings.push(
        warning(
          `${key}.pops`,
          "NotAllowed",
          "POPs details will be ignored because containsPops is false.",
        ),
      );
    }

    return;
  }

  if (!item.popsSourceOfComponents) {
    errors.push(
      error(
        `${key}.pops.sourceOfComponents`,
        "NotProvided",
        "Source of POP components is required when containsPops is true.",
      ),
    );
  } else if (!isSourceOfComponents(String(item.popsSourceOfComponents))) {
    errors.push(
      error(
        `${key}.pops.sourceOfComponents`,
        "InvalidValue",
        "Source of POP components must be NOT_PROVIDED, PROVIDED_WITH_WASTE, GUIDANCE or OWN_TESTING.",
      ),
    );
  }

  const components = item.popsComponents ?? [];

  if (item.popsSourceOfComponents === "NOT_PROVIDED" && components.length > 0) {
    errors.push(
      error(
        `${key}.pops.components`,
        "BusinessRuleViolation",
        "POP components must be empty when sourceOfComponents is NOT_PROVIDED.",
      ),
    );
  }

  if (
    (item.popsSourceOfComponents === "GUIDANCE" ||
      item.popsSourceOfComponents === "OWN_TESTING") &&
    components.length === 0
  ) {
    errors.push(
      error(
        `${key}.pops.components`,
        "NotProvided",
        "POP components are required when sourceOfComponents is GUIDANCE or OWN_TESTING.",
      ),
    );
  }

  if (
    item.popsSourceOfComponents === "PROVIDED_WITH_WASTE" &&
    components.length === 0
  ) {
    warnings.push(
      warning(
        `${key}.pops.components`,
        "NotProvided",
        "POP components are recommended when sourceOfComponents is PROVIDED_WITH_WASTE.",
      ),
    );
  }

  components.forEach((component, componentIndex) => {
    const componentKey = `${key}.pops.components[${componentIndex}]`;

    if (isBlank(component.code)) {
      errors.push(
        error(componentKey + ".code", "NotProvided", "POP code is required."),
      );
    } else if (
      hasReferenceData(referenceData, "pop_names") &&
      !referenceCodeExists(
        referenceData,
        "pop_names",
        cleanString(component.code),
      )
    ) {
      errors.push(
        error(
          componentKey + ".code",
          "InvalidValue",
          "POP code was not found in the synced Waste Tracking reference data.",
        ),
      );
    }

    if (
      component.concentration !== undefined &&
      !isValidPositiveNumber(component.concentration)
    ) {
      errors.push(
        error(
          componentKey + ".concentration",
          "InvalidValue",
          "POP concentration must be a positive number greater than 0.",
        ),
      );
    }
  });
}

function validateHazardous(params: {
  item: ReceiveMovementInputWasteItem;
  key: string;
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
  errors: DefraValidationResult[];
  warnings: DefraValidationResult[];
}) {
  const { item, key, referenceData, errors, warnings } = params;

  if (!isBoolean(item.containsHazardous)) {
    errors.push(
      error(
        `${key}.containsHazardous`,
        "InvalidType",
        "containsHazardous must be true or false.",
      ),
    );

    return;
  }

  if (!item.containsHazardous) {
    if (
      item.hazardousSourceOfComponents ||
      item.hazCodes?.length ||
      item.hazardousComponents?.length
    ) {
      warnings.push(
        warning(
          `${key}.hazardous`,
          "NotAllowed",
          "Hazardous details will be ignored because containsHazardous is false.",
        ),
      );
    }

    return;
  }

  if (!item.hazardousSourceOfComponents) {
    errors.push(
      error(
        `${key}.hazardous.sourceOfComponents`,
        "NotProvided",
        "Source of hazardous components is required when containsHazardous is true.",
      ),
    );
  } else if (!isSourceOfComponents(String(item.hazardousSourceOfComponents))) {
    errors.push(
      error(
        `${key}.hazardous.sourceOfComponents`,
        "InvalidValue",
        "Source of hazardous components must be NOT_PROVIDED, PROVIDED_WITH_WASTE, GUIDANCE or OWN_TESTING.",
      ),
    );
  }

  const hazCodes = item.hazCodes ?? [];
  const components = item.hazardousComponents ?? [];

  if (item.hazardousSourceOfComponents === "NOT_PROVIDED") {
    if (components.length > 0) {
      errors.push(
        error(
          `${key}.hazardous.components`,
          "BusinessRuleViolation",
          "Hazardous components must be empty when sourceOfComponents is NOT_PROVIDED.",
        ),
      );
    }
  }

  if (
    (item.hazardousSourceOfComponents === "GUIDANCE" ||
      item.hazardousSourceOfComponents === "OWN_TESTING") &&
    components.length === 0
  ) {
    errors.push(
      error(
        `${key}.hazardous.components`,
        "NotProvided",
        "Hazardous components are required when sourceOfComponents is GUIDANCE or OWN_TESTING.",
      ),
    );
  }

  if (
    item.hazardousSourceOfComponents === "PROVIDED_WITH_WASTE" &&
    components.length === 0
  ) {
    warnings.push(
      warning(
        `${key}.hazardous.components`,
        "NotProvided",
        "Hazardous components are recommended when sourceOfComponents is PROVIDED_WITH_WASTE.",
      ),
    );
  }

  if (hazCodes.length === 0) {
    errors.push(
      error(
        `${key}.hazardous.hazCodes`,
        "NotProvided",
        "At least one hazardous property code is required when containsHazardous is true.",
      ),
    );
  }

  hazCodes.forEach((hazCode, hazCodeIndex) => {
    if (isBlank(hazCode)) {
      errors.push(
        error(
          `${key}.hazardous.hazCodes[${hazCodeIndex}]`,
          "NotProvided",
          "Hazardous property code is required.",
        ),
      );

      return;
    }

    if (
      hasReferenceData(referenceData, "hazardous_property_codes") &&
      !referenceCodeExists(
        referenceData,
        "hazardous_property_codes",
        cleanString(hazCode),
      )
    ) {
      errors.push(
        error(
          `${key}.hazardous.hazCodes[${hazCodeIndex}]`,
          "InvalidValue",
          "Hazardous property code was not found in the synced Waste Tracking reference data.",
        ),
      );
    }
  });

  components.forEach((component, componentIndex) => {
    const componentKey = `${key}.hazardous.components[${componentIndex}]`;

    if (isBlank(component.name)) {
      errors.push(
        error(
          componentKey + ".name",
          "NotProvided",
          "Hazardous component name is required.",
        ),
      );
    }

    if (
      component.concentration !== undefined &&
      !isValidPositiveNumber(component.concentration)
    ) {
      errors.push(
        error(
          componentKey + ".concentration",
          "InvalidValue",
          "Hazardous component concentration must be a positive number greater than 0.",
        ),
      );
    }
  });
}

function validateDisposalOrRecoveryCodes(params: {
  item: ReceiveMovementInputWasteItem;
  key: string;
  referenceData?: NormalisedWasteTrackingReferenceDataItem[];
  errors: DefraValidationResult[];
}) {
  const { item, key, referenceData, errors } = params;

  const disposalOrRecoveryCodes = item.disposalOrRecoveryCodes ?? [];

  disposalOrRecoveryCodes.forEach((entry, entryIndex) => {
    const entryKey = `${key}.disposalOrRecoveryCodes[${entryIndex}]`;

    if (isBlank(entry.code)) {
      errors.push(
        error(
          `${entryKey}.code`,
          "NotProvided",
          "Disposal or recovery code is required.",
        ),
      );
    } else if (
      hasReferenceData(referenceData, "disposal_or_recovery_codes") &&
      !referenceCodeExists(
        referenceData,
        "disposal_or_recovery_codes",
        cleanString(entry.code),
      )
    ) {
      errors.push(
        error(
          `${entryKey}.code`,
          "InvalidValue",
          "Disposal or recovery code was not found in the synced Waste Tracking reference data.",
        ),
      );
    }

    if (!entry.weight) {
      errors.push(
        error(`${entryKey}.weight`, "NotProvided", "Weight is required."),
      );

      return;
    }

    if (!isWeightMetric(String(entry.weight.metric))) {
      errors.push(
        error(
          `${entryKey}.weight.metric`,
          "InvalidValue",
          "Weight metric must be Grams, Kilograms or Tonnes.",
        ),
      );
    }

    if (!isValidPositiveNumber(entry.weight.amount)) {
      errors.push(
        error(
          `${entryKey}.weight.amount`,
          "InvalidValue",
          "Disposal or recovery weight amount must be a positive number greater than 0.",
        ),
      );
    }

    if (!isBoolean(entry.weight.isEstimate)) {
      errors.push(
        error(
          `${entryKey}.weight.isEstimate`,
          "InvalidType",
          "Disposal or recovery weight estimate value must be true or false.",
        ),
      );
    }
  });
}

function validateCarrier(params: {
  input: ReceiveMovementInput;
  errors: DefraValidationResult[];
  warnings: DefraValidationResult[];
}) {
  const { input, errors, warnings } = params;

  const carrier = input.carrier;

  if (!carrier) {
    errors.push(error("carrier", "NotProvided", "Carrier details are required."));
    return;
  }

  const registrationNumber = cleanString(carrier.registrationNumber);

  if (!registrationNumber) {
    if (!carrier.reasonForNoRegistrationNumber) {
      errors.push(
        error(
          "carrier.reasonForNoRegistrationNumber",
          "NotProvided",
          "Reason for no carrier registration number is required when no registration number is provided.",
        ),
      );
    } else if (
      !isReasonForNoRegistrationNumber(
        String(carrier.reasonForNoRegistrationNumber),
      )
    ) {
      errors.push(
        error(
          "carrier.reasonForNoRegistrationNumber",
          "InvalidValue",
          "Reason for no registration number must be ON_SITE, HOUSEHOLD, ONE_OFF or MARINE.",
        ),
      );
    }
  }

  if (registrationNumber && carrier.reasonForNoRegistrationNumber) {
    warnings.push(
      warning(
        "carrier.reasonForNoRegistrationNumber",
        "NotAllowed",
        "Reason for no registration number will be ignored because a carrier registration number was provided.",
      ),
    );
  }

  if (isBlank(carrier.organisationName)) {
    errors.push(
      error(
        "carrier.organisationName",
        "NotProvided",
        "Carrier organisation name is required.",
      ),
    );
  }

  if (!carrier.address) {
    errors.push(
      error("carrier.address", "NotProvided", "Carrier address is required."),
    );
  } else if (isBlank(carrier.address.postcode)) {
    errors.push(
      error(
        "carrier.address.postcode",
        "NotProvided",
        "Carrier postcode is required.",
      ),
    );
  }

  if (carrier.emailAddress && !isValidEmail(carrier.emailAddress)) {
    errors.push(
      error(
        "carrier.emailAddress",
        "InvalidFormat",
        "Carrier email address must be valid.",
      ),
    );
  }

  if (!isMeansOfTransport(String(carrier.meansOfTransport))) {
    errors.push(
      error(
        "carrier.meansOfTransport",
        "InvalidValue",
        "Carrier means of transport must be Road, Rail, Air, Sea, Inland Waterway, Piped or Other.",
      ),
    );
  }

  if (carrier.meansOfTransport === "Road") {
    if (isBlank(carrier.vehicleRegistration)) {
      errors.push(
        error(
          "carrier.vehicleRegistration",
          "NotProvided",
          "Vehicle registration is required when means of transport is Road.",
        ),
      );
    } else if (cleanString(carrier.vehicleRegistration).length > 10) {
      errors.push(
        error(
          "carrier.vehicleRegistration",
          "OutOfRange",
          "Vehicle registration must be 10 characters or fewer.",
        ),
      );
    }
  }

  if (
    carrier.meansOfTransport !== "Road" &&
    !isBlank(carrier.vehicleRegistration)
  ) {
    warnings.push(
      warning(
        "carrier.vehicleRegistration",
        "NotAllowed",
        "Vehicle registration will be ignored because means of transport is not Road.",
      ),
    );
  }
}

function validateBrokerOrDealer(params: {
  input: ReceiveMovementInput;
  errors: DefraValidationResult[];
}) {
  const { input, errors } = params;

  const brokerOrDealer = input.brokerOrDealer;

  if (!brokerOrDealer) return;

  const hasAnyBrokerData =
    !isBlank(brokerOrDealer.organisationName) ||
    !isBlank(brokerOrDealer.emailAddress) ||
    !isBlank(brokerOrDealer.phoneNumber) ||
    !isBlank(brokerOrDealer.registrationNumber) ||
    !isBlank(brokerOrDealer.address?.fullAddress) ||
    !isBlank(brokerOrDealer.address?.postcode);

  if (!hasAnyBrokerData) return;

  if (isBlank(brokerOrDealer.organisationName)) {
    errors.push(
      error(
        "brokerOrDealer.organisationName",
        "NotProvided",
        "Broker or dealer organisation name is required when broker/dealer details are provided.",
      ),
    );
  }

  if (brokerOrDealer.address && isBlank(brokerOrDealer.address.postcode)) {
    errors.push(
      error(
        "brokerOrDealer.address.postcode",
        "NotProvided",
        "Broker or dealer postcode is required when broker/dealer address is provided.",
      ),
    );
  }

  if (
    brokerOrDealer.emailAddress &&
    !isValidEmail(brokerOrDealer.emailAddress)
  ) {
    errors.push(
      error(
        "brokerOrDealer.emailAddress",
        "InvalidFormat",
        "Broker or dealer email address must be valid.",
      ),
    );
  }
}

function validateReceiver(params: {
  input: ReceiveMovementInput;
  errors: DefraValidationResult[];
}) {
  const { input, errors } = params;

  const receiver = input.receiver;

  if (!receiver) {
    errors.push(
      error("receiver", "NotProvided", "Receiver details are required."),
    );

    return;
  }

  if (isBlank(receiver.siteName)) {
    errors.push(
      error("receiver.siteName", "NotProvided", "Receiver site name is required."),
    );
  }

  if (receiver.emailAddress && !isValidEmail(receiver.emailAddress)) {
    errors.push(
      error(
        "receiver.emailAddress",
        "InvalidFormat",
        "Receiver email address must be valid.",
      ),
    );
  }

  if (isBlank(receiver.authorisationNumber)) {
    errors.push(
      error(
        "receiver.authorisationNumber",
        "NotProvided",
        "Receiver site authorisation number is required.",
      ),
    );
  } else if (
    !isProbablyValidAuthorisationNumber(receiver.authorisationNumber)
  ) {
    errors.push(
      error(
        "receiver.authorisationNumber",
        "InvalidFormat",
        "Receiver site authorisation number does not look like a valid UK permit, licence or exemption reference.",
      ),
    );
  }

  receiver.regulatoryPositionStatements?.forEach((rps, index) => {
    if (!Number.isInteger(rps) || rps <= 0) {
      errors.push(
        error(
          `receiver.regulatoryPositionStatements[${index}]`,
          "InvalidValue",
          "Regulatory position statement numbers must be positive integers.",
        ),
      );
    }
  });
}

function validateReceipt(params: {
  input: ReceiveMovementInput;
  errors: DefraValidationResult[];
}) {
  const { input, errors } = params;

  const receipt = input.receipt;

  if (!receipt) {
    errors.push(error("receipt", "NotProvided", "Receipt details are required."));
    return;
  }

  if (!receipt.address) {
    errors.push(
      error("receipt.address", "NotProvided", "Receipt address is required."),
    );

    return;
  }

  if (isBlank(receipt.address.fullAddress)) {
    errors.push(
      error(
        "receipt.address.fullAddress",
        "NotProvided",
        "Receipt full address is required.",
      ),
    );
  }

  if (isBlank(receipt.address.postcode)) {
    errors.push(
      error(
        "receipt.address.postcode",
        "NotProvided",
        "Receipt postcode is required.",
      ),
    );
  } else if (!isValidUkPostcode(receipt.address.postcode)) {
    errors.push(
      error(
        "receipt.address.postcode",
        "InvalidFormat",
        "Receipt postcode must be a valid UK postcode.",
      ),
    );
  }
}

/* =========================================================
   MAIN VALIDATOR
========================================================= */

export function validateReceiveMovementInput(
  input: ReceiveMovementInput,
  options: ValidateReceiveMovementInputOptions = {},
): ReceiveMovementLocalValidationResult {
  const errors: DefraValidationResult[] = [];
  const warnings: DefraValidationResult[] = [];

  if (!input || typeof input !== "object") {
    return {
      valid: false,
      errors: [
        error(
          "receiveMovementRequest",
          "InvalidType",
          "Receive movement input must be an object.",
        ),
      ],
      warnings: [],
    };
  }

  validateMovementLevelFields({
    input,
    referenceData: options.referenceData,
    errors,
    warnings,
  });

  if (!Array.isArray(input.wasteItems) || input.wasteItems.length === 0) {
    errors.push(
      error(
        "wasteItems",
        "NotProvided",
        "At least one waste item is required.",
      ),
    );
  } else {
    input.wasteItems.forEach((item, index) => {
      validateWasteItem({
        item,
        index,
        referenceData: options.referenceData,
        errors,
        warnings,
      });
    });
  }

  validateCarrier({
    input,
    errors,
    warnings,
  });

  validateBrokerOrDealer({
    input,
    errors,
  });

  validateReceiver({
    input,
    errors,
  });

  validateReceipt({
    input,
    errors,
  });

  if (errors.length > 0) {
    return {
      valid: false,
      errors,
      warnings,
    };
  }

  return {
    valid: true,
    warnings,
  };
}

/* =========================================================
   SMALL PUBLIC HELPERS
========================================================= */

export function hasReceiveMovementValidationErrors(
  result: ReceiveMovementLocalValidationResult,
): boolean {
  return result.valid === false && result.errors.length > 0;
}

export function getReceiveMovementValidationMessage(
  result: ReceiveMovementLocalValidationResult,
): string {
  if (result.valid) {
    if (result.warnings.length > 0) {
      return `Validation passed with ${result.warnings.length} warning${
        result.warnings.length === 1 ? "" : "s"
      }.`;
    }

    return "Validation passed.";
  }

  return `Validation failed with ${result.errors.length} error${
    result.errors.length === 1 ? "" : "s"
  }.`;
}

export function flattenValidationResults(
  results: DefraValidationResult[],
): string[] {
  return results.map((result) => {
    return `${result.key}: ${result.message}`;
  });
}