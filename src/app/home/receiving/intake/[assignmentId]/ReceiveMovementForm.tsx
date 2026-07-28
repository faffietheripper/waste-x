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
  PHYSICAL_FORMS,
  REASON_FOR_NO_CONSIGNMENT_CODE,
  REASON_FOR_NO_REGISTRATION_NUMBER,
  SOURCE_OF_COMPONENTS,
  WEIGHT_METRICS,
  type DefraValidationResult,
  type MeansOfTransport,
  type PhysicalForm,
  type ReasonForNoConsignmentCode,
  type ReasonForNoRegistrationNumber,
  type ReceiveMovementInput,
  type SourceOfComponents,
  type WeightMetric,
} from "@/modules/digital-waste-tracking/types/receiveMovement.types";

/* =========================================================
   TYPES
========================================================= */

type DefaultCarrier = {
  organisationName: string;
  fullAddress: string;
  postcode: string;
  emailAddress: string;
  phoneNumber: string;
};

type DefaultReceiver = {
  siteName: string;
  fullAddress: string;
  postcode: string;
  emailAddress: string;
  phoneNumber: string;
};

type Props = {
  assignmentId: string;
  listingId: number;
  listingName: string;
  listingLocation: string;
  canSubmit: boolean;
  existingWasteTrackingId?: string | null;
  defaultReceiverApiCode: string;
  defaultCarrier: DefaultCarrier;
  defaultReceiver: DefaultReceiver;
};

type FeedbackType = "success" | "warning" | "error" | "info";

type SubmitFeedback = {
  type: FeedbackType;
  title: string;
  message: string;
  details?: string[];
};

type FormIssue = {
  key: string;
  section: string;
  message: string;
};

type PatScenarioId =
  | "R01"
  | "R02"
  | "R03"
  | "R04"
  | "R05"
  | "R07"
  | "C01"
  | "C02"
  | "B01"
  | "P01"
  | "H01"
  | "H02"
  | "H03"
  | "X01";

type PatExpectedErrorOverride = "" | "C01" | "H02";

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

  if (
    key.startsWith("wasteItems") &&
    !key.includes("pops") &&
    !key.includes("hazardous") &&
    !key.includes("disposalOrRecoveryCodes")
  ) {
    return "Waste item received";
  }

  if (key.includes("pops") || key.includes("hazardous")) {
    return "POPs and hazardous details";
  }

  if (key.includes("disposalOrRecoveryCodes")) {
    return "Disposal or recovery";
  }

  if (key.startsWith("carrier")) {
    return "Carrier details";
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
  if (section === "Waste item received") return "waste-item-received";
  if (section === "POPs and hazardous details") return "risk-details";
  if (section === "Disposal or recovery") return "disposal-recovery";
  if (section === "Carrier details") return "carrier-details";
  if (section === "Receiver and receipt site") return "receiver-details";

  return "submit-feedback";
}

