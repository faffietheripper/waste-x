// src/modules/digital-waste-tracking/pat/pat-scenarios.ts

export type PatScenarioDefinition = {
  scenarioId: string;
  scenarioOrder: number;
  scenarioDescription: string;
  feature: string;
  expectedResult: "success" | "error";
  defaultEwcCodes?: string;
  defaultReason?: string;
};

export const DEFRA_PAT_SCENARIOS: PatScenarioDefinition[] = [
  {
    scenarioId: "R01",
    scenarioOrder: 1,
    scenarioDescription: "Basic Waste receipt - single waste item",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultEwcCodes: "020101",
    defaultReason:
      "Single waste item submitted successfully through Waste X.",
  },
  {
    scenarioId: "R02",
    scenarioOrder: 2,
    scenarioDescription: "Basic waste receipt - with multiple waste items",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultReason:
      "Multiple waste items submitted successfully through Waste X.",
  },
  {
    scenarioId: "R03",
    scenarioOrder: 3,
    scenarioDescription: "Basic Waste receipt - with means of transport Road",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultEwcCodes: "020101",
    defaultReason:
      "Receipt submitted successfully with means of transport set to Road.",
  },
  {
    scenarioId: "R04",
    scenarioOrder: 4,
    scenarioDescription:
      "Basic waste Receipt - with no Disposal or Recovery codes",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultReason:
      "Receipt submitted without disposal or recovery codes and warning recorded where returned.",
  },
  {
    scenarioId: "R05",
    scenarioOrder: 5,
    scenarioDescription:
      "Basic waste Receipt - with multiple Disposal or Recovery codes",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultReason:
      "Single waste item submitted with multiple disposal or recovery codes.",
  },
  {
    scenarioId: "R07",
    scenarioOrder: 6,
    scenarioDescription: "Basic waste Receipt - with multiple EWC codes",
    feature: "Basic Receipt of Waste",
    expectedResult: "success",
    defaultEwcCodes: "020101, 170904",
    defaultReason:
      "Receipt submitted with at least two EWC codes against the waste item.",
  },
  {
    scenarioId: "C01",
    scenarioOrder: 7,
    scenarioDescription:
      "Basic waste Receipt - with no Carrier registration number and no reason",
    feature: "Carrier Details",
    expectedResult: "error",
    defaultReason:
      "Expected error scenario. Carrier registration number omitted and no reason supplied.",
  },
  {
    scenarioId: "C02",
    scenarioOrder: 8,
    scenarioDescription:
      "Basic waste Receipt - with no Carrier registration number and reason",
    feature: "Carrier Details",
    expectedResult: "success",
    defaultReason:
      "Carrier registration number omitted and a valid reason supplied.",
  },
  {
    scenarioId: "B01",
    scenarioOrder: 9,
    scenarioDescription: "Basic waste Receipt - with a Broker / Dealer",
    feature: "Broker / Dealer",
    expectedResult: "success",
    defaultReason:
      "Receipt submitted with broker or dealer details included in the movement.",
  },
  {
    scenarioId: "P01",
    scenarioOrder: 10,
    scenarioDescription: "POPs Waste Receipt - multiple POPs components",
    feature: "POPs Waste",
    expectedResult: "success",
    defaultReason:
      "Receipt submitted with multiple POPs components recorded.",
  },
  {
    scenarioId: "H01",
    scenarioOrder: 11,
    scenarioDescription:
      "Hazardous Waste Receipt - multiple hazardous components",
    feature: "Hazardous Waste",
    expectedResult: "success",
    defaultReason:
      "Receipt submitted with multiple hazardous components recorded.",
  },
  {
    scenarioId: "H02",
    scenarioOrder: 12,
    scenarioDescription:
      "Hazardous Waste Receipt - with no Consignment Note Code and no reason",
    feature: "Hazardous Waste",
    expectedResult: "error",
    defaultReason:
      "Expected error scenario. Hazardous waste consignment code omitted and no reason supplied.",
  },
  {
    scenarioId: "H03",
    scenarioOrder: 13,
    scenarioDescription:
      "Hazardous Waste Receipt - with no Consignment Note Code and a reason",
    feature: "Hazardous Waste",
    expectedResult: "success",
    defaultReason:
      "Hazardous waste consignment code omitted and a valid reason supplied.",
  },
  {
    scenarioId: "X01",
    scenarioOrder: 14,
    scenarioDescription: "Hazardous & POPs Waste Receipt",
    feature: "Combined Hazardous and POPs",
    expectedResult: "success",
    defaultReason:
      "Receipt submitted with both hazardous components and POPs components.",
  },
];

export function getPatScenarioById(scenarioId: string) {
  return DEFRA_PAT_SCENARIOS.find(
    (scenario) => scenario.scenarioId === scenarioId,
  );
}