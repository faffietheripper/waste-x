"use client";
/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */

import Link from "next/link";
import {
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { submitJobLoadReceiveMovementAction } from "@/modules/digital-waste-tracking/actions/submitJobLoadReceiveMovementAction";
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

/*
  IMPORTANT:
  We deliberately reuse the already-approved waste item and broker/dealer UI
  components. Stage 5 adds a Job Load adapter; it does not replace the PAT
  components or the Defra payload contract.
*/
import BrokerDealerPanel from "@/app/home/receiving/intake/[assignmentId]/BrokerDealerPanel";
import WasteItemsEditor from "@/app/home/receiving/intake/[assignmentId]/WasteItemsEditor";
import {
  createDefaultBrokerDealer,
  createDefaultWasteItem,
  createDisposalRecoveryCode,
  createFormId,
  createHazardousComponent,
  createPopsComponent,
  type BrokerDealerFormState,
  type FormIssue,
  type WasteItemFormState,
} from "@/app/home/receiving/intake/[assignmentId]/receiveMovementFormTypes";

type Props = {
  jobLoadId: string;
  jobNumber: string;
  loadNumber: number;
  clientName: string;
  originName: string;
  receiptId: string;
  canSubmit: boolean;
  existingWasteTrackingId?: string | null;
  defaultInput: ReceiveMovementInput;
};

type Feedback = {
  type: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  details?: string[];
} | null;

const inputClass =
  "w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100";

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

function numberFromText(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseOptionalNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toLocalDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toIsoDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatStatus(value: string | null | undefined) {
  if (!value) return "Unknown";
  return value
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function reasonLabel(value: string) {
  const labels: Record<string, string> = {
    NON_HAZ_WASTE_TRANSFER: "Non-hazardous waste transfer",
    NO_DOC_WITH_WASTE: "No document came with the waste",
    HWRC_RECEIPT: "Household waste recycling centre receipt",
    ON_SITE: "Movement within the same premises",
    HOUSEHOLD: "Householder transporting own waste",
    ONE_OFF: "One-off / infrequent waste transport",
    MARINE: "Marine licence / exempt movement",
  };
  return labels[value] ?? value.replaceAll("_", " ");
}

function sectionForKey(key: string) {
  if (
    key === "apiCode" ||
    key === "receiverApiCode" ||
    key === "dateTimeReceived" ||
    key.includes("consignment") ||
    key === "yourUniqueReference"
  ) {
    return "Movement received";
  }
  if (key.startsWith("wasteItems")) return "Waste received";
  if (key.startsWith("carrier")) return "Carrier used";
  if (key.startsWith("brokerOrDealer")) return "Broker / dealer";
  if (key.startsWith("receiver") || key.startsWith("receipt")) {
    return "Receiving site";
  }
  return "Submission";
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
  return {
    key,
    section: sectionForKey(key),
    message: rest.length > 0 ? rest.join(":").trim() : issue,
  };
}

function issueMatchesKey(issueKey: string, fieldKey: string) {
  return (
    issueKey === fieldKey ||
    issueKey.startsWith(`${fieldKey}.`) ||
    issueKey.startsWith(`${fieldKey}[`)
  );
}

function toWasteItemFormState(
  item: ReceiveMovementInput["wasteItems"][number],
): WasteItemFormState {
  return createDefaultWasteItem(item.wasteDescription, {
    id: createFormId("waste"),
    ewcCodes: item.ewcCodes.join(", "),
    wasteDescription: item.wasteDescription,
    physicalForm: item.physicalForm,
    numberOfContainers: String(item.numberOfContainers),
    typeOfContainers: item.typeOfContainers,
    weightMetric: item.weight.metric,
    weightAmount: String(item.weight.amount),
    weightIsEstimate: item.weight.isEstimate,
    containsPops: item.containsPops,
    popsSourceOfComponents:
      item.popsSourceOfComponents ?? "NOT_PROVIDED",
    popsComponents: (item.popsComponents ?? []).map((component) =>
      createPopsComponent({
        code: component.code,
        concentration:
          component.concentration === undefined
            ? ""
            : String(component.concentration),
      }),
    ),
    containsHazardous: item.containsHazardous,
    hazardousSourceOfComponents:
      item.hazardousSourceOfComponents ?? "NOT_PROVIDED",
    hazCodes: (item.hazCodes ?? []).join(", "),
    hazardousComponents: (item.hazardousComponents ?? []).map((component) =>
      createHazardousComponent({
        name: component.name,
        concentration:
          component.concentration === undefined
            ? ""
            : String(component.concentration),
      }),
    ),
    disposalOrRecoveryCodes:
      (item.disposalOrRecoveryCodes ?? []).length > 0
        ? (item.disposalOrRecoveryCodes ?? []).map((row) =>
            createDisposalRecoveryCode({
              code: row.code,
              weightAmount: String(row.weight.amount),
              weightMetric: row.weight.metric,
              weightIsEstimate: row.weight.isEstimate,
            }),
          )
        : [createDisposalRecoveryCode()],
  });
}

function hasBrokerData(broker: BrokerDealerFormState) {
  return Boolean(
    broker.organisationName.trim() ||
      broker.fullAddress.trim() ||
      broker.postcode.trim() ||
      broker.emailAddress.trim() ||
      broker.phoneNumber.trim() ||
      broker.registrationNumber.trim(),
  );
}

export default function JobLoadReceiveMovementForm({
  jobLoadId,
  jobNumber,
  loadNumber,
  clientName,
  originName,
  receiptId,
  canSubmit,
  existingWasteTrackingId,
  defaultInput,
}: Props) {
  const [isPending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const [feedback, setFeedback] = useState<Feedback>(null);
  const [issues, setIssues] = useState<FormIssue[]>([]);
  const [warnings, setWarnings] = useState<FormIssue[]>([]);
  const [wasteTrackingId, setWasteTrackingId] = useState(
    existingWasteTrackingId ?? "",
  );
  const [lastSubmissionId, setLastSubmissionId] = useState<string | null>(null);

  const [dateTimeReceived, setDateTimeReceived] = useState(
    toLocalDateTime(defaultInput.dateTimeReceived),
  );
  const [hazardousWasteConsignmentCode, setHazardousWasteConsignmentCode] =
    useState(defaultInput.hazardousWasteConsignmentCode ?? "");
  const [reasonForNoConsignmentCode, setReasonForNoConsignmentCode] =
    useState<ReasonForNoConsignmentCode | "">(
      defaultInput.reasonForNoConsignmentCode ?? "",
    );
  const [yourUniqueReference, setYourUniqueReference] = useState(
    defaultInput.yourUniqueReference ?? `WX-${jobNumber}-L${loadNumber}`,
  );
  const [specialHandlingRequirements, setSpecialHandlingRequirements] =
    useState(defaultInput.specialHandlingRequirements ?? "");

  const [wasteItems, setWasteItems] = useState<WasteItemFormState[]>(
    defaultInput.wasteItems.length > 0
      ? defaultInput.wasteItems.map(toWasteItemFormState)
      : [createDefaultWasteItem()],
  );

  const [carrierRegistrationNumber, setCarrierRegistrationNumber] = useState(
    defaultInput.carrier.registrationNumber ?? "",
  );
  const [carrierReason, setCarrierReason] =
    useState<ReasonForNoRegistrationNumber | "">(
      defaultInput.carrier.reasonForNoRegistrationNumber ?? "",
    );
  const [carrierOrganisationName, setCarrierOrganisationName] = useState(
    defaultInput.carrier.organisationName,
  );
  const [carrierFullAddress, setCarrierFullAddress] = useState(
    defaultInput.carrier.address.fullAddress ?? "",
  );
  const [carrierPostcode, setCarrierPostcode] = useState(
    defaultInput.carrier.address.postcode,
  );
  const [carrierEmail, setCarrierEmail] = useState(
    defaultInput.carrier.emailAddress ?? "",
  );
  const [carrierPhone, setCarrierPhone] = useState(
    defaultInput.carrier.phoneNumber ?? "",
  );
  const [carrierMeans, setCarrierMeans] = useState<MeansOfTransport>(
    defaultInput.carrier.meansOfTransport,
  );
  const [carrierVehicle, setCarrierVehicle] = useState(
    defaultInput.carrier.vehicleRegistration ?? "",
  );

  const initialBroker = createDefaultBrokerDealer({
    organisationName: defaultInput.brokerOrDealer?.organisationName ?? "",
    fullAddress: defaultInput.brokerOrDealer?.address?.fullAddress ?? "",
    postcode: defaultInput.brokerOrDealer?.address?.postcode ?? "",
    emailAddress: defaultInput.brokerOrDealer?.emailAddress ?? "",
    phoneNumber: defaultInput.brokerOrDealer?.phoneNumber ?? "",
    registrationNumber: defaultInput.brokerOrDealer?.registrationNumber ?? "",
  });
  const [brokerEnabled, setBrokerEnabled] = useState(
    Boolean(defaultInput.brokerOrDealer),
  );
  const [brokerOrDealer, setBrokerOrDealer] =
    useState<BrokerDealerFormState>(initialBroker);

  const [receiverSiteName, setReceiverSiteName] = useState(
    defaultInput.receiver.siteName,
  );
  const [receiverEmail, setReceiverEmail] = useState(
    defaultInput.receiver.emailAddress ?? "",
  );
  const [receiverPhone, setReceiverPhone] = useState(
    defaultInput.receiver.phoneNumber ?? "",
  );
  const [receiverAuthorisation, setReceiverAuthorisation] = useState(
    defaultInput.receiver.authorisationNumber,
  );
  const [receiverRps, setReceiverRps] = useState(
    (defaultInput.receiver.regulatoryPositionStatements ?? []).join(", "),
  );
  const [receiptFullAddress, setReceiptFullAddress] = useState(
    defaultInput.receipt.address.fullAddress,
  );
  const [receiptPostcode, setReceiptPostcode] = useState(
    defaultInput.receipt.address.postcode,
  );

  const isUpdate = Boolean(wasteTrackingId);

  const containsHazardous = useMemo(
    () =>
      wasteItems.some(
        (item) =>
          item.containsHazardous ||
          splitCodeList(item.ewcCodes).some((code) => code.endsWith("*")),
      ),
    [wasteItems],
  );

  function issueMessagesFor(keys: string[]) {
    return issues
      .filter((issue) => keys.some((key) => issueMatchesKey(issue.key, key)))
      .map((issue) => issue.message);
  }

  function inputClassFor(keys: string[]) {
    return issueMessagesFor(keys).length > 0
      ? `${inputClass} border-red-300 bg-red-50`
      : inputClass;
  }

  function buildInput(): ReceiveMovementInput {
    const mappedWasteItems = wasteItems.map((item) => ({
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
      popsComponents: item.containsPops
        ? item.popsComponents
            .filter((component) => component.code.trim())
            .map((component) => ({
              code: component.code.trim(),
              concentration: parseOptionalNumber(component.concentration),
            }))
        : [],
      containsHazardous: item.containsHazardous,
      hazardousSourceOfComponents: item.containsHazardous
        ? item.hazardousSourceOfComponents
        : null,
      hazCodes: item.containsHazardous ? splitCodeList(item.hazCodes) : [],
      hazardousComponents: item.containsHazardous
        ? item.hazardousComponents
            .filter((component) => component.name.trim())
            .map((component) => ({
              name: component.name.trim(),
              concentration: parseOptionalNumber(component.concentration),
            }))
        : [],
      disposalOrRecoveryCodes: item.disposalOrRecoveryCodes
        .filter((row) => row.code.trim() || row.weightAmount.trim())
        .map((row) => ({
          code: row.code.trim(),
          weight: {
            metric: row.weightMetric,
            amount: numberFromText(row.weightAmount),
            isEstimate: row.weightIsEstimate,
          },
        })),
    }));

    const includeBroker = brokerEnabled || hasBrokerData(brokerOrDealer);

    return {
      receiverApiCode: defaultInput.receiverApiCode,
      dateTimeReceived: toIsoDateTime(dateTimeReceived),
      hazardousWasteConsignmentCode:
        hazardousWasteConsignmentCode.trim() || null,
      reasonForNoConsignmentCode: reasonForNoConsignmentCode || null,
      yourUniqueReference: yourUniqueReference.trim() || null,
      otherReferencesForMovement: defaultInput.otherReferencesForMovement ?? [],
      specialHandlingRequirements: specialHandlingRequirements.trim() || null,
      wasteItems: mappedWasteItems,
      carrier: {
        registrationNumber: carrierRegistrationNumber.trim() || null,
        reasonForNoRegistrationNumber: carrierReason || null,
        organisationName: carrierOrganisationName,
        address: {
          fullAddress: carrierFullAddress,
          postcode: carrierPostcode,
        },
        emailAddress: carrierEmail || null,
        phoneNumber: carrierPhone || null,
        vehicleRegistration: carrierVehicle || null,
        meansOfTransport: carrierMeans,
      },
      brokerOrDealer: includeBroker
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
        emailAddress: receiverEmail || null,
        phoneNumber: receiverPhone || null,
        authorisationNumber: receiverAuthorisation,
        regulatoryPositionStatements: splitNumberList(receiverRps),
      },
      receipt: {
        address: {
          fullAddress: receiptFullAddress,
          postcode: receiptPostcode,
        },
      },
    };
  }

  function handleSubmit() {
    setFeedback({
      type: "info",
      title: "Submitting receipt",
      message:
        "Waste X is using the existing Receipt API validator, payload builder, OAuth flow and response parser.",
    });
    setIssues([]);
    setWarnings([]);
    setLastSubmissionId(null);

    requestAnimationFrame(() =>
      feedbackRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      }),
    );

    startTransition(async () => {
      const result = await submitJobLoadReceiveMovementAction({
        jobLoadId,
        receiptId,
        wasteTrackingId: wasteTrackingId || null,
        receiveMovementInput: buildInput(),
      });

      if (!result.success) {
        const serverIssues =
          result.errors?.map(mapDefraIssue) ??
          result.flattenedErrors?.map(mapFlatIssue) ??
          [];
        const serverWarnings = result.warnings?.map(mapDefraIssue) ?? [];

        setIssues(serverIssues);
        setWarnings(serverWarnings);
        setLastSubmissionId(result.submissionId ?? null);
        setFeedback({
          type: "error",
          title: "Submission not successful",
          message: result.message,
          details: [
            serverIssues.length > 0
              ? `${serverIssues.length} issue${serverIssues.length === 1 ? "" : "s"} need attention.`
              : "The request failed before a detailed validation list was returned.",
            "Nothing is hidden: the attempt is retained in the DWT audit trail when a Defra request was made.",
          ],
        });
        return;
      }

      const serverWarnings = result.warnings.map(mapDefraIssue);
      setIssues([]);
      setWarnings(serverWarnings);
      setLastSubmissionId(result.submissionId);
      if (result.wasteTrackingId) setWasteTrackingId(result.wasteTrackingId);

      setFeedback({
        type:
          result.status === "accepted_with_warnings" ? "warning" : "success",
        title:
          result.status === "accepted_with_warnings"
            ? "Submitted with warnings"
            : "Submission successful",
        message: result.message,
        details: [
          `Status: ${formatStatus(result.status)}`,
          result.wasteTrackingId
            ? `Waste Tracking ID: ${result.wasteTrackingId}`
            : "No Waste Tracking ID was returned.",
          `Submission record: ${result.submissionId}`,
        ],
      });
    });
  }

  return (
    <div className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-black/10 pb-6 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
            Digital Waste Tracking · Receipt review
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-black">
            {jobNumber} · Load {loadNumber}
          </h2>
          <p className="mt-2 text-sm text-black/50">
            {clientName} · {originName}
          </p>
        </div>

        <div className="rounded-2xl border border-black/10 bg-[#f7f3ed] px-5 py-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">
            API mode
          </p>
          <p className="mt-1 text-sm font-semibold text-black">
            {isUpdate ? "PUT · Update existing WTID" : "POST · New receipt"}
          </p>
          <p className="mt-1 max-w-[280px] break-all text-xs text-black/40">
            {wasteTrackingId || "No WTID issued yet"}
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-3xl border border-blue-200 bg-blue-50 p-5 text-blue-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-semibold">Human review remains in place</p>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-blue-800/80">
              Operational data has prefilled the receipt, but Waste X does not
              auto-send it to Defra. Review the waste, carrier and receiver
              details first.
            </p>
          </div>
          <Link
            href="/home/dwt/submissions"
            className="rounded-full bg-blue-800 px-4 py-2 text-sm font-semibold text-white"
          >
            Submission history
          </Link>
        </div>
      </section>

      <div className="mt-8 space-y-8">
        <section className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-6">
          <h3 className="text-lg font-semibold">1. Movement received</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Receiver API Code">
              <input
                value={
                  defaultInput.receiverApiCode
                    ? "Configured in organisation settings"
                    : "Missing"
                }
                readOnly
                className={`${inputClass} cursor-not-allowed bg-black/5`}
              />
            </Field>

            <Field
              label="Date and time received"
              errors={issueMessagesFor(["dateTimeReceived"])}
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
              helper="Required for hazardous waste unless a valid reason applies."
              errors={issueMessagesFor(["hazardousWasteConsignmentCode"])}
            >
              <input
                value={hazardousWasteConsignmentCode}
                onChange={(event) =>
                  setHazardousWasteConsignmentCode(event.target.value)
                }
                className={inputClassFor(["hazardousWasteConsignmentCode"])}
              />
            </Field>

            <Field
              label="Reason for no consignment code"
              errors={issueMessagesFor(["reasonForNoConsignmentCode"])}
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
                    {reasonLabel(reason)}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Your unique reference">
              <input
                value={yourUniqueReference}
                onChange={(event) => setYourUniqueReference(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Special handling requirements">
              <textarea
                value={specialHandlingRequirements}
                onChange={(event) =>
                  setSpecialHandlingRequirements(event.target.value)
                }
                className={`${inputClass} min-h-24`}
              />
            </Field>
          </div>
        </section>

        <WasteItemsEditor
          listingName={`${jobNumber} Load ${loadNumber}`}
          wasteItems={wasteItems}
          onChange={setWasteItems}
          issueMessagesFor={issueMessagesFor}
          inputClassFor={inputClassFor}
        />

        <section className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-6">
          <h3 className="text-lg font-semibold">3. Carrier used</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Carrier registration number"
              errors={issueMessagesFor(["carrier.registrationNumber"])}
            >
              <input
                value={carrierRegistrationNumber}
                onChange={(event) => {
                  setCarrierRegistrationNumber(event.target.value);
                  if (event.target.value.trim()) setCarrierReason("");
                }}
                className={inputClassFor(["carrier.registrationNumber"])}
              />
            </Field>

            <Field
              label="Reason for no carrier registration number"
              errors={issueMessagesFor([
                "carrier.reasonForNoRegistrationNumber",
              ])}
            >
              <select
                value={carrierReason}
                onChange={(event) => {
                  const value = event.target.value as
                    | ReasonForNoRegistrationNumber
                    | "";
                  setCarrierReason(value);
                  if (value) setCarrierRegistrationNumber("");
                }}
                className={inputClassFor([
                  "carrier.reasonForNoRegistrationNumber",
                ])}
              >
                <option value="">Not applicable</option>
                {REASON_FOR_NO_REGISTRATION_NUMBER.map((reason) => (
                  <option key={reason} value={reason}>
                    {reasonLabel(reason)}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              label="Carrier organisation"
              errors={issueMessagesFor(["carrier.organisationName"])}
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
              errors={issueMessagesFor(["carrier.address.postcode"])}
            >
              <input
                value={carrierPostcode}
                onChange={(event) => setCarrierPostcode(event.target.value)}
                className={inputClassFor(["carrier.address.postcode"])}
              />
            </Field>

            <Field label="Carrier email">
              <input
                value={carrierEmail}
                onChange={(event) => setCarrierEmail(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Carrier phone">
              <input
                value={carrierPhone}
                onChange={(event) => setCarrierPhone(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Means of transport">
              <select
                value={carrierMeans}
                onChange={(event) =>
                  setCarrierMeans(event.target.value as MeansOfTransport)
                }
                className={inputClass}
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
              errors={issueMessagesFor(["carrier.vehicleRegistration"])}
            >
              <input
                value={carrierVehicle}
                onChange={(event) => setCarrierVehicle(event.target.value)}
                className={inputClassFor(["carrier.vehicleRegistration"])}
              />
            </Field>
          </div>
        </section>

        <BrokerDealerPanel
          enabled={brokerEnabled}
          brokerOrDealer={brokerOrDealer}
          onEnabledChange={setBrokerEnabled}
          onChange={setBrokerOrDealer}
          issueMessagesFor={issueMessagesFor}
          inputClassFor={inputClassFor}
        />

        <section className="rounded-3xl border border-black/10 bg-[#f7f3ed] p-6">
          <h3 className="text-lg font-semibold">5. Receiving site</h3>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field
              label="Receiving site name"
              errors={issueMessagesFor(["receiver.siteName"])}
            >
              <input
                value={receiverSiteName}
                onChange={(event) => setReceiverSiteName(event.target.value)}
                className={inputClassFor(["receiver.siteName"])}
              />
            </Field>

            <Field
              label="Permit / authorisation number"
              errors={issueMessagesFor(["receiver.authorisationNumber"])}
            >
              <input
                value={receiverAuthorisation}
                onChange={(event) => setReceiverAuthorisation(event.target.value)}
                className={inputClassFor(["receiver.authorisationNumber"])}
              />
            </Field>

            <Field label="Receiving site email">
              <input
                value={receiverEmail}
                onChange={(event) => setReceiverEmail(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Receiving site phone">
              <input
                value={receiverPhone}
                onChange={(event) => setReceiverPhone(event.target.value)}
                className={inputClass}
              />
            </Field>

            <Field label="Regulatory position statement numbers">
              <input
                value={receiverRps}
                onChange={(event) => setReceiverRps(event.target.value)}
                className={inputClass}
                placeholder="Optional: 343, 456"
              />
            </Field>

            <Field
              label="Receipt site full address"
              errors={issueMessagesFor(["receipt.address.fullAddress"])}
            >
              <input
                value={receiptFullAddress}
                onChange={(event) => setReceiptFullAddress(event.target.value)}
                className={inputClassFor(["receipt.address.fullAddress"])}
              />
            </Field>

            <Field
              label="Receipt site postcode"
              errors={issueMessagesFor(["receipt.address.postcode"])}
            >
              <input
                value={receiptPostcode}
                onChange={(event) => setReceiptPostcode(event.target.value)}
                className={inputClassFor(["receipt.address.postcode"])}
              />
            </Field>
          </div>
        </section>

        <div ref={feedbackRef}>
          <FeedbackPanel
            feedback={feedback}
            issues={issues}
            warnings={warnings}
            wasteTrackingId={wasteTrackingId}
            lastSubmissionId={lastSubmissionId}
          />
        </div>

        <section className="sticky bottom-4 z-20 flex flex-col gap-4 rounded-3xl border border-black/10 bg-black p-6 text-white shadow-2xl md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {isUpdate ? "Update Defra receipt" : "Submit Defra receipt"}
            </p>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              No automatic submission occurs. Clicking this button is the human
              approval step.
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

function Field({
  label,
  helper,
  errors = [],
  children,
}: {
  label: string;
  helper?: string;
  errors?: string[];
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/55">
        {label}
      </span>
      {children}
      {errors.length > 0 ? (
        <div className="mt-2 space-y-1 text-xs text-red-700">
          {errors.map((error) => (
            <p key={error}>{error}</p>
          ))}
        </div>
      ) : helper ? (
        <span className="mt-2 block text-xs leading-5 text-black/35">
          {helper}
        </span>
      ) : null}
    </label>
  );
}

function FeedbackPanel({
  feedback,
  issues,
  warnings,
  wasteTrackingId,
  lastSubmissionId,
}: {
  feedback: Feedback;
  issues: FormIssue[];
  warnings: FormIssue[];
  wasteTrackingId: string;
  lastSubmissionId: string | null;
}) {
  if (!feedback && issues.length === 0 && warnings.length === 0) {
    return (
      <section className="rounded-3xl border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold text-black">Ready for review</p>
        <p className="mt-2 text-sm text-black/45">
          Check the prefilled operational data before submitting.
        </p>
      </section>
    );
  }

  const className =
    feedback?.type === "success"
      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
      : feedback?.type === "warning"
        ? "border-orange-200 bg-orange-50 text-orange-800"
        : feedback?.type === "error"
          ? "border-red-200 bg-red-50 text-red-800"
          : "border-blue-200 bg-blue-50 text-blue-800";

  return (
    <section className={`rounded-3xl border p-6 ${className}`}>
      <h3 className="text-lg font-semibold">
        {feedback?.title ?? "Review issues"}
      </h3>
      {feedback?.message && (
        <p className="mt-2 text-sm leading-6 opacity-80">{feedback.message}</p>
      )}
      {feedback?.details && (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {feedback.details.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
      )}

      {(wasteTrackingId || lastSubmissionId) && (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-white/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
              Waste Tracking ID
            </p>
            <p className="mt-2 break-all text-sm font-semibold">
              {wasteTrackingId || "Not issued"}
            </p>
          </div>
          <div className="rounded-2xl bg-white/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] opacity-60">
              Submission record
            </p>
            <p className="mt-2 break-all text-sm font-semibold">
              {lastSubmissionId || "Not created"}
            </p>
          </div>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mt-5 space-y-2">
          {issues.map((issue, index) => (
            <div
              key={`${issue.key}-${index}`}
              className="rounded-2xl bg-white/60 px-4 py-3 text-sm"
            >
              <span className="font-semibold">{issue.section}:</span>{" "}
              {issue.message}
            </div>
          ))}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-sm font-semibold">Warnings</p>
          {warnings.map((warning, index) => (
            <div
              key={`${warning.key}-${index}`}
              className="rounded-2xl bg-white/60 px-4 py-3 text-sm"
            >
              {warning.message}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
