import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  wasteReceiptItems,
  wasteReceipts,
} from "@/db/schema";
import { getWasteTrackingOrganisationSettings } from "./getWasteTrackingOrganisationSettings";

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function stringArrayJson(value: string | null | undefined) {
  const cleaned = clean(value);
  if (!cleaned) return JSON.stringify([]);

  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return JSON.stringify(
        parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean),
      );
    }
  } catch {
    // Fall through to comma/newline splitting.
  }

  return JSON.stringify(
    cleaned
      .split(/[,;\n]+/)
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

function buildOrganisationAddress(org: {
  streetAddress: string;
  city: string;
  region: string;
  country: string;
}) {
  return [org.streetAddress, org.city, org.region, org.country]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

function buildOtherReferences(params: {
  jobNumber: string;
  purchaseOrder: string | null;
  customerReference: string | null;
}) {
  const refs: Array<{ label: string; reference: string }> = [
    { label: "Waste X Job", reference: params.jobNumber },
  ];

  if (clean(params.purchaseOrder)) {
    refs.push({ label: "Purchase Order", reference: clean(params.purchaseOrder) });
  }

  if (clean(params.customerReference)) {
    refs.push({
      label: "Customer Reference",
      reference: clean(params.customerReference),
    });
  }

  return JSON.stringify(refs);
}

export type PrepareJobLoadWasteReceiptResult =
  | {
      success: true;
      receiptId: string;
      created: boolean;
    }
  | {
      success: false;
      reason: string;
      missing: string[];
    };

export async function prepareJobLoadWasteReceipt(params: {
  organisationId: string;
  jobLoadId: string;
  receivedByUserId?: string | null;
}): Promise<PrepareJobLoadWasteReceiptResult> {
  const existing = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.organisationId, params.organisationId),
      eq(wasteReceipts.jobLoadId, params.jobLoadId),
    ),
  });

  // Never overwrite an existing draft/confirmed/submitted receipt. It may have
  // been reviewed or manually corrected already.
  if (existing) {
    return {
      success: true,
      receiptId: existing.id,
      created: false,
    };
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, params.jobLoadId),
      eq(jobLoads.organisationId, params.organisationId),
    ),
    with: {
      job: true,
      organisation: true,
      ownSite: true,
      sitePermit: true,
      haulier: true,
      vehicle: true,
      ewcCode: true,
      disposalRecoveryCode: true,
      materialProfile: true,
    },
  });

  if (!load) {
    return { success: false, reason: "load_not_found", missing: [] };
  }

  if (load.direction !== "incoming" || load.status !== "completed") {
    return {
      success: false,
      reason: "load_not_completed_incoming",
      missing: [],
    };
  }

  const missing: string[] = [];

  if (!load.receivedAt) missing.push("receivedAt");
  if (!load.ownSite) missing.push("receivingSite");
  if (!load.sitePermit) missing.push("receivingPermit");
  if (!clean(load.ewcCodeSnapshot) && !load.ewcCode?.code) missing.push("ewcCode");
  if (!clean(load.wasteDescriptionSnapshot)) missing.push("wasteDescription");
  if (!load.physicalFormSnapshot) missing.push("physicalForm");
  if (!load.netWeight || Number(load.netWeight) <= 0) missing.push("netWeight");

  if (missing.length > 0) {
    return {
      success: false,
      reason: "load_missing_dwt_data",
      missing,
    };
  }

  const settings = await getWasteTrackingOrganisationSettings({
    organisationId: params.organisationId,
  });

  const org = load.organisation;
  const usingExternalHaulier = Boolean(load.haulierCounterpartyId && load.haulier);

  const carrierRegistrationNumber = usingExternalHaulier
    ? load.haulier?.carrierRegistrationNumber ?? null
    : settings?.ownCarrierRegistrationNumber ?? null;

  const carrierReasonForNoRegistrationNumber = usingExternalHaulier
    ? null
    : settings?.ownCarrierReasonForNoRegistrationNumber ?? null;

  const carrierOrganisationName = usingExternalHaulier
    ? load.haulier?.name ?? ""
    : org.teamName;

  const carrierFullAddress = usingExternalHaulier
    ? load.haulier?.fullAddress ?? ""
    : buildOrganisationAddress(org);

  const carrierPostcode = usingExternalHaulier
    ? load.haulier?.postcode ?? ""
    : org.postCode;

  const carrierEmailAddress = usingExternalHaulier
    ? load.haulier?.email ?? null
    : org.emailAddress;

  const carrierPhoneNumber = usingExternalHaulier
    ? load.haulier?.telephone ?? null
    : org.telephone;

  const meansOfTransport = usingExternalHaulier
    ? "Road"
    : settings?.ownCarrierMeansOfTransport ?? "Road";

  const ewcCode = clean(load.ewcCodeSnapshot) || load.ewcCode?.code || "";
  const weightAmount = Number(load.netWeight ?? "0");

  const disposalRecoveryCode =
    clean(load.disposalRecoveryCodeSnapshot) ||
    load.disposalRecoveryCode?.code ||
    "";

  const disposalOrRecoveryCodes = disposalRecoveryCode
    ? JSON.stringify([
        {
          code: disposalRecoveryCode,
          weight: {
            metric: load.weightMetric,
            amount: weightAmount,
            isEstimate: load.weightIsEstimate,
          },
        },
      ])
    : JSON.stringify([]);

  const now = new Date();

  const [receipt] = await database
    .insert(wasteReceipts)
    .values({
      organisationId: params.organisationId,
      jobLoadId: load.id,
      siteId: load.ownSiteId,
      sitePermitId: load.sitePermitId,
      receivedByUserId: params.receivedByUserId ?? null,

      carrierOrganisationId: usingExternalHaulier ? null : params.organisationId,
      receiverOrganisationId: params.organisationId,
      carrierCounterpartyId: usingExternalHaulier
        ? load.haulierCounterpartyId
        : null,

      receivedAt: load.receivedAt,
      status: "draft",

      yourUniqueReference:
        clean(load.ticketNumber) ||
        `WX-${load.job.jobNumber}-L${load.loadNumber}`,
      otherReferencesForMovement: buildOtherReferences({
        jobNumber: load.job.jobNumber,
        purchaseOrder: load.purchaseOrder ?? load.job.purchaseOrder,
        customerReference:
          load.customerReference ?? load.job.customerReference,
      }),

      carrierRegistrationNumber,
      carrierReasonForNoRegistrationNumber,
      carrierOrganisationName,
      carrierFullAddress,
      carrierPostcode,
      carrierEmailAddress,
      carrierPhoneNumber,
      carrierVehicleRegistration: load.vehicle?.registrationNumber ?? null,
      carrierMeansOfTransport: meansOfTransport,

      receiverSiteName: load.ownSite?.name ?? "",
      receiverEmailAddress: org.emailAddress,
      receiverPhoneNumber: org.telephone,
      receiverAuthorisationNumber: load.sitePermit?.permitNumber ?? "",
      receiptFullAddress: load.ownSite?.fullAddress ?? "",
      receiptPostcode: load.ownSite?.postcode ?? "",

      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: wasteReceipts.id });

  await database.insert(wasteReceiptItems).values({
    organisationId: params.organisationId,
    receiptId: receipt.id,

    ewcCodes: JSON.stringify([ewcCode]),
    wasteDescription: load.wasteDescriptionSnapshot ?? "",
    physicalForm: load.physicalFormSnapshot ?? "Solid",
    numberOfContainers: load.numberOfContainers ?? 0,
    typeOfContainers: load.containerTypeSnapshot ?? "",

    weightMetric: load.weightMetric,
    weightAmount: weightAmount.toFixed(3),
    weightIsEstimate: load.weightIsEstimate,

    containsPops: load.containsPops,
    popsSourceOfComponents: load.popsSourceOfComponents,
    popsComponents: load.popsComponents,

    containsHazardous: load.containsHazardous,
    hazardousSourceOfComponents: load.hazardousSourceOfComponents,
    hazardousHazCodes: stringArrayJson(load.hazardousHazCodes),
    hazardousComponents: load.hazardousComponents,

    disposalOrRecoveryCodes,
    createdAt: now,
    updatedAt: now,
  });

  return {
    success: true,
    receiptId: receipt.id,
    created: true,
  };
}
