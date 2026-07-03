// src/modules/digital-waste-tracking/core/mapAssignmentToReceiveMovement.ts

import type { ReceiveMovementInput } from "../types/receiveMovement.types";

/* =========================================================
   PURPOSE
========================================================= */

/*
  This mapper turns a Waste X assignment/listing/organisation shape into
  a safe initial ReceiveMovementInput.

  Important:
  - It does NOT submit anything to Defra.
  - It only prepares sensible defaults for the receive movement form/action.
  - The user can still review/edit the final form values before submission.
  - The proper validator still runs before the API call.
*/

/* =========================================================
   LOCAL TYPES
========================================================= */

export type OrganisationForReceiveMovementMapping = {
  id?: string | null;
  teamName?: string | null;
  emailAddress?: string | null;
  telephone?: string | null;

  streetAddress?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  postCode?: string | null;

  /*
    Optional fields for future use.
    These may not exist on your organisation schema yet, but the mapper
    supports them safely if you add them later.
  */
  carrierRegistrationNumber?: string | null;
  wasteCarrierRegistrationNumber?: string | null;
  environmentalPermitNumber?: string | null;
  permitNumber?: string | null;
  authorisationNumber?: string | null;
};

export type ListingForReceiveMovementMapping = {
  id?: string | number | null;
  name?: string | null;
  location?: string | null;
  wasteType?: string | null;
  wasteDescription?: string | null;
  quantity?: number | null;
  wasteQuantity?: number | null;
};

export type AssignmentForReceiveMovementMapping = {
  id: string;
  listingId?: string | number | null;

  status?: string | null;
  collectedAt?: Date | string | null;
  completedAt?: Date | string | null;

  listing?: ListingForReceiveMovementMapping | null;

  organisation?: OrganisationForReceiveMovementMapping | null;
  assignedByOrganisation?: OrganisationForReceiveMovementMapping | null;
  carrierOrganisation?: OrganisationForReceiveMovementMapping | null;
  managerOrganisation?: OrganisationForReceiveMovementMapping | null;
};

export type MapAssignmentToReceiveMovementInput = {
  assignment: AssignmentForReceiveMovementMapping;

  /*
    Usually this is the current user's organisation, because the current
    manager/receiver organisation is the one submitting the receive movement.
  */
  receiverOrganisation?: OrganisationForReceiveMovementMapping | null;

  receiverApiCode?: string | null;

  /*
    Optional overrides from the UI/settings/test screen.
  */
  dateTimeReceived?: Date | string | null;
  receiverAuthorisationNumber?: string | null;
  carrierRegistrationNumber?: string | null;
  vehicleRegistration?: string | null;

  ewcCode?: string | null;
  wasteDescription?: string | null;
  physicalForm?: ReceiveMovementInput["wasteItems"][number]["physicalForm"];
  containerType?: string | null;
  numberOfContainers?: number | null;
  weightAmount?: number | null;
  disposalOrRecoveryCode?: string | null;
};

/* =========================================================
   SMALL HELPERS
========================================================= */

function cleanString(value: unknown): string {
  if (typeof value !== "string") return "";

  return value.trim();
}

function cleanOptionalString(value: unknown): string | undefined {
  const cleaned = cleanString(value);

  return cleaned.length > 0 ? cleaned : undefined;
}

function cleanNullableString(value: unknown): string | null {
  return cleanOptionalString(value) ?? null;
}

function cleanPositiveNumber(value: unknown, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return fallback;
  if (value <= 0) return fallback;

  return value;
}

function cleanNonNegativeInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isInteger(value)) return fallback;
  if (value < 0) return fallback;

  return value;
}

function toIsoDateTime(value: Date | string | null | undefined): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const parsed = new Date(value);

    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return new Date().toISOString();
}

function buildAddress(
  organisation: OrganisationForReceiveMovementMapping | null | undefined,
): string {
  if (!organisation) return "";

  return [
    organisation.streetAddress,
    organisation.city,
    organisation.region,
    organisation.country,
  ]
    .map((value) => cleanString(value))
    .filter(Boolean)
    .join(", ");
}

