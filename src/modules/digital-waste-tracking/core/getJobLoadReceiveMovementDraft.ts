import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  wasteReceiptItems,
  wasteReceipts,
} from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "../data-access/getWasteTrackingOrganisationSettings";
import type {
  ReceiveMovementInput,
  ReceiveMovementInputWasteItem,
  ReceiveMovementReference,
  ReceiveMovementWeight,
  SourceOfComponents,
} from "../types/receiveMovement.types";

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function parseReferences(value: string | null | undefined) {
  const parsed = parseJson<ReceiveMovementReference[]>(value, []);
  return Array.isArray(parsed) ? parsed : [];
}

function parseStringArray(value: string | null | undefined) {
  const parsed = parseJson<string[]>(value, []);
  if (Array.isArray(parsed) && parsed.length > 0) return parsed;

  return (value ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseDisposalRecoveryCodes(
  value: string | null | undefined,
): Array<{ code: string; weight: ReceiveMovementWeight }> {
  const parsed = parseJson<
    Array<{
      code?: string;
      weight?: {
        metric?: "Grams" | "Kilograms" | "Tonnes";
        amount?: number | string;
        isEstimate?: boolean;
      };
    }>
  >(value, []);

  return parsed
    .map((item) => ({
      code: item.code?.trim() ?? "",
      weight: {
        metric: item.weight?.metric ?? "Tonnes",
        amount: Number(item.weight?.amount ?? 0),
        isEstimate: item.weight?.isEstimate ?? false,
      },
    }))
    .filter((item) => item.code);
}

function parsePopComponents(value: string | null | undefined) {
  const parsed = parseJson<Array<{ code?: string; concentration?: number | string }>>(
    value,
    [],
  );

  return parsed
    .map((item) => ({
      code: item.code?.trim() ?? "",
      concentration:
        item.concentration === undefined
          ? undefined
          : Number(item.concentration),
    }))
    .filter((item) => item.code)
    .map((item) => ({
      code: item.code,
      concentration: Number.isFinite(item.concentration)
        ? item.concentration
        : undefined,
    }));
}

function parseHazardousComponents(value: string | null | undefined) {
  const parsed = parseJson<
    Array<{ name?: string; concentration?: number | string }>
  >(value, []);

  return parsed
    .map((item) => ({
      name: item.name?.trim() ?? "",
      concentration:
        item.concentration === undefined
          ? undefined
          : Number(item.concentration),
    }))
    .filter((item) => item.name)
    .map((item) => ({
      name: item.name,
      concentration: Number.isFinite(item.concentration)
        ? item.concentration
        : undefined,
    }));
}

function mapReceiptItem(
  item: typeof wasteReceiptItems.$inferSelect,
): ReceiveMovementInputWasteItem {
  return {
    ewcCodes: parseStringArray(item.ewcCodes),
    wasteDescription: item.wasteDescription,
    physicalForm: item.physicalForm,
    numberOfContainers: item.numberOfContainers,
    typeOfContainers: item.typeOfContainers,
    weight: {
      metric: item.weightMetric,
      amount: Number(item.weightAmount),
      isEstimate: item.weightIsEstimate,
    },
    containsPops: item.containsPops,
    popsSourceOfComponents: item.popsSourceOfComponents,
    popsComponents: parsePopComponents(item.popsComponents),
    containsHazardous: item.containsHazardous,
    hazardousSourceOfComponents: item.hazardousSourceOfComponents,
    hazCodes: parseStringArray(item.hazardousHazCodes),
    hazardousComponents: parseHazardousComponents(item.hazardousComponents),
    disposalOrRecoveryCodes: parseDisposalRecoveryCodes(
      item.disposalOrRecoveryCodes,
    ),
  };
}

export type JobLoadReceiveMovementDraft = {
  jobLoadId: string;
  jobId: string;
  jobNumber: string;
  loadNumber: number;
  clientName: string;
  originName: string;
  receiptId: string;
  receiptStatus: "draft" | "confirmed" | "submitted";
  receiveMovementInput: ReceiveMovementInput;
};

export async function getJobLoadReceiveMovementDraft(params: {
  organisationId: string;
  jobLoadId: string;
}): Promise<JobLoadReceiveMovementDraft | null> {
  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, params.jobLoadId),
      eq(jobLoads.organisationId, params.organisationId),
    ),
    with: {
      job: true,
      client: true,
      clientSite: true,
    },
  });

  if (!load || load.direction !== "incoming" || load.status !== "completed") {
    return null;
  }

  const receipt = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.organisationId, params.organisationId),
      eq(wasteReceipts.jobLoadId, load.id),
    ),
  });

  if (!receipt) return null;

  const items = await database.query.wasteReceiptItems.findMany({
    where: and(
      eq(wasteReceiptItems.organisationId, params.organisationId),
      eq(wasteReceiptItems.receiptId, receipt.id),
    ),
  });

  const settings = await getWasteTrackingOrganisationSettings({
    organisationId: params.organisationId,
  });

  const sourceOfComponents = (
    value:
      | "NOT_PROVIDED"
      | "PROVIDED_WITH_WASTE"
      | "GUIDANCE"
      | "OWN_TESTING"
      | null,
  ): SourceOfComponents | null => value;

  const input: ReceiveMovementInput = {
    receiverApiCode: settings?.apiCode ?? "",
    dateTimeReceived:
      receipt.receivedAt?.toISOString() ?? load.receivedAt?.toISOString() ?? "",
    hazardousWasteConsignmentCode:
      receipt.hazardousWasteConsignmentCode ?? null,
    reasonForNoConsignmentCode: receipt.reasonForNoConsignmentCode ?? null,
    yourUniqueReference: receipt.yourUniqueReference ?? null,
    otherReferencesForMovement: parseReferences(
      receipt.otherReferencesForMovement,
    ),
    specialHandlingRequirements:
      receipt.specialHandlingRequirements ?? null,

    wasteItems: items.map((item) => {
      const mapped = mapReceiptItem(item);
      return {
        ...mapped,
        popsSourceOfComponents: sourceOfComponents(
          item.popsSourceOfComponents,
        ),
        hazardousSourceOfComponents: sourceOfComponents(
          item.hazardousSourceOfComponents,
        ),
      };
    }),

    carrier: {
      registrationNumber: receipt.carrierRegistrationNumber ?? null,
      reasonForNoRegistrationNumber:
        receipt.carrierReasonForNoRegistrationNumber ?? null,
      organisationName: receipt.carrierOrganisationName ?? "",
      address: {
        fullAddress: receipt.carrierFullAddress ?? "",
        postcode: receipt.carrierPostcode ?? "",
      },
      emailAddress: receipt.carrierEmailAddress ?? null,
      phoneNumber: receipt.carrierPhoneNumber ?? null,
      vehicleRegistration: receipt.carrierVehicleRegistration ?? null,
      meansOfTransport: receipt.carrierMeansOfTransport ?? "Road",
    },

    brokerOrDealer: receipt.brokerDealerOrganisationName
      ? {
          organisationName: receipt.brokerDealerOrganisationName,
          address: {
            fullAddress: receipt.brokerDealerFullAddress ?? "",
            postcode: receipt.brokerDealerPostcode ?? "",
          },
          emailAddress: receipt.brokerDealerEmailAddress ?? null,
          phoneNumber: receipt.brokerDealerPhoneNumber ?? null,
          registrationNumber:
            receipt.brokerDealerRegistrationNumber ?? null,
        }
      : null,

    receiver: {
      siteName: receipt.receiverSiteName ?? "",
      emailAddress: receipt.receiverEmailAddress ?? null,
      phoneNumber: receipt.receiverPhoneNumber ?? null,
      authorisationNumber: receipt.receiverAuthorisationNumber ?? "",
      regulatoryPositionStatements: parseJson<number[]>(
        receipt.receiverRegulatoryPositionStatements,
        [],
      ),
    },

    receipt: {
      address: {
        fullAddress: receipt.receiptFullAddress ?? "",
        postcode: receipt.receiptPostcode ?? "",
      },
    },
  };

  return {
    jobLoadId: load.id,
    jobId: load.jobId,
    jobNumber: load.job.jobNumber,
    loadNumber: load.loadNumber,
    clientName: load.client?.name ?? load.job.jobNumber,
    originName: load.clientSite?.name ?? "Origin not recorded",
    receiptId: receipt.id,
    receiptStatus: receipt.status,
    receiveMovementInput: input,
  };
}
