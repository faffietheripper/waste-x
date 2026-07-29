// src/app/home/receiving/intake/[assignmentId]/ReceiveMovementForm.tsx

"use client";

import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";

import { submitReceiveMovementAction } from "@/modules/digital-waste-tracking/actions/submitReceiveMovementAction";

import {
  MEANS_OF_TRANSPORT,
  REASON_FOR_NO_CONSIGNMENT_CODE,
  REASON_FOR_NO_REGISTRATION_NUMBER,
  type DefraValidationResult,
  type MeansOfTransport,
  type ReasonForNoConsignmentCode,
  type ReasonForNoRegistrationNumber,
  type ReceiveMovementInput,
} from "@/modules/digital-waste-tracking/types/receiveMovement.types";

import BrokerDealerPanel from "./BrokerDealerPanel";
import WasteItemsEditor from "./WasteItemsEditor";

import {
  createDefaultBrokerDealer,
  createDefaultWasteItem,
  type BrokerDealerFormState,
  type FormIssue,
  type PatExpectedErrorOverride,
  type PatScenarioId,
  type ReceiveMovementFormProps,
  type SubmitFeedback,
  type WasteItemFormState,
} from "./receiveMovementFormTypes";

import {
  getPatScenarioTemplate,
  PAT_SCENARIO_OPTIONS,
} from "./receiveMovementPatScenarios";

/* =========================================================
   PAT HELPERS
========================================================= */

const EXPECTED_DEFRA_ERROR_PAT_SCENARIOS = new Set<PatScenarioId>([
  "C01",
  "H02",
]);

function detectPatScenarioId(
  ...values: Array<string | null | undefined>
): PatScenarioId | null {
  const joined = values.filter(Boolean).join(" ");

  const match = joined.match(
    /\b(R01|R02|R03|R04|R05|R07|C01|C02|B01|P01|H01|H02|H03|X01)\b/i,
  );

  if (!match?.[1]) return null;

  return match[1].toUpperCase() as PatScenarioId;
}

/* =========================================================
   HELPERS
========================================================= */