function getOrganisationPostcode(
  organisation: OrganisationForReceiveMovementMapping | null | undefined,
): string {
  return cleanString(organisation?.postCode);
}

function getOrganisationEmail(
  organisation: OrganisationForReceiveMovementMapping | null | undefined,
): string | undefined {
  return cleanOptionalString(organisation?.emailAddress);
}

function getOrganisationPhone(
  organisation: OrganisationForReceiveMovementMapping | null | undefined,
): string | undefined {
  return cleanOptionalString(organisation?.telephone);
}

function getCarrierRegistrationNumber(
  params: MapAssignmentToReceiveMovementInput,
): string | null {
  const override = cleanOptionalString(params.carrierRegistrationNumber);

  if (override) return override;

  const carrier = params.assignment.carrierOrganisation;

  return (
    cleanNullableString(carrier?.carrierRegistrationNumber) ??
    cleanNullableString(carrier?.wasteCarrierRegistrationNumber)
  );
}

function getReceiverAuthorisationNumber(
  params: MapAssignmentToReceiveMovementInput,
  receiverOrganisation: OrganisationForReceiveMovementMapping | null | undefined,
): string {
  const override = cleanOptionalString(params.receiverAuthorisationNumber);

  if (override) return override;

  const fromReceiver =
    cleanOptionalString(receiverOrganisation?.authorisationNumber) ??
    cleanOptionalString(receiverOrganisation?.environmentalPermitNumber) ??
    cleanOptionalString(receiverOrganisation?.permitNumber);

  if (fromReceiver) return fromReceiver;

  const fromManager =
    cleanOptionalString(
      params.assignment.managerOrganisation?.authorisationNumber,
    ) ??
    cleanOptionalString(
      params.assignment.managerOrganisation?.environmentalPermitNumber,
    ) ??
    cleanOptionalString(params.assignment.managerOrganisation?.permitNumber);

  if (fromManager) return fromManager;

  /*
    Test fallback only.

    For real production organisations, this should come from the receiver
    organisation/site settings.
  */
  return "EPR/DD2522BF";
}

function getListingName(assignment: AssignmentForReceiveMovementMapping): string {
  return cleanString(assignment.listing?.name) || "Waste X received movement";
}

function getListingDescription(
  params: MapAssignmentToReceiveMovementInput,
): string {
  const override = cleanOptionalString(params.wasteDescription);

  if (override) return override;

  const listing = params.assignment.listing;

  const description =
    cleanOptionalString(listing?.wasteDescription) ??
    cleanOptionalString(listing?.wasteType) ??
    cleanOptionalString(listing?.name);

  if (description) {
    return `${description} received through Waste X.`;
  }

  return "Mixed non-hazardous construction and demolition waste received through Waste X.";
}

function getWeightAmount(params: MapAssignmentToReceiveMovementInput): number {
  const override = cleanPositiveNumber(params.weightAmount, 0);

  if (override > 0) return override;

  const listing = params.assignment.listing;

  const listingQuantity =
    cleanPositiveNumber(listing?.wasteQuantity, 0) ||
    cleanPositiveNumber(listing?.quantity, 0);

  if (listingQuantity > 0) return listingQuantity;

  return 1;
}

function buildUniqueReference(
  assignment: AssignmentForReceiveMovementMapping,
): string {
  const listingId = assignment.listingId ?? assignment.listing?.id ?? "unknown";

  return `WX-${String(listingId)}-${assignment.id.slice(0, 8)}`;
}

/* =========================================================
   MAIN MAPPER
========================================================= */

