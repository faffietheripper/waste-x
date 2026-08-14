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
  type ReceiveMovementFormProps,
  type SubmitFeedback,
  type WasteItemFormState,
} from "./receiveMovementFormTypes";

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

function isoDateTimeToLocalInputValue(value: string | null | undefined) {
  if (!value) return nowAsIsoLocalInputValue();

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return nowAsIsoLocalInputValue();
  }

  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());

  return date.toISOString().slice(0, 16);
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

function formatReasonLabel(value: string) {
  const labels: Record<string, string> = {
    NON_HAZ_WASTE_TRANSFER: "Non-hazardous waste transfer",
    NO_DOC_WITH_WASTE: "No document came with the waste",
    HWRC_RECEIPT: "Household waste recycling centre receipt",
    ON_SITE: "Moved on site",
    HOUSEHOLD: "Household waste",
    ONE_OFF: "One-off movement",
    MARINE: "Marine movement",
  };

  return (
    labels[value] ??
    value
      .toLowerCase()
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
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
    return "Movement received";
  }

  if (key.startsWith("wasteItems")) return "Waste received";
  if (key.startsWith("carrier")) return "Carrier used";
  if (key.startsWith("brokerOrDealer")) return "Broker / dealer";
  if (key.startsWith("receiver") || key.startsWith("receipt")) {
    return "Receiving site";
  }
  if (key.startsWith("assignment")) return "Assignment checks";
  if (key.startsWith("defra")) return "Waste Tracking Service";

  return "Submission";
}