function splitCodeList(value: string): string[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitNumberList(value: string): number[] {
  return value
    .split(/[,;\n]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function numberFromText(value: string): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function nowAsIsoLocalInputValue() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
}

function localDateTimeInputToIso(value: string) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toISOString();
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function issueMatchesKey(issueKey: string, fieldKey: string) {
  return (
    issueKey === fieldKey ||
    issueKey.startsWith(`${fieldKey}.`) ||
    issueKey.startsWith(`${fieldKey}[`)
  );
}

function sectionForKey(key: string) {
  if (
    key === "apiCode" ||
    key === "receiverApiCode" ||
    key === "dateTimeReceived" ||
    key === "hazardousWasteConsignmentCode" ||
    key === "reasonForNoConsignmentCode" ||
    key === "yourUniqueReference" ||
    key === "specialHandlingRequirements"
  ) {
    return "Movement details";
  }

  if (key.startsWith("wasteItems")) {
    return "Waste items";
  }

  if (key.startsWith("carrier")) {
    return "Carrier details";
  }

  if (key.startsWith("brokerOrDealer")) {
    return "Broker / dealer details";
  }

  if (key.startsWith("receiver") || key.startsWith("receipt")) {
    return "Receiver and receipt site";
  }

  if (key.startsWith("assignment")) {
    return "Assignment checks";
  }

  if (key.startsWith("defra")) {
    return "Waste Tracking Service";
  }

  return "Submission";
}

function sectionIdForIssue(section: string) {
  if (section === "Movement details") return "movement-details";
  if (section === "Waste items") return "waste-items";
  if (section === "Carrier details") return "carrier-details";
  if (section === "Broker / dealer details") return "broker-dealer-details";
  if (section === "Receiver and receipt site") return "receiver-details";

  return "submit-feedback";
}

function mapDefraIssue(issue: DefraValidationResult): FormIssue {
  return {
    key: issue.key,
    section: sectionForKey(issue.key),
    message: issue.message,
  };
}

function mapFlatIssue(issue: string): FormIssue {
  const [possibleKey, ...rest] = issue.split(":");
  const key = possibleKey?.trim() || "submission";
  const message = rest.length > 0 ? rest.join(":").trim() : issue;

  return {
    key,
    section: sectionForKey(key),
    message,
  };
}

function hasAnyBrokerDealerData(broker: BrokerDealerFormState) {
  return Boolean(
    broker.organisationName.trim() ||
      broker.fullAddress.trim() ||
      broker.postcode.trim() ||
      broker.emailAddress.trim() ||
      broker.phoneNumber.trim() ||
      broker.registrationNumber.trim(),
  );
}

/* =========================================================
   COMPONENT
========================================================= */

export default function ReceiveMovementForm({
  assignmentId,
  listingId,
  listingName,
  listingLocation,
  canSubmit,
  existingWasteTrackingId,
  defaultReceiverApiCode,
  defaultCarrier,
  defaultReceiver,
}: ReceiveMovementFormProps) {
  const [isPending, startTransition] = useTransition();

  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const [submitFeedback, setSubmitFeedback] =
    useState<SubmitFeedback | null>(null);

  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [warnings, setWarnings] = useState<FormIssue[]>([]);

  const [wasteTrackingId, setWasteTrackingId] = useState(
    existingWasteTrackingId ?? "",
  );

  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);
  const [lastSubmissionStatus, setLastSubmissionStatus] = useState<
    string | null
  >(null);

  const [selectedPatScenarioId, setSelectedPatScenarioId] = useState<
    PatScenarioId | ""
  >("");

  const [patExpectedErrorOverride, setPatExpectedErrorOverride] =
    useState<PatExpectedErrorOverride>("");

  /* Movement */
  const [receiverApiCode, setReceiverApiCode] = useState(
    defaultReceiverApiCode,
  );
  const [dateTimeReceived, setDateTimeReceived] = useState(
    nowAsIsoLocalInputValue(),
  );
  const [hazardousWasteConsignmentCode, setHazardousWasteConsignmentCode] =
    useState("");
  const [reasonForNoConsignmentCode, setReasonForNoConsignmentCode] =
    useState<ReasonForNoConsignmentCode | "">("");
  const [yourUniqueReference, setYourUniqueReference] = useState(
    `WX-${assignmentId.slice(0, 8)}`,
  );
  const [specialHandlingRequirements, setSpecialHandlingRequirements] =
    useState("");

  /* Waste items */
  const [wasteItems, setWasteItems] = useState<WasteItemFormState[]>([
    createDefaultWasteItem(listingName),
  ]);

  /* Carrier */
  const [carrierRegistrationNumber, setCarrierRegistrationNumber] =
    useState("");
  const [
    carrierReasonForNoRegistrationNumber,
    setCarrierReasonForNoRegistrationNumber,
  ] = useState<ReasonForNoRegistrationNumber | "">("");
  const [carrierOrganisationName, setCarrierOrganisationName] = useState(
    defaultCarrier.organisationName,
  );
  const [carrierFullAddress, setCarrierFullAddress] = useState(
    defaultCarrier.fullAddress,
  );
  const [carrierPostcode, setCarrierPostcode] = useState(
    defaultCarrier.postcode,
  );
  const [carrierEmailAddress, setCarrierEmailAddress] = useState(
    defaultCarrier.emailAddress,
  );
  const [carrierPhoneNumber, setCarrierPhoneNumber] = useState(
    defaultCarrier.phoneNumber,
  );
  const [carrierMeansOfTransport, setCarrierMeansOfTransport] =
    useState<MeansOfTransport>("Road");
  const [carrierVehicleRegistration, setCarrierVehicleRegistration] =
    useState("");

  /* Broker / dealer */
  const [brokerDealerEnabled, setBrokerDealerEnabled] = useState(false);
  const [brokerOrDealer, setBrokerOrDealer] = useState<BrokerDealerFormState>(
    createDefaultBrokerDealer(),
  );

  /* Receiver */
  const [receiverSiteName, setReceiverSiteName] = useState(
    defaultReceiver.siteName,
  );
  const [receiverEmailAddress, setReceiverEmailAddress] = useState(
    defaultReceiver.emailAddress,
  );
  const [receiverPhoneNumber, setReceiverPhoneNumber] = useState(
    defaultReceiver.phoneNumber,
  );
  const [receiverAuthorisationNumber, setReceiverAuthorisationNumber] =
    useState("");
  const [receiverRpsNumbers, setReceiverRpsNumbers] = useState("");

  /* Receipt */
  const [receiptFullAddress, setReceiptFullAddress] = useState(
    defaultReceiver.fullAddress || listingLocation,
  );
  const [receiptPostcode, setReceiptPostcode] = useState(
    defaultReceiver.postcode,
  );

  const isUpdate = useMemo(() => Boolean(wasteTrackingId), [wasteTrackingId]);

  const hasSavedReceiverApiCode = useMemo(() => {
    return defaultReceiverApiCode.trim().length > 0;
  }, [defaultReceiverApiCode]);

  const detectedPatScenarioId = useMemo(() => {
    return detectPatScenarioId(
      listingName,
      yourUniqueReference,
      specialHandlingRequirements,
    );
  }, [listingName, yourUniqueReference, specialHandlingRequirements]);

  const activePatScenarioId = useMemo<PatScenarioId | null>(() => {
    if (patExpectedErrorOverride) return patExpectedErrorOverride;

    return detectedPatScenarioId;
  }, [patExpectedErrorOverride, detectedPatScenarioId]);

  const isExpectedDefraErrorPatTest = useMemo(() => {
    return activePatScenarioId
      ? EXPECTED_DEFRA_ERROR_PAT_SCENARIOS.has(activePatScenarioId)
      : false;
  }, [activePatScenarioId]);

  const allowMissingCarrierRegistrationForPat = activePatScenarioId === "C01";
  const allowMissingHazardousConsignmentForPat = activePatScenarioId === "H02";

  function issueMessagesFor(keys: string[]) {
    return issues
      .filter((issue) =>
        keys.some((key) => issueMatchesKey(issue.key, key)),
      )
      .map((issue) => issue.message);
  }

  function hasIssue(keys: string[]) {
    return issueMessagesFor(keys).length > 0;
  }

  function inputClassFor(keys: string[]) {
    if (hasIssue(keys)) {
      return `${inputClass} border-red-300 bg-red-50 focus:border-red-400 focus:ring-red-100`;
    }

    return inputClass;
  }

  function jumpToFeedback() {
    requestAnimationFrame(() => {
      feedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  }

  function jumpToFirstIssue() {
    const firstIssue = issues[0];

    if (!firstIssue) {
      jumpToFeedback();
      return;
    }

    const element = document.getElementById(
      sectionIdForIssue(firstIssue.section),
    );

    if (element) {
      element.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      return;
    }

    jumpToFeedback();
  }

  function applyPatScenario(scenarioId: PatScenarioId) {
    const template = getPatScenarioTemplate(scenarioId);

    setSelectedPatScenarioId(scenarioId);

    setYourUniqueReference(template.yourUniqueReference);
    setSpecialHandlingRequirements(template.specialHandlingRequirements);
    setHazardousWasteConsignmentCode(
      template.hazardousWasteConsignmentCode,
    );
    setReasonForNoConsignmentCode(template.reasonForNoConsignmentCode);

    setWasteItems(template.wasteItems);

    setCarrierRegistrationNumber(template.carrierRegistrationNumber);
    setCarrierReasonForNoRegistrationNumber(
      template.carrierReasonForNoRegistrationNumber,
    );
    setCarrierOrganisationName(template.carrierOrganisationName);
    setCarrierFullAddress(template.carrierFullAddress);
    setCarrierPostcode(template.carrierPostcode);
    setCarrierEmailAddress(template.carrierEmailAddress);
    setCarrierPhoneNumber(template.carrierPhoneNumber);
    setCarrierMeansOfTransport(template.carrierMeansOfTransport);
    setCarrierVehicleRegistration(template.carrierVehicleRegistration);

    setReceiverSiteName(template.receiverSiteName);
    setReceiverAuthorisationNumber(template.receiverAuthorisationNumber);
    setReceiverEmailAddress(template.receiverEmailAddress);
    setReceiverPhoneNumber(template.receiverPhoneNumber);
    setReceiptFullAddress(template.receiptFullAddress);
    setReceiptPostcode(template.receiptPostcode);

    setBrokerDealerEnabled(template.brokerDealerEnabled);
    setBrokerOrDealer(template.brokerOrDealer);

    setPatExpectedErrorOverride(template.expectedErrorScenarioId ?? "");

    setSubmitFeedback({
      type: template.expectedResult === "error" ? "warning" : "info",
      title: `${template.scenarioId} loaded`,
      message:
        template.expectedResult === "error"
          ? "This PAT scenario is expected to fail at DEFRA. Submit the invalid payload and use the returned rejection as evidence."
          : "This PAT scenario has been loaded into the form. Review the values and submit to DEFRA test/sandbox.",
      details: [
        template.label,
        template.description,
        `Expected result: ${
          template.expectedResult === "error"
            ? "Expected error / no WTID"
            : "WTID returned"
        }`,
      ],
    });

    setIssues([]);
    setWarnings([]);

    jumpToFeedback();
  }

  function buildInput(): ReceiveMovementInput {
    const mappedWasteItems = wasteItems.map((item) => {
      const disposalOrRecoveryCodes = item.disposalOrRecoveryCodes
        .filter((row) => row.code.trim() || row.weightAmount.trim())
        .map((row) => ({
          code: row.code.trim(),
          weight: {
            metric: row.weightMetric,
            amount: numberFromText(row.weightAmount),
            isEstimate: row.weightIsEstimate,
          },
        }));

      const popsComponents = item.containsPops
        ? item.popsComponents
            .filter((component) => {
              return component.code.trim() || component.concentration.trim();
            })
            .map((component) => ({
              code: component.code.trim(),
              concentration: parseOptionalNumber(component.concentration),
            }))
        : [];

      const hazardousComponents = item.containsHazardous
        ? item.hazardousComponents
            .filter((component) => {
              return component.name.trim() || component.concentration.trim();
            })
            .map((component) => ({
              name: component.name.trim(),
              concentration: parseOptionalNumber(component.concentration),
            }))
        : [];

      return {
        ewcCodes: splitCodeList(item.ewcCodes),
        wasteDescription: item.wasteDescription,
        physicalForm: item.physicalForm,
        numberOfContainers: numberFromText(item.numberOfContainers),
        typeOfContainers: item.typeOfContainers,
        weight: {
          metric: item.weightMetric,
          amount: numberFromText(item.weightAmount),
          isEstimate: item.weightIsEstimate,
        },
        containsPops: item.containsPops,
        popsSourceOfComponents: item.containsPops
          ? item.popsSourceOfComponents
          : null,
        popsComponents,
        containsHazardous: item.containsHazardous,
        hazardousSourceOfComponents: item.containsHazardous
          ? item.hazardousSourceOfComponents
          : null,
        hazCodes: item.containsHazardous ? splitCodeList(item.hazCodes) : [],
        hazardousComponents,
        disposalOrRecoveryCodes,
      };
    });

    const includeBrokerDealer =
      brokerDealerEnabled || hasAnyBrokerDealerData(brokerOrDealer);

    return {
      receiverApiCode,
      dateTimeReceived: localDateTimeInputToIso(dateTimeReceived),

      hazardousWasteConsignmentCode:
        hazardousWasteConsignmentCode.trim() || null,

      reasonForNoConsignmentCode:
        reasonForNoConsignmentCode === "" ? null : reasonForNoConsignmentCode,

      yourUniqueReference: yourUniqueReference.trim() || null,

      otherReferencesForMovement: [
        ...(activePatScenarioId
          ? [
              {
                label: "DEFRA PAT Scenario",
                reference: activePatScenarioId,
              },
            ]
          : []),
        {
          label: "Waste X Assignment",
          reference: assignmentId,
        },
        {
          label: "Waste X Listing",
          reference: String(listingId),
        },
      ],

      specialHandlingRequirements:
        specialHandlingRequirements.trim() || null,

      wasteItems: mappedWasteItems,

      carrier: {
        registrationNumber: carrierRegistrationNumber.trim() || null,
        reasonForNoRegistrationNumber:
          carrierReasonForNoRegistrationNumber === ""
            ? null
            : carrierReasonForNoRegistrationNumber,
        organisationName: carrierOrganisationName,
        address: {
          fullAddress: carrierFullAddress,
          postcode: carrierPostcode,
        },
        emailAddress: carrierEmailAddress || null,
        phoneNumber: carrierPhoneNumber || null,
        vehicleRegistration: carrierVehicleRegistration || null,
        meansOfTransport: carrierMeansOfTransport,
      },

      brokerOrDealer: includeBrokerDealer
        ? {
            organisationName: brokerOrDealer.organisationName || null,
            address: {
              fullAddress: brokerOrDealer.fullAddress,
              postcode: brokerOrDealer.postcode,
            },
            emailAddress: brokerOrDealer.emailAddress || null,
            phoneNumber: brokerOrDealer.phoneNumber || null,
            registrationNumber: brokerOrDealer.registrationNumber || null,
          }
        : null,

      receiver: {
        siteName: receiverSiteName,
        emailAddress: receiverEmailAddress || null,
        phoneNumber: receiverPhoneNumber || null,
        authorisationNumber: receiverAuthorisationNumber,
        regulatoryPositionStatements: splitNumberList(receiverRpsNumbers),
      },

      receipt: {
        address: {
          fullAddress: receiptFullAddress,
          postcode: receiptPostcode,
        },
      },
    };
  }

  function buildClientSideIssues(): FormIssue[] {
    const nextIssues: FormIssue[] = [];

    function addIssue(key: string, message: string) {
      nextIssues.push({
        key,
        section: sectionForKey(key),
        message,
      });
    }

    if (!canSubmit) {
      addIssue(
        "submission.permission",
        "Submission is currently locked. Check assignment stage, incidents and department permissions.",
      );
    }

    if (!receiverApiCode.trim()) {
      addIssue(
        "apiCode",
        "Receiver API Code is required. Add it in settings or enter it here.",
      );
    }

    if (!dateTimeReceived.trim()) {
      addIssue("dateTimeReceived", "Date and time received is required.");
    }

    const containsHazardousWaste = wasteItems.some(
      (item) =>
        item.containsHazardous ||
        splitCodeList(item.ewcCodes).some((code) => code.endsWith("*")),
    );

    if (
      containsHazardousWaste &&
      !allowMissingHazardousConsignmentForPat &&
      !hazardousWasteConsignmentCode.trim() &&
      !reasonForNoConsignmentCode
    ) {
      addIssue(
        "reasonForNoConsignmentCode",
        "Hazardous waste needs either a consignment code or a reason for no consignment code.",
      );
    }

    if (wasteItems.length === 0) {
      addIssue("wasteItems", "At least one waste item is required.");
    }

    wasteItems.forEach((item, index) => {
      const prefix = `wasteItems[${index}]`;

      if (!item.ewcCodes.trim()) {
        addIssue(
          `${prefix}.ewcCodes`,
          `Waste item ${index + 1}: at least one EWC code is required.`,
        );
      }

      if (!item.wasteDescription.trim()) {
        addIssue(
          `${prefix}.wasteDescription`,
          `Waste item ${index + 1}: waste description is required.`,
        );
      }

      if (!item.typeOfContainers.trim()) {
        addIssue(
          `${prefix}.typeOfContainers`,
          `Waste item ${index + 1}: container type is required.`,
        );
      }

      if (
        item.numberOfContainers.trim() === "" ||
        !Number.isFinite(Number(item.numberOfContainers)) ||
        Number(item.numberOfContainers) < 0
      ) {
        addIssue(
          `${prefix}.numberOfContainers`,
          `Waste item ${index + 1}: number of containers must be 0 or more.`,
        );
      }

      if (
        item.weightAmount.trim() === "" ||
        !Number.isFinite(Number(item.weightAmount)) ||
        Number(item.weightAmount) <= 0
      ) {
        addIssue(
          `${prefix}.weight.amount`,
          `Waste item ${index + 1}: weight amount must be greater than 0.`,
        );
      }

      if (item.containsPops) {
        if (!item.popsSourceOfComponents) {
          addIssue(
            `${prefix}.pops.sourceOfComponents`,
            `Waste item ${index + 1}: POP source is required.`,
          );
        }

        const hasPopComponent = item.popsComponents.some((component) =>
          component.code.trim(),
        );

        if (
          (item.popsSourceOfComponents === "GUIDANCE" ||
            item.popsSourceOfComponents === "OWN_TESTING") &&
          !hasPopComponent
        ) {
          addIssue(
            `${prefix}.pops.components`,
            `Waste item ${index + 1}: at least one POP component is required.`,
          );
        }
      }

      if (item.containsHazardous) {
        if (!item.hazardousSourceOfComponents) {
          addIssue(
            `${prefix}.hazardous.sourceOfComponents`,
            `Waste item ${index + 1}: hazardous source is required.`,
          );
        }

        if (!item.hazCodes.trim()) {
          addIssue(
            `${prefix}.hazardous.hazCodes`,
            `Waste item ${index + 1}: hazardous property codes are required.`,
          );
        }

        const hasHazardousComponent = item.hazardousComponents.some(
          (component) => component.name.trim(),
        );

        if (
          (item.hazardousSourceOfComponents === "GUIDANCE" ||
            item.hazardousSourceOfComponents === "OWN_TESTING") &&
          !hasHazardousComponent
        ) {
          addIssue(
            `${prefix}.hazardous.components`,
            `Waste item ${index + 1}: at least one hazardous component is required.`,
          );
        }
      }

      item.disposalOrRecoveryCodes.forEach((row, rowIndex) => {
        const rowPrefix = `${prefix}.disposalOrRecoveryCodes[${rowIndex}]`;

        if (row.code.trim() && !row.weightAmount.trim()) {
          addIssue(
            `${rowPrefix}.weight.amount`,
            `Waste item ${index + 1}: add a weight for disposal/recovery code ${row.code}.`,
          );
        }

        if (row.weightAmount.trim() && !row.code.trim()) {
          addIssue(
            `${rowPrefix}.code`,
            `Waste item ${index + 1}: add a disposal/recovery code or remove the weight.`,
          );
        }
      });
    });

    if (
      !allowMissingCarrierRegistrationForPat &&
      !carrierRegistrationNumber.trim() &&
      !carrierReasonForNoRegistrationNumber
    ) {
      addIssue(
        "carrier.reasonForNoRegistrationNumber",
        "Add the carrier registration number or choose a reason why there is no registration number.",
      );
    }

    if (!carrierOrganisationName.trim()) {
      addIssue(
        "carrier.organisationName",
        "Carrier organisation name is required.",
      );
    }

    if (!carrierPostcode.trim()) {
      addIssue("carrier.address.postcode", "Carrier postcode is required.");
    }

    if (
      carrierMeansOfTransport === "Road" &&
      !carrierVehicleRegistration.trim()
    ) {
      addIssue(
        "carrier.vehicleRegistration",
        "Vehicle registration is required when the means of transport is Road.",
      );
    }

    if (brokerDealerEnabled || hasAnyBrokerDealerData(brokerOrDealer)) {
      if (!brokerOrDealer.organisationName.trim()) {
        addIssue(
          "brokerOrDealer.organisationName",
          "Broker/dealer organisation name is required.",
        );
      }

      if (!brokerOrDealer.postcode.trim()) {
        addIssue(
          "brokerOrDealer.address.postcode",
          "Broker/dealer postcode is required.",
        );
      }
    }

    if (!receiverSiteName.trim()) {
      addIssue("receiver.siteName", "Receiver site name is required.");
    }

    if (!receiverAuthorisationNumber.trim()) {
      addIssue(
        "receiver.authorisationNumber",
        "Receiver authorisation number is required.",
      );
    }

    if (!receiptFullAddress.trim()) {
      addIssue(
        "receipt.address.fullAddress",
        "Receipt full address is required.",
      );
    }

    if (!receiptPostcode.trim()) {
      addIssue("receipt.address.postcode", "Receipt postcode is required.");
    }

    return nextIssues;
  }

  function handleSubmit() {
    setSubmitFeedback(null);
    setIssues([]);
    setWarnings([]);
    setLastSubmissionId(null);
    setLastSubmissionStatus(null);

    const clientIssues = buildClientSideIssues();

    if (clientIssues.length > 0) {
      setIssues(clientIssues);
      setSubmitFeedback({
        type: "error",
        title: "Submission not sent",
        message: `Waste X found ${clientIssues.length} issue${
          clientIssues.length === 1 ? "" : "s"
        } before contacting the Waste Tracking Service.`,
        details: [
          "Nothing has been sent to the government service yet.",
          "Fix the marked fields and submit again.",
        ],
      });

      jumpToFeedback();
      return;
    }

    setSubmitFeedback({
      type: "info",
      title: "Submitting receive movement",
      message:
        "Waste X is validating the record, creating a submission log and contacting the Waste Tracking Service.",
    });

    jumpToFeedback();

    startTransition(async () => {
      const result = await submitReceiveMovementAction({
        assignmentId,
        wasteTrackingId: wasteTrackingId || null,
        patExpectedErrorScenarioId:
          isExpectedDefraErrorPatTest &&
          (activePatScenarioId === "C01" || activePatScenarioId === "H02")
            ? activePatScenarioId
            : null,
        receiveMovementInput: buildInput(),
      });

      if (!result.success) {
        const serverIssues =
          result.errors?.map(mapDefraIssue) ??
          result.flattenedErrors?.map(mapFlatIssue) ??
          [];

        const serverWarnings = result.warnings?.map(mapDefraIssue) ?? [];

        const isExpectedPatRejection =
          isExpectedDefraErrorPatTest && serverIssues.length > 0;

        setLastSubmissionId(result.submissionId ?? null);
        setLastSubmissionStatus(result.status ?? null);
        setIssues(serverIssues);
        setWarnings(serverWarnings);

        setSubmitFeedback({
          type: isExpectedPatRejection ? "warning" : "error",
          isExpectedPatRejection,
          title: isExpectedPatRejection
            ? `Expected DEFRA rejection recorded (${activePatScenarioId})`
            : "Submission not successful",
          message: isExpectedPatRejection
            ? "This is the correct result for this DEFRA PAT scenario. Waste X allowed the invalid test payload through and the Waste Tracking Service rejected it as expected."
            : result.message ||
              "Waste X could not complete the Digital Waste Tracking submission.",
          details: isExpectedPatRejection
            ? [
                "No Waste Tracking ID is expected for this scenario.",
                "Use the submission ID, tested time, HTTP status and error message as PAT evidence.",
                result.submissionId
                  ? `Submission record: ${result.submissionId}`
                  : "No submission ID was returned.",
              ]
            : [
                serverIssues.length > 0
                  ? `${serverIssues.length} issue${
                      serverIssues.length === 1 ? "" : "s"
                    } need attention.`
                  : "The request failed before a detailed validation list was returned.",
                "Review the issue list below.",
              ],
        });

        jumpToFeedback();
        return;
      }

      const serverWarnings = result.warnings?.map(mapDefraIssue) ?? [];

      setIssues([]);
      setWarnings(serverWarnings);
      setLastSubmissionId(result.submissionId);
      setLastSubmissionStatus(result.status);

      if (result.wasteTrackingId) {
        setWasteTrackingId(result.wasteTrackingId);
      }

      setSubmitFeedback({
        type:
          result.status === "accepted_with_warnings" ? "warning" : "success",
        title:
          result.status === "accepted_with_warnings"
            ? "Submitted, but review warnings"
            : "Submission successful",
        message:
          result.status === "accepted_with_warnings"
            ? "The receive movement was accepted, but the Waste Tracking Service returned warnings."
            : "The receive movement was accepted successfully. Waste X saved the submission record and response.",
        details: [
          `Status: ${formatStatus(result.status)}`,
          result.wasteTrackingId
            ? `Waste tracking ID: ${result.wasteTrackingId}`
            : "Waste tracking ID was not returned in this response.",
          `Submission record: ${result.submissionId}`,
        ],
      });

      jumpToFeedback();
    });
  }

  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Receive Movement
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-black">
            Waste Tracking Service submission
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
            Submit one or more waste items to the DEFRA receive movement
            endpoint. This form now supports the full PAT scenario set.
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-[#f7f3ed] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">
            Submission mode
          </p>

          <p className="mt-1 text-sm font-semibold text-black">
            {isUpdate ? "Update existing movement" : "Create new movement"}
          </p>

          <p className="mt-1 break-all text-xs text-black/45">
            {wasteTrackingId || "No tracking ID yet"}
          </p>
        </div>
      </div>

      <ReceiverApiCodeNotice
        hasSavedReceiverApiCode={hasSavedReceiverApiCode}
        receiverApiCode={receiverApiCode}
      />

      <PatQuickFillPanel
        selectedPatScenarioId={selectedPatScenarioId}
        onSelectedPatScenarioIdChange={setSelectedPatScenarioId}
        onApply={() => {
          if (!selectedPatScenarioId) return;
          applyPatScenario(selectedPatScenarioId);
        }}
      />

      <PatExpectedErrorOverridePanel
        detectedScenarioId={detectedPatScenarioId}
        activeScenarioId={activePatScenarioId}
        override={patExpectedErrorOverride}
        onOverrideChange={setPatExpectedErrorOverride}
      />

      {isExpectedDefraErrorPatTest && (
        <PatExpectedErrorNotice scenarioId={activePatScenarioId} />
      )}

      <div className="mt-8 space-y-8">
        <section
          id="movement-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            1. Movement details
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Receiver API Code"
              required
              helper={
                hasSavedReceiverApiCode
                  ? "Loaded from organisation settings."
                  : "Enter the test receiver API code or save it in settings."
              }
              error={issueMessagesFor(["apiCode", "receiverApiCode"])}
            >
              <input
                value={receiverApiCode}
                readOnly={hasSavedReceiverApiCode}
                onChange={(event) => setReceiverApiCode(event.target.value)}
                className={`${inputClassFor([
                  "apiCode",
                  "receiverApiCode",
                ])} ${
                  hasSavedReceiverApiCode
                    ? "cursor-not-allowed bg-black/5 text-black/55"
                    : ""
                }`}
                placeholder="1f83215e-4b90-4785-9ab2-2614839aa2e9"
              />
            </Field>

            <Field
              label="Date/time received"
              required
              error={issueMessagesFor(["dateTimeReceived"])}
            >
              <input
                type="datetime-local"
                value={dateTimeReceived}
                onChange={(event) => setDateTimeReceived(event.target.value)}
                className={inputClassFor(["dateTimeReceived"])}
              />
            </Field>

            <Field
              label="Hazardous consignment code"
              required={
                wasteItems.some((item) => item.containsHazardous) &&
                !reasonForNoConsignmentCode &&
                !allowMissingHazardousConsignmentForPat
              }
              helper={
                allowMissingHazardousConsignmentForPat
                  ? "PAT H02: leave blank so DEFRA rejects the payload."
                  : "Required for hazardous waste unless a valid reason is selected."
              }
              error={issueMessagesFor(["hazardousWasteConsignmentCode"])}
            >
              <input
                value={hazardousWasteConsignmentCode}
                onChange={(event) =>
                  setHazardousWasteConsignmentCode(event.target.value)
                }
                className={inputClassFor(["hazardousWasteConsignmentCode"])}
                placeholder="H01206/HW001"
              />
            </Field>

            <Field
              label="Reason for no consignment code"
              required={
                wasteItems.some((item) => item.containsHazardous) &&
                !hazardousWasteConsignmentCode.trim() &&
                !allowMissingHazardousConsignmentForPat
              }
              helper={
                allowMissingHazardousConsignmentForPat
                  ? "PAT H02: leave as Not applicable."
                  : "Only needed when hazardous waste has no consignment code."
              }
              error={issueMessagesFor(["reasonForNoConsignmentCode"])}
            >
              <select
                value={reasonForNoConsignmentCode}
                onChange={(event) =>
                  setReasonForNoConsignmentCode(
                    event.target.value as ReasonForNoConsignmentCode | "",
                  )
                }
                className={inputClassFor(["reasonForNoConsignmentCode"])}
              >
                <option value="">Not applicable</option>
                {REASON_FOR_NO_CONSIGNMENT_CODE.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Your unique reference"
              error={issueMessagesFor(["yourUniqueReference"])}
            >
              <input
                value={yourUniqueReference}
                onChange={(event) =>
                  setYourUniqueReference(event.target.value)
                }
                className={inputClassFor(["yourUniqueReference"])}
              />
            </Field>

            <Field
              label="Special handling requirements"
              error={issueMessagesFor(["specialHandlingRequirements"])}
            >
              <textarea
                value={specialHandlingRequirements}
                onChange={(event) =>
                  setSpecialHandlingRequirements(event.target.value)
                }
                className={`${inputClassFor([
                  "specialHandlingRequirements",
                ])} min-h-24`}
                placeholder="Optional"
              />
            </Field>
          </div>
        </section>

        <WasteItemsEditor
          listingName={listingName}
          wasteItems={wasteItems}
          onChange={setWasteItems}
          issueMessagesFor={issueMessagesFor}
          inputClassFor={inputClassFor}
        />

        <section
          id="carrier-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            3. Carrier details
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Carrier registration number"
              required={
                !carrierReasonForNoRegistrationNumber &&
                !allowMissingCarrierRegistrationForPat
              }
              helper={
                allowMissingCarrierRegistrationForPat
                  ? "PAT C01: leave blank so DEFRA rejects the payload."
                  : "Add the registration number or select a reason."
              }
              error={issueMessagesFor(["carrier.registrationNumber"])}
            >
              <input
                value={carrierRegistrationNumber}
                onChange={(event) =>
                  setCarrierRegistrationNumber(event.target.value)
                }
                className={inputClassFor(["carrier.registrationNumber"])}
                placeholder="CBDL999999"
              />
            </Field>

            <Field
              label="Reason for no registration number"
              required={
                !carrierRegistrationNumber.trim() &&
                !allowMissingCarrierRegistrationForPat
              }
              error={issueMessagesFor([
                "carrier.reasonForNoRegistrationNumber",
              ])}
            >
              <select
                value={carrierReasonForNoRegistrationNumber}
                onChange={(event) =>
                  setCarrierReasonForNoRegistrationNumber(
                    event.target.value as ReasonForNoRegistrationNumber | "",
                  )
                }
                className={inputClassFor([
                  "carrier.reasonForNoRegistrationNumber",
                ])}
              >
                <option value="">Not applicable</option>
                {REASON_FOR_NO_REGISTRATION_NUMBER.map((reason) => (
                  <option key={reason} value={reason}>
                    {reason}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Carrier organisation name"
              required
              error={issueMessagesFor(["carrier.organisationName"])}
            >
              <input
                value={carrierOrganisationName}
                onChange={(event) =>
                  setCarrierOrganisationName(event.target.value)
                }
                className={inputClassFor(["carrier.organisationName"])}
              />
            </Field>

            <Field label="Carrier full address">
              <input
                value={carrierFullAddress}
                onChange={(event) => setCarrierFullAddress(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field
              label="Carrier postcode"
              required
              error={issueMessagesFor(["carrier.address.postcode"])}
            >
              <input
                value={carrierPostcode}
                onChange={(event) => setCarrierPostcode(event.target.value)}
                className={inputClassFor(["carrier.address.postcode"])}
              />
            </Field>

            <Field
              label="Carrier email"
              error={issueMessagesFor(["carrier.emailAddress"])}
            >
              <input
                value={carrierEmailAddress}
                onChange={(event) =>
                  setCarrierEmailAddress(event.target.value)
                }
                className={inputClassFor(["carrier.emailAddress"])}
              />
            </Field>

            <Field label="Carrier phone">
              <input
                value={carrierPhoneNumber}
                onChange={(event) =>
                  setCarrierPhoneNumber(event.target.value)
                }
                className={inputClass}
              />
            </Field>

            <Field
              label="Means of transport"
              required
              error={issueMessagesFor(["carrier.meansOfTransport"])}
            >
              <select
                value={carrierMeansOfTransport}
                onChange={(event) =>
                  setCarrierMeansOfTransport(
                    event.target.value as MeansOfTransport,
                  )
                }
                className={inputClassFor(["carrier.meansOfTransport"])}
              >
                {MEANS_OF_TRANSPORT.map((means) => (
                  <option key={means} value={means}>
                    {means}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Vehicle registration"
              required={carrierMeansOfTransport === "Road"}
              error={issueMessagesFor(["carrier.vehicleRegistration"])}
            >
              <input
                value={carrierVehicleRegistration}
                onChange={(event) =>
                  setCarrierVehicleRegistration(event.target.value)
                }
                className={inputClassFor(["carrier.vehicleRegistration"])}
                placeholder="AB12 CDE"
              />
            </Field>
          </div>
        </section>

        <BrokerDealerPanel
          enabled={brokerDealerEnabled}
          brokerOrDealer={brokerOrDealer}
          onEnabledChange={setBrokerDealerEnabled}
          onChange={setBrokerOrDealer}
          issueMessagesFor={issueMessagesFor}
          inputClassFor={inputClassFor}
        />

        <section
          id="receiver-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            5. Receiver and receipt site
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Receiver site name"
              required
              error={issueMessagesFor(["receiver.siteName"])}
            >
              <input
                value={receiverSiteName}
                onChange={(event) => setReceiverSiteName(event.target.value)}
                className={inputClassFor(["receiver.siteName"])}
              />
            </Field>

            <Field
              label="Receiver authorisation number"
              required
              error={issueMessagesFor(["receiver.authorisationNumber"])}
            >
              <input
                value={receiverAuthorisationNumber}
                onChange={(event) =>
                  setReceiverAuthorisationNumber(event.target.value)
                }
                className={inputClassFor(["receiver.authorisationNumber"])}
                placeholder="PPC/A/9999999"
              />
            </Field>

            <Field
              label="Receiver email"
              error={issueMessagesFor(["receiver.emailAddress"])}
            >
              <input
                value={receiverEmailAddress}
                onChange={(event) =>
                  setReceiverEmailAddress(event.target.value)
                }
                className={inputClassFor(["receiver.emailAddress"])}
              />
            </Field>

            <Field label="Receiver phone">
              <input
                value={receiverPhoneNumber}
                onChange={(event) =>
                  setReceiverPhoneNumber(event.target.value)
                }
                className={inputClass}
              />
            </Field>

            <Field label="RPS numbers">
              <input
                value={receiverRpsNumbers}
                onChange={(event) => setReceiverRpsNumbers(event.target.value)}
                className={inputClass}
                placeholder="343, 456"
              />
            </Field>

            <Field
              label="Receipt full address"
              required
              error={issueMessagesFor(["receipt.address.fullAddress"])}
            >
              <input
                value={receiptFullAddress}
                onChange={(event) => setReceiptFullAddress(event.target.value)}
                className={inputClassFor(["receipt.address.fullAddress"])}
              />
            </Field>

            <Field
              label="Receipt postcode"
              required
              error={issueMessagesFor(["receipt.address.postcode"])}
            >
              <input
                value={receiptPostcode}
                onChange={(event) => setReceiptPostcode(event.target.value)}
                className={inputClassFor(["receipt.address.postcode"])}
              />
            </Field>
          </div>
        </section>

        <div id="submit-feedback" ref={feedbackRef} className="scroll-mt-32">
          <FeedbackPanel
            feedback={submitFeedback}
            issues={issues}
            warnings={warnings}
            canSubmit={canSubmit}
            isPending={isPending}
            wasteTrackingId={wasteTrackingId}
            lastSubmissionId={lastSubmissionId}
            lastSubmissionStatus={lastSubmissionStatus}
            onJumpToFirstIssue={jumpToFirstIssue}
          />
        </div>

        <section className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-3xl border border-black/10 bg-black p-6 text-white shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">
              Submit receive movement to Waste Tracking Service
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              This submits the current payload to DEFRA test/sandbox and saves
              the response in Waste X.
            </p>

            {isExpectedDefraErrorPatTest && (
              <p className="mt-3 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
                PAT {activePatScenarioId} is expected to fail. Submit this only
                while using the DEFRA test/sandbox environment.
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={!canSubmit || isPending}
            onClick={handleSubmit}
            className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
          >
            {isPending
              ? "Submitting..."
              : isUpdate
                ? "Update movement"
                : isExpectedDefraErrorPatTest
                  ? "Submit expected-error PAT"
                  : "Submit movement"}
          </button>
        </section>
      </div>
    </div>
  );
}

/* =========================================================
   UI COMPONENTS
========================================================= */

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

function ReceiverApiCodeNotice({
  hasSavedReceiverApiCode,
  receiverApiCode,
}: {
  hasSavedReceiverApiCode: boolean;
  receiverApiCode: string;
}) {
  return (
    <section
      className={`mt-6 rounded-3xl border p-5 ${
        hasSavedReceiverApiCode
          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
          : "border-orange-200 bg-orange-50 text-orange-800"
      }`}
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">
            Receiver API Code
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            {hasSavedReceiverApiCode
              ? "Organisation code is configured"
              : "Organisation code is missing"}
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
            {hasSavedReceiverApiCode
              ? "Waste X loaded the Receiver API Code from organisation settings."
              : "No Receiver API Code is saved for this organisation. Add one in settings or enter it here for testing."}
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            {hasSavedReceiverApiCode ? "Configured" : "Missing"}
          </span>

          {hasSavedReceiverApiCode && (
            <span className="max-w-[16rem] break-all rounded-2xl border border-current/15 bg-white/40 px-4 py-3 text-xs font-semibold">
              {receiverApiCode}
            </span>
          )}

          <Link
            href="/home/settings/digital-waste-tracking"
            className={`inline-flex rounded-full px-4 py-2 text-sm font-semibold transition ${
              hasSavedReceiverApiCode
                ? "bg-emerald-700 text-white hover:bg-emerald-600"
                : "bg-orange-600 text-white hover:bg-orange-500"
            }`}
          >
            Open DWT settings →
          </Link>
        </div>
      </div>
    </section>
  );
}

function PatQuickFillPanel({
  selectedPatScenarioId,
  onSelectedPatScenarioIdChange,
  onApply,
}: {
  selectedPatScenarioId: PatScenarioId | "";
  onSelectedPatScenarioIdChange: (value: PatScenarioId | "") => void;
  onApply: () => void;
}) {
  const selectedTemplate = selectedPatScenarioId
    ? getPatScenarioTemplate(selectedPatScenarioId)
    : null;

  return (
    <section className="mt-6 rounded-3xl border border-black/10 bg-black p-5 text-white">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
            DEFRA PAT quick-fill
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            Load one of the 14 PAT scenarios
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
            Select a scenario and Waste X will fill the waste items, POPs,
            hazardous components, disposal/recovery codes, broker/dealer and
            carrier settings for that test.
          </p>

          {selectedTemplate && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/70">
              <p className="font-semibold text-white">
                {selectedTemplate.label}
              </p>
              <p className="mt-1">{selectedTemplate.description}</p>
              <p className="mt-1">
                Expected:{" "}
                {selectedTemplate.expectedResult === "error"
                  ? "Error / no WTID"
                  : "WTID returned"}
              </p>
            </div>
          )}
        </div>

        <div className="grid w-full gap-3 lg:max-w-md">
          <select
            value={selectedPatScenarioId}
            onChange={(event) =>
              onSelectedPatScenarioIdChange(
                event.target.value as PatScenarioId | "",
              )
            }
            className="w-full rounded-2xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black outline-none"
          >
            <option value="">Choose PAT scenario</option>
            {PAT_SCENARIO_OPTIONS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={!selectedPatScenarioId}
            onClick={onApply}
            className="rounded-full bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/40"
          >
            Apply scenario data
          </button>
        </div>
      </div>
    </section>
  );
}

function PatExpectedErrorOverridePanel({
  detectedScenarioId,
  activeScenarioId,
  override,
  onOverrideChange,
}: {
  detectedScenarioId: PatScenarioId | null;
  activeScenarioId: PatScenarioId | null;
  override: PatExpectedErrorOverride;
  onOverrideChange: (value: PatExpectedErrorOverride) => void;
}) {
  return (
    <section className="mt-6 rounded-3xl border border-orange-200 bg-orange-50 p-5 text-orange-900">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">
            DEFRA PAT expected-error override
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            Only use for C01 and H02
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6">
            This lets intentionally invalid PAT payloads reach DEFRA so their
            API can reject them and Waste X can save the evidence.
          </p>

          <p className="mt-3 text-xs leading-5 opacity-75">
            Detected scenario:{" "}
            <span className="font-semibold">
              {detectedScenarioId ?? "None detected"}
            </span>
            . Active scenario:{" "}
            <span className="font-semibold">
              {activeScenarioId ?? "Normal submission"}
            </span>
            .
          </p>
        </div>

        <div className="w-full max-w-xs">
          <label className="block">
            <span className="mb-2 block text-xs font-semibold opacity-75">
              PAT override
            </span>

            <select
              value={override}
              onChange={(event) =>
                onOverrideChange(event.target.value as PatExpectedErrorOverride)
              }
              className="w-full rounded-2xl border border-orange-200 bg-white px-4 py-3 text-sm font-semibold text-black outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
            >
              <option value="">Auto / normal submission</option>
              <option value="C01">
                C01 - no carrier registration and no reason
              </option>
              <option value="H02">
                H02 - no hazardous consignment code and no reason
              </option>
            </select>
          </label>
        </div>
      </div>
    </section>
  );
}

function PatExpectedErrorNotice({
  scenarioId,
}: {
  scenarioId: PatScenarioId | null;
}) {
  if (!scenarioId) return null;

  return (
    <section className="mt-6 rounded-3xl border border-red-200 bg-red-50 p-5 text-red-800">
      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">
        DEFRA PAT expected-error test
      </p>

      <h3 className="mt-2 text-lg font-semibold">
        {scenarioId} is expected to be rejected
      </h3>

      <p className="mt-2 max-w-3xl text-sm leading-6">
        Do not fix the intentionally invalid field for this scenario. Submit it
        and use DEFRA’s rejection as evidence.
      </p>
    </section>
  );
}

function Field({
  label,
  required = false,
  helper,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  error?: string[];
  children: ReactNode;
}) {
  const errors = error?.filter(Boolean) ?? [];

  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>

      {children}

      {helper && errors.length === 0 && (
        <span className="mt-2 block text-xs leading-5 text-black/35">
          {helper}
        </span>
      )}

      {errors.length > 0 && (
        <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2">
          {errors.map((item) => (
            <p key={item} className="text-xs leading-5 text-red-700">
              {item}
            </p>
          ))}
        </div>
      )}
    </label>
  );
}

function FeedbackPanel({
  feedback,
  issues,
  warnings,
  canSubmit,
  isPending,
  wasteTrackingId,
  lastSubmissionId,
  lastSubmissionStatus,
  onJumpToFirstIssue,
}: {
  feedback: SubmitFeedback | null;
  issues: FormIssue[];
  warnings: FormIssue[];
  canSubmit: boolean;
  isPending: boolean;
  wasteTrackingId: string;
  lastSubmissionId: string | null;
  lastSubmissionStatus: string | null;
  onJumpToFirstIssue: () => void;
}) {
  if (!feedback && issues.length === 0 && warnings.length === 0) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
          Form status
        </p>

        <h3 className="mt-2 text-lg font-semibold text-black">
          {canSubmit ? "Ready when completed" : "Submission currently locked"}
        </h3>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
          {canSubmit
            ? "Complete the required fields or use PAT quick-fill, then submit."
            : "This assignment cannot be submitted yet."}
        </p>
      </section>
    );
  }

  const colourClasses = {
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warning: "border-orange-200 bg-orange-50 text-orange-800",
    error: "border-red-200 bg-red-50 text-red-800",
    info: "border-blue-200 bg-blue-50 text-blue-800",
  };

  const panelClass = feedback
    ? colourClasses[feedback.type]
    : "border-black/10 bg-white text-black";

  return (
    <section className={`rounded-3xl border p-6 shadow-sm ${panelClass}`}>
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">
            Submission feedback
          </p>

          <h3 className="mt-2 text-xl font-semibold">
            {feedback?.title ?? "Review feedback"}
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
            {feedback?.message ??
              "Review the issues and warnings before submitting again."}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isPending && (
            <span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
              Working
            </span>
          )}

          {lastSubmissionStatus && (
            <span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
              {formatStatus(lastSubmissionStatus)}
            </span>
          )}
        </div>
      </div>

      {feedback?.details && feedback.details.length > 0 && (
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm leading-6">
          {feedback.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}

      {(wasteTrackingId || lastSubmissionId) && (
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-current/15 bg-white/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
              Waste tracking ID
            </p>
            <p className="mt-2 break-all text-sm font-semibold">
              {wasteTrackingId || "Not issued / expected error"}
            </p>
          </div>

          <div className="rounded-2xl border border-current/15 bg-white/45 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-60">
              Submission record
            </p>
            <p className="mt-2 break-all text-sm font-semibold">
              {lastSubmissionId || "Not created yet"}
            </p>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div
          className={`mt-5 rounded-2xl border bg-white/60 p-5 ${
            feedback?.isExpectedPatRejection
              ? "border-orange-200"
              : "border-red-200"
          }`}
        >
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p
                className={`text-sm font-semibold ${
                  feedback?.isExpectedPatRejection
                    ? "text-orange-900"
                    : "text-red-800"
                }`}
              >
                {feedback?.isExpectedPatRejection
                  ? "DEFRA returned the expected rejection"
                  : "Why this did not work"}
              </p>

              <p
                className={`mt-1 text-sm leading-6 ${
                  feedback?.isExpectedPatRejection
                    ? "text-orange-800/80"
                    : "text-red-700/80"
                }`}
              >
                {feedback?.isExpectedPatRejection
                  ? "Do not fix this form for this scenario. This error is the evidence."
                  : "Fix these issues and submit again."}
              </p>
            </div>

            {!feedback?.isExpectedPatRejection && (
              <button
                type="button"
                onClick={onJumpToFirstIssue}
                className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
              >
                Jump to first issue
              </button>
            )}
          </div>

          <ul
            className={`mt-4 space-y-2 text-sm leading-6 ${
              feedback?.isExpectedPatRejection
                ? "text-orange-900"
                : "text-red-800"
            }`}
          >
            {issues.map((issue, index) => (
              <li
                key={`${issue.key}-${index}`}
                className={`rounded-2xl px-4 py-3 ${
                  feedback?.isExpectedPatRejection
                    ? "bg-orange-50"
                    : "bg-red-50"
                }`}
              >
                <span className="font-semibold">{issue.section}:</span>{" "}
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-5 rounded-2xl border border-orange-200 bg-white/60 p-5">
          <p className="text-sm font-semibold text-orange-800">
            Warnings to review
          </p>

          <ul className="mt-3 space-y-2 text-sm leading-6 text-orange-800">
            {warnings.map((warning, index) => (
              <li
                key={`${warning.key}-${index}`}
                className="rounded-2xl bg-orange-50 px-4 py-3"
              >
                <span className="font-semibold">{warning.section}:</span>{" "}
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}