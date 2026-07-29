// src/app/home/receiving/intake/[assignmentId]/receiveMovementPatScenarios.ts

import type {
  PatScenarioId,
  PatScenarioTemplate,
} from "./receiveMovementFormTypes";

import {
  createDefaultBrokerDealer,
  createDefaultWasteItem,
  createDisposalRecoveryCode,
  createHazardousComponent,
  createPopsComponent,
} from "./receiveMovementFormTypes";

export const PAT_SCENARIO_OPTIONS: Array<{
  id: PatScenarioId;
  label: string;
}> = [
  { id: "R01", label: "R01 - single waste item" },
  { id: "R02", label: "R02 - multiple waste items" },
  { id: "R03", label: "R03 - Road transport" },
  { id: "R04", label: "R04 - no disposal/recovery codes" },
  { id: "R05", label: "R05 - multiple disposal/recovery codes" },
  { id: "R07", label: "R07 - multiple EWC codes" },
  { id: "C01", label: "C01 - no carrier registration and no reason" },
  { id: "C02", label: "C02 - no carrier registration with reason" },
  { id: "B01", label: "B01 - broker/dealer involved" },
  { id: "P01", label: "P01 - multiple POPs components" },
  { id: "H01", label: "H01 - multiple hazardous components" },
  { id: "H02", label: "H02 - no consignment code and no reason" },
  { id: "H03", label: "H03 - no consignment code with reason" },
  { id: "X01", label: "X01 - hazardous and POPs waste" },
];

const BASE_DETAILS = {
  carrierOrganisationName: "Waste X Test Carrier",
  carrierRegistrationNumber: "CBDL999999",
  carrierReasonForNoRegistrationNumber: "" as const,
  carrierFullAddress: "14 Transfer Station Road, Ipswich, Suffolk",
  carrierPostcode: "IP1 5SW",
  carrierEmailAddress: "carrier.test@wastextracking.com",
  carrierPhoneNumber: "01473 333333",
  carrierMeansOfTransport: "Road" as const,
  carrierVehicleRegistration: "AB12 CDE",

  receiverSiteName: "Waste X Test Receiving Site",
  receiverAuthorisationNumber: "PPC/A/9999999",
  receiverEmailAddress: "receiver.test@wastextracking.com",
  receiverPhoneNumber: "01473 333333",
  receiptFullAddress:
    "14 Transfer Station Road, Ipswich, Suffolk, United Kingdom",
  receiptPostcode: "IP1 5SW",

  brokerDealerEnabled: false,
  brokerOrDealer: createDefaultBrokerDealer(),
};

function baseTemplate(params: {
  scenarioId: PatScenarioId;
  label: string;
  description: string;
  expectedResult: "success" | "error";
  expectedErrorScenarioId?: "C01" | "H02";
  hazardousWasteConsignmentCode?: string;
  reasonForNoConsignmentCode?: "NON_HAZ_WASTE_TRANSFER" | "NO_DOC_WITH_WASTE" | "HWRC_RECEIPT" | "";
  carrierRegistrationNumber?: string;
  carrierReasonForNoRegistrationNumber?: "ON_SITE" | "HOUSEHOLD" | "ONE_OFF" | "MARINE" | "";
  brokerDealerEnabled?: boolean;
  brokerOrDealer?: PatScenarioTemplate["brokerOrDealer"];
  wasteItems: PatScenarioTemplate["wasteItems"];
}): PatScenarioTemplate {
  return {
    scenarioId: params.scenarioId,
    label: params.label,
    description: params.description,
    expectedResult: params.expectedResult,
    expectedErrorScenarioId: params.expectedErrorScenarioId,

    yourUniqueReference: `WX-PAT-${params.scenarioId}`,
    specialHandlingRequirements: `Internal DEFRA PAT test submission for ${params.scenarioId}. Fake/sandbox data only.`,
    hazardousWasteConsignmentCode: params.hazardousWasteConsignmentCode ?? "",
    reasonForNoConsignmentCode: params.reasonForNoConsignmentCode ?? "",

    ...BASE_DETAILS,

    carrierRegistrationNumber:
      params.carrierRegistrationNumber ?? BASE_DETAILS.carrierRegistrationNumber,
    carrierReasonForNoRegistrationNumber:
      params.carrierReasonForNoRegistrationNumber ??
      BASE_DETAILS.carrierReasonForNoRegistrationNumber,

    brokerDealerEnabled:
      params.brokerDealerEnabled ?? BASE_DETAILS.brokerDealerEnabled,
    brokerOrDealer: params.brokerOrDealer ?? createDefaultBrokerDealer(),

    wasteItems: params.wasteItems,
  };
}