export function mapAssignmentToReceiveMovement(
  params: MapAssignmentToReceiveMovementInput,
): ReceiveMovementInput {
  const { assignment } = params;

  const receiverOrganisation =
    params.receiverOrganisation ??
    assignment.managerOrganisation ??
    assignment.organisation ??
    null;

  const carrierOrganisation = assignment.carrierOrganisation ?? null;

  const receiverApiCode = cleanString(params.receiverApiCode);

  const ewcCode = cleanString(params.ewcCode) || "170904";

  const weightAmount = getWeightAmount(params);

  const containerType = cleanString(params.containerType) || "SKI";

  const numberOfContainers = cleanNonNegativeInteger(
    params.numberOfContainers,
    1,
  );

  const disposalOrRecoveryCode =
    cleanString(params.disposalOrRecoveryCode) || "R5";

  const carrierRegistrationNumber = getCarrierRegistrationNumber(params);

  const vehicleRegistration =
    cleanString(params.vehicleRegistration) || "AB12 CDE";

  const receiverAuthorisationNumber = getReceiverAuthorisationNumber(
    params,
    receiverOrganisation,
  );

  return {
    receiverApiCode,

    dateTimeReceived: toIsoDateTime(
      params.dateTimeReceived ??
        assignment.completedAt ??
        assignment.collectedAt ??
        null,
    ),

    yourUniqueReference: buildUniqueReference(assignment),

    hazardousWasteConsignmentCode: null,

    reasonForNoConsignmentCode: null,

    specialHandlingRequirements: null,

    otherReferencesForMovement: [
      {
        label: "Waste X assignment",
        reference: assignment.id,
      },
      {
        label: "Waste X listing",
        reference: String(assignment.listingId ?? assignment.listing?.id ?? ""),
      },
    ].filter((reference) => reference.reference.trim().length > 0),

    wasteItems: [
      {
        ewcCodes: [ewcCode],

        wasteDescription: getListingDescription(params),

        physicalForm: params.physicalForm ?? "Mixed",

        numberOfContainers,

        typeOfContainers: containerType,

        weight: {
          metric: "Tonnes",
          amount: weightAmount,
          isEstimate: true,
        },

        containsPops: false,

        containsHazardous: false,

        popsSourceOfComponents: null,

        popsComponents: [],

        hazardousSourceOfComponents: null,

        hazCodes: [],

        hazardousComponents: [],

        disposalOrRecoveryCodes: [
          {
            code: disposalOrRecoveryCode,
            weight: {
              metric: "Tonnes",
              amount: weightAmount,
              isEstimate: true,
            },
          },
        ],
      },
    ],

    carrier: {
      registrationNumber: carrierRegistrationNumber,

      reasonForNoRegistrationNumber: carrierRegistrationNumber
        ? null
        : "ONE_OFF",

      organisationName:
        cleanString(carrierOrganisation?.teamName) || "Unknown carrier",

      address: {
        fullAddress: buildAddress(carrierOrganisation),
        postcode: getOrganisationPostcode(carrierOrganisation),
      },

      emailAddress: getOrganisationEmail(carrierOrganisation),

      phoneNumber: getOrganisationPhone(carrierOrganisation),

      meansOfTransport: "Road",

      vehicleRegistration,
    },

    brokerOrDealer: null,

    receiver: {
      siteName:
        cleanString(receiverOrganisation?.teamName) ||
        cleanString(assignment.managerOrganisation?.teamName) ||
        "Receiving site",

      authorisationNumber: receiverAuthorisationNumber,

      emailAddress: getOrganisationEmail(receiverOrganisation),

      phoneNumber: getOrganisationPhone(receiverOrganisation),

      regulatoryPositionStatements: [],
    },

    receipt: {
      address: {
        fullAddress: buildAddress(receiverOrganisation),
        postcode: getOrganisationPostcode(receiverOrganisation),
      },
    },
  };
}

/* =========================================================
   SMALL PUBLIC HELPERS
========================================================= */

export function mapAssignmentToReceiveMovementReference(
  assignment: AssignmentForReceiveMovementMapping,
): string {
  return buildUniqueReference(assignment);
}

export function isAssignmentReadyToMapForReceiveMovement(
  assignment: AssignmentForReceiveMovementMapping,
): boolean {
  return (
    assignment.status === "completed" ||
    Boolean(assignment.completedAt)
  );
}