function issueMatchesKey(issueKey: string, fieldKey: string) {
  return (
    issueKey === fieldKey ||
    issueKey.startsWith(`${fieldKey}.`) ||
    issueKey.startsWith(`${fieldKey}[`)
  );
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
}: Props) {
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

  /* Waste item */
  const [ewcCodes, setEwcCodes] = useState("");
  const [wasteDescription, setWasteDescription] = useState(listingName);
  const [physicalForm, setPhysicalForm] = useState<PhysicalForm>("Solid");
  const [numberOfContainers, setNumberOfContainers] = useState("1");
  const [typeOfContainers, setTypeOfContainers] = useState("SKI");
  const [weightMetric, setWeightMetric] = useState<WeightMetric>("Tonnes");
  const [weightAmount, setWeightAmount] = useState("");
  const [weightIsEstimate, setWeightIsEstimate] = useState(true);

  /* POPs */
  const [containsPops, setContainsPops] = useState(false);
  const [popsSourceOfComponents, setPopsSourceOfComponents] =
    useState<SourceOfComponents>("NOT_PROVIDED");
  const [popsCode, setPopsCode] = useState("");
  const [popsConcentration, setPopsConcentration] = useState("");

  /* Hazardous */
  const [containsHazardous, setContainsHazardous] = useState(false);
  const [hazardousSourceOfComponents, setHazardousSourceOfComponents] =
    useState<SourceOfComponents>("NOT_PROVIDED");
  const [hazCodes, setHazCodes] = useState("");
  const [hazardousComponentName, setHazardousComponentName] = useState("");
  const [hazardousComponentConcentration, setHazardousComponentConcentration] =
    useState("");

  /* Disposal / recovery */
  const [disposalOrRecoveryCode, setDisposalOrRecoveryCode] = useState("");
  const [disposalWeightAmount, setDisposalWeightAmount] = useState("");
  const [disposalWeightMetric, setDisposalWeightMetric] =
    useState<WeightMetric>("Tonnes");
  const [disposalWeightIsEstimate, setDisposalWeightIsEstimate] =
    useState(true);

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

  function buildInput(): ReceiveMovementInput {
    const popsComponents =
      containsPops && popsCode.trim()
        ? [
            {
              code: popsCode.trim(),
              concentration: parseOptionalNumber(popsConcentration),
            },
          ]
        : [];

    const hazardousComponents =
      containsHazardous && hazardousComponentName.trim()
        ? [
            {
              name: hazardousComponentName.trim(),
              concentration: parseOptionalNumber(
                hazardousComponentConcentration,
              ),
            },
          ]
        : [];

    const disposalOrRecoveryCodes =
      disposalOrRecoveryCode.trim() && disposalWeightAmount.trim()
        ? [
            {
              code: disposalOrRecoveryCode.trim(),
              weight: {
                metric: disposalWeightMetric,
                amount: Number(disposalWeightAmount),
                isEstimate: disposalWeightIsEstimate,
              },
            },
          ]
        : [];

    return {
      receiverApiCode,
      dateTimeReceived: localDateTimeInputToIso(dateTimeReceived),

      hazardousWasteConsignmentCode:
        hazardousWasteConsignmentCode.trim() || null,

      reasonForNoConsignmentCode:
        reasonForNoConsignmentCode === "" ? null : reasonForNoConsignmentCode,

      yourUniqueReference: yourUniqueReference.trim() || null,

      otherReferencesForMovement: [
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

      wasteItems: [
        {
          ewcCodes: splitCodeList(ewcCodes),
          wasteDescription,
          physicalForm,
          numberOfContainers: Number(numberOfContainers),
          typeOfContainers,
          weight: {
            metric: weightMetric,
            amount: Number(weightAmount),
            isEstimate: weightIsEstimate,
          },
          containsPops,
          popsSourceOfComponents: containsPops
            ? popsSourceOfComponents
            : null,
          popsComponents,
          containsHazardous,
          hazardousSourceOfComponents: containsHazardous
            ? hazardousSourceOfComponents
            : null,
          hazCodes: splitCodeList(hazCodes),
          hazardousComponents,
          disposalOrRecoveryCodes,
        },
      ],

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
        "Submission is currently locked. This usually means the assignment is not ready, has an unresolved incident, or your active department does not have permission to submit DWT records.",
      );
    }

    if (!receiverApiCode.trim()) {
      addIssue(
        "apiCode",
        "Receiver API Code is required. Add it in Digital Waste Tracking settings so users do not need to enter it every time, or enter it here for this test submission.",
      );
    }

    if (!dateTimeReceived.trim()) {
      addIssue(
        "dateTimeReceived",
        "Date and time received is required.",
      );
    }

    if (containsHazardous) {
      if (
        !allowMissingHazardousConsignmentForPat &&
        !hazardousWasteConsignmentCode.trim() &&
        !reasonForNoConsignmentCode
      ) {
        addIssue(
          "reasonForNoConsignmentCode",
          "Hazardous waste needs either a consignment code or a reason for no consignment code.",
        );
      }
    }

    if (!ewcCodes.trim()) {
      addIssue(
        "wasteItems[0].ewcCodes",
        "At least one EWC code is required. Example: 170904.",
      );
    }

    if (!wasteDescription.trim()) {
      addIssue(
        "wasteItems[0].wasteDescription",
        "Waste description is required.",
      );
    }

    if (!typeOfContainers.trim()) {
      addIssue(
        "wasteItems[0].typeOfContainers",
        "Container type code is required.",
      );
    }

    if (
      numberOfContainers.trim() === "" ||
      !Number.isFinite(Number(numberOfContainers)) ||
      Number(numberOfContainers) < 0
    ) {
      addIssue(
        "wasteItems[0].numberOfContainers",
        "Number of containers must be 0 or more.",
      );
    }

    if (
      weightAmount.trim() === "" ||
      !Number.isFinite(Number(weightAmount)) ||
      Number(weightAmount) <= 0
    ) {
      addIssue(
        "wasteItems[0].weight.amount",
        "Weight amount is required and must be greater than 0.",
      );
    }

    if (containsPops) {
      if (
        (popsSourceOfComponents === "GUIDANCE" ||
          popsSourceOfComponents === "OWN_TESTING") &&
        !popsCode.trim()
      ) {
        addIssue(
          "wasteItems[0].pops.components[0].code",
          "POP code is required when POP source is GUIDANCE or OWN_TESTING.",
        );
      }
    }

    if (containsHazardous) {
      if (!hazCodes.trim()) {
        addIssue(
          "wasteItems[0].hazardous.hazCodes",
          "At least one hazardous property code is required when the waste contains hazardous properties.",
        );
      }

      if (
        (hazardousSourceOfComponents === "GUIDANCE" ||
          hazardousSourceOfComponents === "OWN_TESTING") &&
        !hazardousComponentName.trim()
      ) {
        addIssue(
          "wasteItems[0].hazardous.components[0].name",
          "Hazardous component name is required when hazardous source is GUIDANCE or OWN_TESTING.",
        );
      }
    }

    if (disposalOrRecoveryCode.trim() && !disposalWeightAmount.trim()) {
      addIssue(
        "wasteItems[0].disposalOrRecoveryCodes[0].weight.amount",
        "Add a disposal/recovery weight amount or remove the disposal/recovery code.",
      );
    }

    if (disposalWeightAmount.trim() && !disposalOrRecoveryCode.trim()) {
      addIssue(
        "wasteItems[0].disposalOrRecoveryCodes[0].code",
        "Add a disposal/recovery code or remove the disposal/recovery weight.",
      );
    }

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
        } before contacting the Waste Tracking Service. Fix the marked fields and try again.`,
        details: [
          "Nothing has been sent to the government service yet.",
          "Required fields are marked with a red star.",
          "Use the issue list below to see exactly what needs fixing.",
        ],
      });

      jumpToFeedback();
      return;
    }

    setSubmitFeedback({
      type: "info",
      title: "Submitting receive movement",
      message:
        "Waste X is validating the record, creating a submission log and contacting the Waste Tracking Service. Do not close this page.",
    });

    jumpToFeedback();

    startTransition(async () => {
      const result = await submitReceiveMovementAction({
        assignmentId,
        wasteTrackingId: wasteTrackingId || null,
        receiveMovementInput: buildInput(),
      });

      if (!result.success) {
        const serverIssues =
          result.errors?.map(mapDefraIssue) ??
          result.flattenedErrors?.map(mapFlatIssue) ??
          [];

        const serverWarnings = result.warnings?.map(mapDefraIssue) ?? [];

        const hasDefraValidationErrors = Boolean(result.errors?.length);

        const isExpectedPatRejection =
          isExpectedDefraErrorPatTest && serverIssues.length > 0;

        setIssues(serverIssues);
        setWarnings(serverWarnings);

        setSubmitFeedback({
          type: isExpectedPatRejection ? "warning" : "error",
          title: isExpectedPatRejection
            ? `Expected PAT error received (${activePatScenarioId})`
            : "Submission not successful",
          message: isExpectedPatRejection
            ? hasDefraValidationErrors
              ? "This is the correct result for this DEFRA PAT scenario. Waste X allowed the invalid test payload through the frontend, and the Waste Tracking Service returned validation errors as expected."
              : "Waste X allowed the invalid PAT payload through the frontend, but this may still have been stopped by server-side validation before DEFRA. Check the DWT submission register to confirm whether the external request was logged."
            : result.message ||
              "Waste X could not complete the Digital Waste Tracking submission.",
          details: isExpectedPatRejection
            ? [
                "No Waste Tracking ID is expected for this scenario.",
                "For the DEFRA email, include the scenario ID, scenario description, EWC codes, tested time and the returned error.",
                hasDefraValidationErrors
                  ? "This appears to be DEFRA validation evidence."
                  : "If no DWT submission record was created, patch the server action next so this expected-error PAT test can reach DEFRA.",
              ]
            : [
                serverIssues.length > 0
                  ? `${serverIssues.length} issue${
                      serverIssues.length === 1 ? "" : "s"
                    } need attention.`
                  : "The request failed before a detailed validation list was returned.",
                "Review the issue list below and fix the marked fields.",
                "If the issue says Waste Tracking Service, the external service rejected or failed the request.",
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
            ? "The receive movement was accepted, but the Waste Tracking Service returned warnings. Waste X saved the response so compliance can review it."
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
            Confirm the waste received at site. Waste X will validate the data
            locally, then submit it to the receive movement endpoint.
          </p>

          <p className="mt-3 text-xs font-medium text-black/45">
            <span className="font-semibold text-red-500">*</span> Required
            fields must be completed before submission.
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
        {/* ================= MOVEMENT ================= */}
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
                  ? "Loaded from organisation Digital Waste Tracking settings. To change it, update the settings page."
                  : "No Receiver API Code is saved yet. Enter one here for testing, or save it in DWT settings so users do not type it every time."
              }
              error={issueMessagesFor(["apiCode", "receiverApiCode"])}
            >
              <div className="space-y-3">
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

                <div
                  className={`rounded-2xl border px-4 py-3 text-xs leading-5 ${
                    hasSavedReceiverApiCode
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                      : "border-orange-200 bg-orange-50 text-orange-800"
                  }`}
                >
                  <p className="font-semibold">
                    {hasSavedReceiverApiCode
                      ? "Receiver API Code loaded from settings"
                      : "Receiver API Code not saved yet"}
                  </p>

                  <p className="mt-1">
                    {hasSavedReceiverApiCode
                      ? "This code belongs to the receiving organisation/operator and is stored against the organisation, not typed manually for every movement."
                      : "Admins should add the code in settings. This avoids mistakes and stops users from guessing which code to use."}
                  </p>

                  <Link
                    href="/home/settings/digital-waste-tracking"
                    className="mt-2 inline-flex font-semibold underline underline-offset-4"
                  >
                    Open DWT settings →
                  </Link>
                </div>
              </div>
            </Field>

            <Field
              label="Date/time received"
              required
              helper="Use the time the waste was actually received at the site."
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
                containsHazardous &&
                !reasonForNoConsignmentCode &&
                !allowMissingHazardousConsignmentForPat
              }
              helper={
                allowMissingHazardousConsignmentForPat
                  ? "PAT H02 expected-error test: leave this blank so DEFRA can reject the payload."
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
                placeholder="CJ32LE/A0001"
              />
            </Field>

            <Field
              label="Reason for no consignment code"
              required={
                containsHazardous &&
                !hazardousWasteConsignmentCode.trim() &&
                !allowMissingHazardousConsignmentForPat
              }
              helper={
                allowMissingHazardousConsignmentForPat
                  ? "PAT H02 expected-error test: leave this as Not applicable."
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
              helper="Waste X adds the assignment and listing references automatically as additional references."
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
              helper="Optional. Add handling notes, access issues, contamination notes or site instructions."
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

        {/* ================= WASTE ITEM ================= */}
        <section
          id="waste-item-received"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            2. Waste item received
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="EWC codes"
              required
              helper="Use six-digit EWC codes. Separate multiple codes with commas."
              error={issueMessagesFor(["wasteItems[0].ewcCodes"])}
            >
              <input
                value={ewcCodes}
                onChange={(event) => setEwcCodes(event.target.value)}
                className={inputClassFor(["wasteItems[0].ewcCodes"])}
                placeholder="170904, 150109"
              />
            </Field>

            <Field
              label="Waste description"
              required
              helper="Describe what was actually received, not only what was expected."
              error={issueMessagesFor(["wasteItems[0].wasteDescription"])}
            >
              <textarea
                value={wasteDescription}
                onChange={(event) => setWasteDescription(event.target.value)}
                className={`${inputClassFor([
                  "wasteItems[0].wasteDescription",
                ])} min-h-24`}
              />
            </Field>

            <Field
              label="Physical form"
              required
              error={issueMessagesFor(["wasteItems[0].physicalForm"])}
            >
              <select
                value={physicalForm}
                onChange={(event) =>
                  setPhysicalForm(event.target.value as PhysicalForm)
                }
                className={inputClassFor(["wasteItems[0].physicalForm"])}
              >
                {PHYSICAL_FORMS.map((form) => (
                  <option key={form} value={form}>
                    {form}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Container type code"
              required
              helper="Use a valid container type code from synced reference data."
              error={issueMessagesFor(["wasteItems[0].typeOfContainers"])}
            >
              <input
                value={typeOfContainers}
                onChange={(event) => setTypeOfContainers(event.target.value)}
                className={inputClassFor(["wasteItems[0].typeOfContainers"])}
                placeholder="SKI"
              />
            </Field>

            <Field
              label="Number of containers"
              required
              error={issueMessagesFor(["wasteItems[0].numberOfContainers"])}
            >
              <input
                type="number"
                min="0"
                value={numberOfContainers}
                onChange={(event) =>
                  setNumberOfContainers(event.target.value)
                }
                className={inputClassFor(["wasteItems[0].numberOfContainers"])}
              />
            </Field>

            <Field
              label="Weight amount"
              required
              helper="Must be greater than 0."
              error={issueMessagesFor([
                "wasteItems[0].weight",
                "wasteItems[0].weight.amount",
              ])}
            >
              <input
                type="number"
                min="0"
                step="0.001"
                value={weightAmount}
                onChange={(event) => setWeightAmount(event.target.value)}
                className={inputClassFor([
                  "wasteItems[0].weight",
                  "wasteItems[0].weight.amount",
                ])}
                placeholder="1.5"
              />
            </Field>

            <Field
              label="Weight metric"
              required
              error={issueMessagesFor(["wasteItems[0].weight.metric"])}
            >
              <select
                value={weightMetric}
                onChange={(event) =>
                  setWeightMetric(event.target.value as WeightMetric)
                }
                className={inputClassFor(["wasteItems[0].weight.metric"])}
              >
                {WEIGHT_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </Field>

            <ToggleField
              label="Weight is estimated"
              checked={weightIsEstimate}
              onChange={setWeightIsEstimate}
            />
          </div>
        </section>

        {/* ================= POPS / HAZARDOUS ================= */}
        <section
          id="risk-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            3. POPs and hazardous details
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <ToggleField
              label="Contains POPs"
              checked={containsPops}
              onChange={setContainsPops}
            />

            <ToggleField
              label="Contains hazardous properties"
              checked={containsHazardous}
              onChange={setContainsHazardous}
            />

            {containsPops && (
              <>
                <Field
                  label="POPs source of components"
                  required
                  error={issueMessagesFor([
                    "wasteItems[0].pops.sourceOfComponents",
                  ])}
                >
                  <select
                    value={popsSourceOfComponents}
                    onChange={(event) =>
                      setPopsSourceOfComponents(
                        event.target.value as SourceOfComponents,
                      )
                    }
                    className={inputClassFor([
                      "wasteItems[0].pops.sourceOfComponents",
                    ])}
                  >
                    {SOURCE_OF_COMPONENTS.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="POP code"
                  required={
                    popsSourceOfComponents === "GUIDANCE" ||
                    popsSourceOfComponents === "OWN_TESTING"
                  }
                  helper="Required when source is GUIDANCE or OWN_TESTING."
                  error={issueMessagesFor([
                    "wasteItems[0].pops.components",
                    "wasteItems[0].pops.components[0].code",
                  ])}
                >
                  <input
                    value={popsCode}
                    onChange={(event) => setPopsCode(event.target.value)}
                    className={inputClassFor([
                      "wasteItems[0].pops.components",
                      "wasteItems[0].pops.components[0].code",
                    ])}
                    placeholder="PFHXS"
                  />
                </Field>

                <Field
                  label="POP concentration"
                  helper="Optional unless your source data requires it."
                  error={issueMessagesFor([
                    "wasteItems[0].pops.components[0].concentration",
                  ])}
                >
                  <input
                    type="number"
                    step="0.001"
                    value={popsConcentration}
                    onChange={(event) =>
                      setPopsConcentration(event.target.value)
                    }
                    className={inputClassFor([
                      "wasteItems[0].pops.components[0].concentration",
                    ])}
                    placeholder="Optional"
                  />
                </Field>
              </>
            )}

            {containsHazardous && (
              <>
                <Field
                  label="Hazardous source of components"
                  required
                  error={issueMessagesFor([
                    "wasteItems[0].hazardous.sourceOfComponents",
                  ])}
                >
                  <select
                    value={hazardousSourceOfComponents}
                    onChange={(event) =>
                      setHazardousSourceOfComponents(
                        event.target.value as SourceOfComponents,
                      )
                    }
                    className={inputClassFor([
                      "wasteItems[0].hazardous.sourceOfComponents",
                    ])}
                  >
                    {SOURCE_OF_COMPONENTS.map((source) => (
                      <option key={source} value={source}>
                        {source}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field
                  label="Hazardous property codes"
                  required
                  helper="Separate multiple hazardous property codes with commas."
                  error={issueMessagesFor([
                    "wasteItems[0].hazardous.hazCodes",
                  ])}
                >
                  <input
                    value={hazCodes}
                    onChange={(event) => setHazCodes(event.target.value)}
                    className={inputClassFor([
                      "wasteItems[0].hazardous.hazCodes",
                    ])}
                    placeholder="HP_5, HP_10"
                  />
                </Field>

                <Field
                  label="Hazardous component name"
                  required={
                    hazardousSourceOfComponents === "GUIDANCE" ||
                    hazardousSourceOfComponents === "OWN_TESTING"
                  }
                  helper="Required when source is GUIDANCE or OWN_TESTING."
                  error={issueMessagesFor([
                    "wasteItems[0].hazardous.components",
                    "wasteItems[0].hazardous.components[0].name",
                  ])}
                >
                  <input
                    value={hazardousComponentName}
                    onChange={(event) =>
                      setHazardousComponentName(event.target.value)
                    }
                    className={inputClassFor([
                      "wasteItems[0].hazardous.components",
                      "wasteItems[0].hazardous.components[0].name",
                    ])}
                    placeholder="lead"
                  />
                </Field>

                <Field
                  label="Hazardous component concentration"
                  helper="Optional unless your source data requires it."
                  error={issueMessagesFor([
                    "wasteItems[0].hazardous.components[0].concentration",
                  ])}
                >
                  <input
                    type="number"
                    step="0.001"
                    value={hazardousComponentConcentration}
                    onChange={(event) =>
                      setHazardousComponentConcentration(event.target.value)
                    }
                    className={inputClassFor([
                      "wasteItems[0].hazardous.components[0].concentration",
                    ])}
                    placeholder="Optional"
                  />
                </Field>
              </>
            )}
          </div>
        </section>

        {/* ================= DISPOSAL / RECOVERY ================= */}
        <section
          id="disposal-recovery"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            4. Disposal or recovery
          </h3>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Disposal/recovery code"
              required={Boolean(disposalWeightAmount.trim())}
              helper="Optional, but if you add a weight you must also add a code."
              error={issueMessagesFor([
                "wasteItems[0].disposalOrRecoveryCodes",
                "wasteItems[0].disposalOrRecoveryCodes[0].code",
              ])}
            >
              <input
                value={disposalOrRecoveryCode}
                onChange={(event) =>
                  setDisposalOrRecoveryCode(event.target.value)
                }
                className={inputClassFor([
                  "wasteItems[0].disposalOrRecoveryCodes",
                  "wasteItems[0].disposalOrRecoveryCodes[0].code",
                ])}
                placeholder="R1"
              />
            </Field>

            <Field
              label="Disposal/recovery weight amount"
              required={Boolean(disposalOrRecoveryCode.trim())}
              helper="Optional, but if you add a code you must also add a weight."
              error={issueMessagesFor([
                "wasteItems[0].disposalOrRecoveryCodes[0].weight.amount",
              ])}
            >
              <input
                type="number"
                step="0.001"
                value={disposalWeightAmount}
                onChange={(event) =>
                  setDisposalWeightAmount(event.target.value)
                }
                className={inputClassFor([
                  "wasteItems[0].disposalOrRecoveryCodes[0].weight.amount",
                ])}
                placeholder="Optional"
              />
            </Field>

            <Field label="Disposal/recovery weight metric">
              <select
                value={disposalWeightMetric}
                onChange={(event) =>
                  setDisposalWeightMetric(event.target.value as WeightMetric)
                }
                className={inputClass}
              >
                {WEIGHT_METRICS.map((metric) => (
                  <option key={metric} value={metric}>
                    {metric}
                  </option>
                ))}
              </select>
            </Field>

            <ToggleField
              label="Disposal/recovery weight is estimated"
              checked={disposalWeightIsEstimate}
              onChange={setDisposalWeightIsEstimate}
            />
          </div>
        </section>

        {/* ================= CARRIER ================= */}
        <section
          id="carrier-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            5. Carrier details
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
                  ? "PAT C01 expected-error test: leave this blank so DEFRA can reject the payload."
                  : "Add the registration number, or choose a reason why there is no registration number."
              }
              error={issueMessagesFor(["carrier.registrationNumber"])}
            >
              <input
                value={carrierRegistrationNumber}
                onChange={(event) =>
                  setCarrierRegistrationNumber(event.target.value)
                }
                className={inputClassFor(["carrier.registrationNumber"])}
                placeholder="CBDU999999"
              />
            </Field>

            <Field
              label="Reason for no registration number"
              required={
                !carrierRegistrationNumber.trim() &&
                !allowMissingCarrierRegistrationForPat
              }
              helper={
                allowMissingCarrierRegistrationForPat
                  ? "PAT C01 expected-error test: leave this as Not applicable."
                  : "Required if no carrier registration number is available."
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
              helper="Required when the means of transport is Road."
              error={issueMessagesFor(["carrier.vehicleRegistration"])}
            >
              <input
                value={carrierVehicleRegistration}
                onChange={(event) =>
                  setCarrierVehicleRegistration(event.target.value)
                }
                className={inputClassFor(["carrier.vehicleRegistration"])}
                placeholder="Required for Road"
              />
            </Field>
          </div>
        </section>

        {/* ================= RECEIVER ================= */}
        <section
          id="receiver-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            6. Receiver and receipt site
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
              helper="Permit, licence, exemption or authorisation reference for the receiving site."
              error={issueMessagesFor(["receiver.authorisationNumber"])}
            >
              <input
                value={receiverAuthorisationNumber}
                onChange={(event) =>
                  setReceiverAuthorisationNumber(event.target.value)
                }
                className={inputClassFor(["receiver.authorisationNumber"])}
                placeholder="EPR/DD2522BF"
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

        {/* ================= BOTTOM FEEDBACK ================= */}
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

        {/* ================= SUBMIT ================= */}
        <section className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-3xl border border-black/10 bg-black p-6 text-white shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">
              Submit receive movement to Waste Tracking Service
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Feedback appears directly above this submit area so you do not
              have to scroll back to the top to find out what happened.
            </p>

            {isExpectedDefraErrorPatTest && (
              <p className="mt-3 rounded-2xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-100">
                PAT {activePatScenarioId} is expected to fail. Submit this only
                while using the DEFRA test/sandbox environment.
              </p>
            )}

            {!canSubmit && (
              <p className="mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                Submission is locked for this assignment. Check collection
                status, unresolved incidents, and your active department
                permissions.
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
   SMALL UI COMPONENTS
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
              ? "Waste X has loaded the Receiver API Code from this organisation's Digital Waste Tracking settings. Users should not need to type it manually for each submission."
              : "No Receiver API Code is saved for this organisation. You can type one into this form for testing, but the proper setup is to save it once in Digital Waste Tracking settings."}
          </p>

          <p className="mt-3 max-w-3xl text-xs leading-5 opacity-75">
            The Receiver API Code is not your Defra client ID or client secret.
            The client credentials stay on the server. The Receiver API Code
            identifies the receiving waste operator/site in the receive movement
            payload.
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
            {hasSavedReceiverApiCode ? "Change in settings" : "Add in settings"} →
          </Link>
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
            DEFRA PAT testing tools
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            Expected-error scenario override
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6">
            Use this only for DEFRA PAT scenarios that are supposed to fail.
            This lets the invalid test payload reach the DEFRA test/sandbox API
            so DEFRA can return the expected rejection.
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
        Waste X is allowing this invalid test payload through the frontend
        because this DEFRA PAT scenario requires a real rejection. This bypass
        only applies to PAT scenarios C01 and H02.
      </p>

      <div className="mt-4 rounded-2xl border border-red-200 bg-white px-4 py-3 text-sm leading-6">
        {scenarioId === "C01" && (
          <p>
            For C01, leave the carrier registration number blank and leave the
            reason for no registration number as Not applicable.
          </p>
        )}

        {scenarioId === "H02" && (
          <p>
            For H02, turn on hazardous properties, leave the hazardous
            consignment code blank, and leave the reason for no consignment code
            as Not applicable.
          </p>
        )}
      </div>
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

function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex min-h-[48px] items-center justify-between rounded-2xl border border-black/10 bg-white px-4 py-3">
      <span className="text-sm font-medium text-black/60">{label}</span>

      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition ${
          checked ? "bg-orange-500" : "bg-black/15"
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white transition ${
            checked ? "left-6" : "left-1"
          }`}
        />
      </button>
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
            ? "Complete the required fields marked with a red star, then submit. Any success or failure message will appear here beside the submit button."
            : "This assignment cannot be submitted yet. Check whether collection has been verified, whether there is an unresolved incident, and whether your active department has DWT submission permission."}
        </p>
      </section>
    );
  }

  const colourClasses: Record<FeedbackType, string> = {
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
              {wasteTrackingId || "Not issued yet"}
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
        <div className="mt-5 rounded-2xl border border-red-200 bg-white/60 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-red-800">
                Why this did not work
              </p>
              <p className="mt-1 text-sm leading-6 text-red-700/80">
                Fix these issues and submit again. The matching fields are also
                highlighted in red.
              </p>
            </div>

            <button
              type="button"
              onClick={onJumpToFirstIssue}
              className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-500"
            >
              Jump to first issue
            </button>
          </div>

          <ul className="mt-4 space-y-2 text-sm leading-6 text-red-800">
            {issues.map((issue, index) => (
              <li
                key={`${issue.key}-${index}`}
                className="rounded-2xl bg-red-50 px-4 py-3"
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