export function getPatScenarioTemplate(
  scenarioId: PatScenarioId,
): PatScenarioTemplate {
  switch (scenarioId) {
    case "R01":
      return baseTemplate({
        scenarioId,
        label: "R01 - Basic Waste receipt - single waste item",
        description:
          "Submit a successful receipt with one non-hazardous waste item.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Mixed non-hazardous construction and demolition waste for PAT R01.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.250",
            containsPops: false,
            containsHazardous: false,
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "1.250",
              }),
            ],
          }),
        ],
      });

    case "R02":
      return baseTemplate({
        scenarioId,
        label: "R02 - Basic waste receipt - multiple waste items",
        description:
          "Submit a successful receipt with more than one waste item.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "First waste item for multiple waste item PAT test. Mixed construction and demolition waste.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "0.750",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.750",
              }),
            ],
          }),
          createDefaultWasteItem("", {
            ewcCodes: "200301",
            wasteDescription:
              "Second waste item for multiple waste item PAT test. Mixed municipal-style site waste.",
            typeOfContainers: "BAG",
            numberOfContainers: "2",
            weightAmount: "0.500",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.500",
              }),
            ],
          }),
        ],
      });

    case "R03":
      return baseTemplate({
        scenarioId,
        label: "R03 - Basic Waste receipt - Road transport",
        description: "Submit a successful receipt with transport set to Road.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription: "Basic non-hazardous road transport PAT test waste.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.100",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "1.100",
              }),
            ],
          }),
        ],
      });

    case "R04":
      return baseTemplate({
        scenarioId,
        label: "R04 - Basic waste Receipt - no Disposal or Recovery codes",
        description:
          "Submit a successful receipt without disposal or recovery codes.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Non-hazardous construction waste submitted without disposal or recovery codes.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.050",
            disposalOrRecoveryCodes: [],
          }),
        ],
      });

    case "R05":
      return baseTemplate({
        scenarioId,
        label: "R05 - Basic waste Receipt - multiple Disposal or Recovery codes",
        description:
          "Submit a successful receipt with multiple disposal/recovery codes.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Non-hazardous waste with multiple recovery codes for PAT R05.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.800",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.900",
              }),
              createDisposalRecoveryCode({
                code: "R13",
                weightAmount: "0.900",
              }),
            ],
          }),
        ],
      });

    case "R07":
      return baseTemplate({
        scenarioId,
        label: "R07 - Basic waste Receipt - multiple EWC codes",
        description: "Submit a successful receipt with at least two EWC codes.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904, 170802",
            wasteDescription:
              "Mixed non-hazardous waste with multiple EWC codes for PAT R07.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.600",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "1.600",
              }),
            ],
          }),
        ],
      });

    case "C01":
      return baseTemplate({
        scenarioId,
        label: "C01 - no Carrier registration number and no reason",
        description:
          "Expected-error test. Submit without carrier registration number and without reason.",
        expectedResult: "error",
        expectedErrorScenarioId: "C01",
        carrierRegistrationNumber: "",
        carrierReasonForNoRegistrationNumber: "",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Non-hazardous waste used to test missing carrier registration without reason.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "0.900",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.900",
              }),
            ],
          }),
        ],
      });

    case "C02":
      return baseTemplate({
        scenarioId,
        label: "C02 - no Carrier registration number with reason",
        description:
          "Submit without carrier registration number but with a valid reason.",
        expectedResult: "success",
        carrierRegistrationNumber: "",
        carrierReasonForNoRegistrationNumber: "ONE_OFF",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Non-hazardous waste used to test missing carrier registration with reason.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "0.950",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.950",
              }),
            ],
          }),
        ],
      });

    case "B01":
      return baseTemplate({
        scenarioId,
        label: "B01 - Basic waste Receipt - Broker / Dealer involved",
        description: "Submit a successful receipt with broker/dealer details.",
        expectedResult: "success",
        brokerDealerEnabled: true,
        brokerOrDealer: createDefaultBrokerDealer({
          organisationName: "East Anglia Waste Brokerage Test Ltd",
          registrationNumber: "CBDU123456",
          emailAddress: "broker.test@wastextracking.com",
          phoneNumber: "01473 333333",
          fullAddress: "1 Broker Test Road, Ipswich, Suffolk",
          postcode: "IP1 5SW",
        }),
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170904",
            wasteDescription:
              "Non-hazardous waste movement involving a broker or dealer.",
            typeOfContainers: "SKI",
            numberOfContainers: "1",
            weightAmount: "1.400",
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "1.400",
              }),
            ],
          }),
        ],
      });

    case "P01":
      return baseTemplate({
        scenarioId,
        label: "P01 - POPs Waste Receipt - multiple POPs components",
        description: "Submit a successful receipt with multiple POP components.",
        expectedResult: "success",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170603",
            wasteDescription:
              "Controlled test waste containing multiple POPs components.",
            typeOfContainers: "BAG",
            numberOfContainers: "2",
            weightAmount: "0.350",
            containsPops: true,
            popsSourceOfComponents: "OWN_TESTING",
            popsComponents: [
              createPopsComponent({
                code: "PFHXS",
                concentration: "12.500",
              }),
              createPopsComponent({
                code: "HBCDD",
                concentration: "4.200",
              }),
            ],
            containsHazardous: false,
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.350",
              }),
            ],
          }),
        ],
      });

    case "H01":
      return baseTemplate({
        scenarioId,
        label: "H01 - Hazardous Waste Receipt - multiple hazardous components",
        description:
          "Submit a successful hazardous receipt with multiple hazardous components.",
        expectedResult: "success",
        hazardousWasteConsignmentCode: "H01206/HW001",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170603",
            wasteDescription:
              "Hazardous insulation material with multiple hazardous components.",
            typeOfContainers: "BAG",
            numberOfContainers: "3",
            weightAmount: "0.450",
            containsPops: false,
            containsHazardous: true,
            hazardousSourceOfComponents: "OWN_TESTING",
            hazCodes: "HP_5, HP_14",
            hazardousComponents: [
              createHazardousComponent({
                name: "Mineral fibres",
                concentration: "18.500",
              }),
              createHazardousComponent({
                name: "Contaminated insulation residue",
                concentration: "9.200",
              }),
            ],
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.450",
              }),
            ],
          }),
        ],
      });

    case "H02":
      return baseTemplate({
        scenarioId,
        label: "H02 - Hazardous Waste Receipt - no Consignment Note Code and no reason",
        description:
          "Expected-error test. Submit hazardous waste without consignment code and without reason.",
        expectedResult: "error",
        expectedErrorScenarioId: "H02",
        hazardousWasteConsignmentCode: "",
        reasonForNoConsignmentCode: "",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170603",
            wasteDescription:
              "Hazardous waste with no consignment note code and no reason.",
            typeOfContainers: "BAG",
            numberOfContainers: "2",
            weightAmount: "0.400",
            containsPops: false,
            containsHazardous: true,
            hazardousSourceOfComponents: "OWN_TESTING",
            hazCodes: "HP_5, HP_14",
            hazardousComponents: [
              createHazardousComponent({
                name: "Mineral fibres",
                concentration: "14.000",
              }),
            ],
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.400",
              }),
            ],
          }),
        ],
      });

    case "H03":
      return baseTemplate({
        scenarioId,
        label: "H03 - Hazardous Waste Receipt - no Consignment Note Code with reason",
        description:
          "Submit hazardous waste without consignment code but with a valid reason.",
        expectedResult: "success",
        hazardousWasteConsignmentCode: "",
        reasonForNoConsignmentCode: "NO_DOC_WITH_WASTE",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170603",
            wasteDescription:
              "Hazardous waste with no consignment note code but with reason.",
            typeOfContainers: "BAG",
            numberOfContainers: "2",
            weightAmount: "0.420",
            containsPops: false,
            containsHazardous: true,
            hazardousSourceOfComponents: "OWN_TESTING",
            hazCodes: "HP_5, HP_14",
            hazardousComponents: [
              createHazardousComponent({
                name: "Mineral fibres",
                concentration: "14.000",
              }),
            ],
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.420",
              }),
            ],
          }),
        ],
      });

    case "X01":
      return baseTemplate({
        scenarioId,
        label: "X01 - Hazardous & POPs Waste Receipt",
        description:
          "Submit a successful receipt containing both hazardous and POPs components.",
        expectedResult: "success",
        hazardousWasteConsignmentCode: "X01206/HW001",
        wasteItems: [
          createDefaultWasteItem("", {
            ewcCodes: "170603",
            wasteDescription:
              "Controlled test waste containing both hazardous properties and POPs components.",
            typeOfContainers: "BAG",
            numberOfContainers: "2",
            weightAmount: "0.380",
            containsPops: true,
            popsSourceOfComponents: "OWN_TESTING",
            popsComponents: [
              createPopsComponent({
                code: "PFHXS",
                concentration: "10.000",
              }),
              createPopsComponent({
                code: "HBCDD",
                concentration: "3.500",
              }),
            ],
            containsHazardous: true,
            hazardousSourceOfComponents: "OWN_TESTING",
            hazCodes: "HP_5, HP_14",
            hazardousComponents: [
              createHazardousComponent({
                name: "Mineral fibres",
                concentration: "11.000",
              }),
              createHazardousComponent({
                name: "Contaminated residue",
                concentration: "5.000",
              }),
            ],
            disposalOrRecoveryCodes: [
              createDisposalRecoveryCode({
                code: "R5",
                weightAmount: "0.380",
              }),
            ],
          }),
        ],
      });
  }
}