function sectionIdForIssue(section: string) {
  if (section === "Movement received") return "movement-details";
  if (section === "Waste received") return "waste-items";
  if (section === "Carrier used") return "carrier-details";
  if (section === "Broker / dealer") return "broker-dealer-details";
  if (section === "Receiving site") return "receiver-details";

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
  receiptId = null,
  defaultMovement = null,
  defaultWasteItems = [],
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

  /* Movement */
  const [receiverApiCode, setReceiverApiCode] = useState(
    defaultReceiverApiCode,
  );

  const [dateTimeReceived, setDateTimeReceived] = useState(
    isoDateTimeToLocalInputValue(defaultMovement?.dateTimeReceived ?? null),
  );

  const [hazardousWasteConsignmentCode, setHazardousWasteConsignmentCode] =
    useState(defaultMovement?.hazardousWasteConsignmentCode ?? "");

  const [reasonForNoConsignmentCode, setReasonForNoConsignmentCode] =
    useState<ReasonForNoConsignmentCode | "">(
      defaultMovement?.reasonForNoConsignmentCode ?? "",
    );

  const [yourUniqueReference, setYourUniqueReference] = useState(
    defaultMovement?.yourUniqueReference ?? `WX-${assignmentId.slice(0, 8)}`,
  );

  const [specialHandlingRequirements, setSpecialHandlingRequirements] =
    useState(defaultMovement?.specialHandlingRequirements ?? "");

  /* Waste items */
  const [wasteItems, setWasteItems] = useState<WasteItemFormState[]>(
    defaultWasteItems.length > 0
      ? defaultWasteItems
      : [createDefaultWasteItem(listingName)],
  );

  /* Carrier */
  const [carrierRegistrationNumber, setCarrierRegistrationNumber] = useState(
    defaultCarrier.registrationNumber ?? "",
  );

  const [
    carrierReasonForNoRegistrationNumber,
    setCarrierReasonForNoRegistrationNumber,
  ] = useState<ReasonForNoRegistrationNumber | "">(
    defaultCarrier.reasonForNoRegistrationNumber ?? "",
  );

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
    useState<MeansOfTransport>(defaultCarrier.meansOfTransport ?? "Road");

  const [carrierVehicleRegistration, setCarrierVehicleRegistration] = useState(
    defaultCarrier.vehicleRegistration ?? "",
  );

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
    useState(defaultReceiver.authorisationNumber ?? "");

  const [receiverRpsNumbers, setReceiverRpsNumbers] = useState(
    defaultReceiver.regulatoryPositionStatements ?? "",
  );

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

  const containsHazardousWaste = useMemo(() => {
    return wasteItems.some(
      (item) =>
        item.containsHazardous ||
        splitCodeList(item.ewcCodes).some((code) => code.endsWith("*")),
    );
  }, [wasteItems]);

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
        {
          label: "Waste X Assignment",
          reference: assignmentId,
        },
        {
          label: "Waste X Listing",
          reference: String(listingId),
        },
        ...(receiptId
          ? [
              {
                label: "Waste X Receipt Draft",
                reference: receiptId,
              },
            ]
          : []),
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
        "Submission is currently locked. Check the assignment stage, incidents and your department permissions.",
      );
    }

    if (!receiverApiCode.trim()) {
      addIssue(
        "apiCode",
        "Waste Tracking Service code is required. Add it in settings or enter it here.",
      );
    }

    if (!dateTimeReceived.trim()) {
      addIssue("dateTimeReceived", "Date and time received is required.");
    }

    if (
      containsHazardousWaste &&
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
            `Waste item ${index + 1}: choose how the POPs information was identified.`,
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
            `Waste item ${index + 1}: add at least one POP component.`,
          );
        }
      }

      if (item.containsHazardous) {
        if (!item.hazardousSourceOfComponents) {
          addIssue(
            `${prefix}.hazardous.sourceOfComponents`,
            `Waste item ${index + 1}: choose how the hazardous information was identified.`,
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
            `Waste item ${index + 1}: add at least one hazardous component.`,
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
      addIssue("receiver.siteName", "Receiving site name is required.");
    }

    if (!receiverAuthorisationNumber.trim()) {
      addIssue(
        "receiver.authorisationNumber",
        "Receiving site authorisation or permit number is required.",
      );
    }

    if (!receiptFullAddress.trim()) {
      addIssue(
        "receipt.address.fullAddress",
        "Receipt site full address is required.",
      );
    }

    if (!receiptPostcode.trim()) {
      addIssue("receipt.address.postcode", "Receipt site postcode is required.");
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
          "Nothing has been sent yet.",
          "Fix the marked fields and submit again.",
        ],
      });

      jumpToFeedback();
      return;
    }

    setSubmitFeedback({
      type: "info",
      title: "Submitting received movement",
      message:
        "Waste X is checking the record, sending it to the Waste Tracking Service and saving the response for your audit trail.",
    });

    jumpToFeedback();

    startTransition(async () => {
      const result = await submitReceiveMovementAction({
        assignmentId,
        receiptId: receiptId ?? null,
        wasteTrackingId: wasteTrackingId || null,
        patExpectedErrorScenarioId: null,
        receiveMovementInput: buildInput(),
      });

      if (!result.success) {
        const serverIssues =
          result.errors?.map(mapDefraIssue) ??
          result.flattenedErrors?.map(mapFlatIssue) ??
          [];

        const serverWarnings = result.warnings?.map(mapDefraIssue) ?? [];

        setLastSubmissionId(result.submissionId ?? null);
        setLastSubmissionStatus(result.status ?? null);
        setIssues(serverIssues);
        setWarnings(serverWarnings);

        setSubmitFeedback({
          type: "error",
          title: "Submission not successful",
          message:
            result.message ||
            "Waste X could not complete the Digital Waste Tracking submission.",
          details: [
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
            ? "The received movement was accepted, but the Waste Tracking Service returned warnings."
            : "The received movement was accepted successfully. Waste X saved the submission record and response.",
        details: [
          `Status: ${formatStatus(result.status)}`,
          result.wasteTrackingId
            ? `Waste tracking ID: ${result.wasteTrackingId}`
            : "Waste tracking ID was not returned in this response.",
          `Submission record: ${result.submissionId}`,
          receiptId
            ? `Receipt draft linked: ${receiptId}`
            : "No receipt draft ID was passed.",
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
            Digital Waste Tracking
          </p>

          <h2 className="mt-2 text-2xl font-semibold text-black">
            Submit received waste movement
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/55">
            Confirm the waste received, carrier details, receiving site and
            compliance information before submitting to the Waste Tracking
            Service.
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

      <ReceiverApiCodeNotice hasSavedReceiverApiCode={hasSavedReceiverApiCode} />

      {receiptId && (
        <section className="mt-6 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-800">
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-70">
            Draft connected
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            External job draft has been loaded
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
            Waste X has pre-filled this form from the draft receipt created by
            the external job builder. Review the data, complete any missing
            fields, then submit.
          </p>

          <p className="mt-3 break-all text-xs opacity-70">
            Receipt draft: {receiptId}
          </p>
        </section>
      )}

      <div className="mt-8 space-y-8">
        <section
          id="movement-details"
          className="scroll-mt-32 rounded-3xl border border-black/10 bg-[#f7f3ed] p-6"
        >
          <h3 className="text-lg font-semibold text-black">
            1. Movement received
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Confirm when the waste was received and add any hazardous waste
            consignment details if they apply.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Waste Tracking Service code"
              required
              helper={
                hasSavedReceiverApiCode
                  ? "Loaded securely from organisation settings."
                  : "Enter the receiver code provided for your receiving site."
              }
              error={issueMessagesFor(["apiCode", "receiverApiCode"])}
            >
              <input
                value={
                  hasSavedReceiverApiCode
                    ? "Configured in organisation settings"
                    : receiverApiCode
                }
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
                placeholder="Enter receiving site code"
              />
            </Field>

            <Field
              label="Date and time received"
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
                containsHazardousWaste && !reasonForNoConsignmentCode
              }
              helper="Only required for hazardous waste unless a valid reason is selected."
              error={issueMessagesFor(["hazardousWasteConsignmentCode"])}
            >
              <input
                value={hazardousWasteConsignmentCode}
                onChange={(event) =>
                  setHazardousWasteConsignmentCode(event.target.value)
                }
                className={inputClassFor(["hazardousWasteConsignmentCode"])}
                placeholder="Example: H01206/HW001"
              />
            </Field>

            <Field
              label="Reason if there is no consignment code"
              required={
                containsHazardousWaste &&
                !hazardousWasteConsignmentCode.trim()
              }
              helper="Only choose this when hazardous waste has no consignment code."
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
                    {formatReasonLabel(reason)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Your reference"
              helper="Use your job number, ticket number or internal movement reference."
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
              label="Special handling notes"
              helper="Optional. Add handling instructions, site notes or compliance notes."
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
            3. Carrier used
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Confirm the carrier who transported the waste and how the waste was
            moved.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Carrier registration number"
              required={!carrierReasonForNoRegistrationNumber}
              helper="Add the carrier registration number, or choose a reason if there is no registration number."
              error={issueMessagesFor(["carrier.registrationNumber"])}
            >
              <input
                value={carrierRegistrationNumber}
                onChange={(event) =>
                  setCarrierRegistrationNumber(event.target.value)
                }
                className={inputClassFor(["carrier.registrationNumber"])}
                placeholder="Example: CBDL999999"
              />
            </Field>

            <Field
              label="Reason if there is no registration number"
              required={!carrierRegistrationNumber.trim()}
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
                    {formatReasonLabel(reason)}
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
              helper="Required when the waste was transported by road."
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
            5. Receiving site
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
            Confirm the site that received the waste and the permit,
            authorisation or exemption details for the site.
          </p>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Receiving site name"
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
              label="Permit, authorisation or exemption number"
              required
              helper="Use the permit, authorisation or relevant site reference for the receiving site."
              error={issueMessagesFor(["receiver.authorisationNumber"])}
            >
              <input
                value={receiverAuthorisationNumber}
                onChange={(event) =>
                  setReceiverAuthorisationNumber(event.target.value)
                }
                className={inputClassFor(["receiver.authorisationNumber"])}
                placeholder="Example: PPC/A/9999999"
              />
            </Field>

            <Field
              label="Receiving site email"
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

            <Field label="Receiving site phone">
              <input
                value={receiverPhoneNumber}
                onChange={(event) =>
                  setReceiverPhoneNumber(event.target.value)
                }
                className={inputClass}
              />
            </Field>

            <Field
              label="Regulatory position statement numbers"
              helper="Optional. Separate multiple numbers with commas."
            >
              <input
                value={receiverRpsNumbers}
                onChange={(event) => setReceiverRpsNumbers(event.target.value)}
                className={inputClass}
                placeholder="Example: 343, 456"
              />
            </Field>

            <Field
              label="Receipt site full address"
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
              label="Receipt site postcode"
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
              Submit received movement
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Waste X will validate the record, send it to the Waste Tracking
              Service and save the response for your audit trail.
            </p>
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
}: {
  hasSavedReceiverApiCode: boolean;
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
            Waste Tracking Service
          </p>

          <h3 className="mt-2 text-lg font-semibold">
            {hasSavedReceiverApiCode
              ? "Your receiving site code is configured"
              : "Receiving site code is missing"}
          </h3>

          <p className="mt-2 max-w-3xl text-sm leading-6 opacity-80">
            {hasSavedReceiverApiCode
              ? "Waste X will use the code saved in organisation settings. The full code is not shown here for normal users."
              : "No receiving site code is saved for this organisation. Add one in settings before going live."}
          </p>
        </div>

        <div className="flex flex-col gap-3 md:items-end">
          <span className="rounded-full border border-current/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]">
            {hasSavedReceiverApiCode ? "Configured" : "Missing"}
          </span>

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
            ? "Complete the required fields, then submit the received movement."
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
              {wasteTrackingId || "Not issued"}
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
                What needs fixing
              </p>

              <p className="mt-1 text-sm leading-6 text-red-700/80">
                Fix these issues and submit again.
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