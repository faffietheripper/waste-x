import { and, asc, eq } from "drizzle-orm";

import { database } from "@/db/database";
import {
  jobLoads,
  wasteReceiptItems,
  wasteReceipts,
} from "@/db/schema";
import { canonicaliseDwtContainer } from "../core/containerTypes";
import { getWasteTrackingOrganisationSettings } from "./getWasteTrackingOrganisationSettings";

/* WASTE_X_DWT_REGULATORY_ACCEPTANCE_V1 */
/* WASTE_X_DWT_CONTAINER_CANONICAL_RECEIPT_V1 */

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function regulatoryPositionStatementNumbers(params: {
  permitEwcMatchType: string | null | undefined;
  permitEwcBasis: string | null | undefined;
}) {
  if (params.permitEwcMatchType !== "regulatory_authority") {
    return [];
  }

  const match = clean(params.permitEwcBasis).match(
    /^RPS[_\s-]?(\d+)$/i,
  );

  if (!match?.[1]) return [];

  const value = Number(match[1]);

  return Number.isInteger(value) && value > 0 ? [value] : [];
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
  permitEwcMatchType?: string | null;
  permitEwcCode?: string | null;
  permitEwcBasis?: string | null;
  permitEwcReference?: string | null;
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

  if (params.permitEwcMatchType === "regulatory_authority") {
    const basis = [
      clean(params.permitEwcBasis),
      clean(params.permitEwcReference),
    ]
      .filter(Boolean)
      .join(" · ");

    refs.push({
      label: "Waste Acceptance Authority",
      reference: `Actual EWC accepted against permit EWC ${clean(params.permitEwcCode) || "not recorded"}${basis ? ` · ${basis}` : ""}`,
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
      wasteItems: {
        orderBy: (item, { asc }) => [asc(item.itemNumber)],
      },
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
  if (!load.netWeight || Number(load.netWeight) <= 0) missing.push("netWeight");

  const operationalItems = load.wasteItems;

  if (operationalItems.length === 0) {
    if (!clean(load.ewcCodeSnapshot) && !load.ewcCode?.code) {
      missing.push("ewcCode");
    }
    if (!clean(load.wasteDescriptionSnapshot)) {
      missing.push("wasteDescription");
    }
    if (!load.physicalFormSnapshot) {
      missing.push("physicalForm");
    }
  } else {
    for (const item of operationalItems) {
      if (!clean(item.ewcCodeSnapshot)) {
        missing.push(`wasteItem.${item.itemNumber}.ewcCode`);
      }
      if (!clean(item.wasteDescriptionSnapshot)) {
        missing.push(`wasteItem.${item.itemNumber}.wasteDescription`);
      }
      if (!item.physicalFormSnapshot) {
        missing.push(`wasteItem.${item.itemNumber}.physicalForm`);
      }
      if (!item.weightAmount || Number(item.weightAmount) <= 0) {
        missing.push(`wasteItem.${item.itemNumber}.weight`);
      }
    }
  }

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
        permitEwcMatchType: load.permitEwcMatchType,
        permitEwcCode: load.permitEwcCodeSnapshot,
        permitEwcBasis: load.permitEwcBasis,
        permitEwcReference: load.permitEwcReference,
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
      receiverRegulatoryPositionStatements: JSON.stringify(
        Array.from(
          new Set(
            operationalItems.length > 0
              ? operationalItems.flatMap((item) =>
                  regulatoryPositionStatementNumbers({
                    permitEwcMatchType: item.permitEwcMatchType,
                    permitEwcBasis: item.permitEwcBasis,
                  }),
                )
              : regulatoryPositionStatementNumbers({
                  permitEwcMatchType: load.permitEwcMatchType,
                  permitEwcBasis: load.permitEwcBasis,
                }),
          ),
        ),
      ),
      receiptFullAddress: load.ownSite?.fullAddress ?? "",
      receiptPostcode: load.ownSite?.postcode ?? "",

      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: wasteReceipts.id });

  const receiptItemValues =
    operationalItems.length > 0
      ? operationalItems.map((item) => {
          const itemWeightAmount = Number(item.weightAmount ?? "0");
          const disposalRecoveryCodeForItem =
            clean(item.disposalRecoveryCodeSnapshot) ||
            (item.itemNumber === 1 ? disposalRecoveryCode : "");
          const container = canonicaliseDwtContainer({
            typeOfContainers: item.containerTypeSnapshot,
            numberOfContainers: item.numberOfContainers,
          });

          return {
            organisationId: params.organisationId,
            receiptId: receipt.id,

            ewcCodes: JSON.stringify([item.ewcCodeSnapshot]),
            wasteDescription: item.wasteDescriptionSnapshot,
            physicalForm: item.physicalFormSnapshot ?? "Solid",
            numberOfContainers: container.numberOfContainers,
            typeOfContainers: container.code,

            weightMetric: item.weightMetric,
            weightAmount: itemWeightAmount.toFixed(3),
            weightIsEstimate: item.weightIsEstimate,

            containsPops: item.containsPops,
            popsSourceOfComponents: item.popsSourceOfComponents,
            popsComponents: item.popsComponents,

            containsHazardous: item.containsHazardous,
            hazardousSourceOfComponents:
              item.hazardousSourceOfComponents,
            hazardousHazCodes: stringArrayJson(
              item.hazardousHazCodes,
            ),
            hazardousComponents: item.hazardousComponents,

            disposalOrRecoveryCodes: disposalRecoveryCodeForItem
              ? JSON.stringify([
                  {
                    code: disposalRecoveryCodeForItem,
                    weight: {
                      metric: item.weightMetric,
                      amount: itemWeightAmount,
                      isEstimate: item.weightIsEstimate,
                    },
                  },
                ])
              : JSON.stringify([]),

            createdAt: now,
            updatedAt: now,
          };
        })
      : (() => {
          const container = canonicaliseDwtContainer({
            typeOfContainers: load.containerTypeSnapshot,
            numberOfContainers: load.numberOfContainers,
          });

          return [
            {
              organisationId: params.organisationId,
              receiptId: receipt.id,

              ewcCodes: JSON.stringify([ewcCode]),
              wasteDescription: load.wasteDescriptionSnapshot ?? "",
              physicalForm: load.physicalFormSnapshot ?? "Solid",
              numberOfContainers: container.numberOfContainers,
              typeOfContainers: container.code,

            weightMetric: load.weightMetric,
            weightAmount: weightAmount.toFixed(3),
            weightIsEstimate: load.weightIsEstimate,

            containsPops: load.containsPops,
            popsSourceOfComponents: load.popsSourceOfComponents,
            popsComponents: load.popsComponents,

            containsHazardous: load.containsHazardous,
            hazardousSourceOfComponents:
              load.hazardousSourceOfComponents,
            hazardousHazCodes: stringArrayJson(
              load.hazardousHazCodes,
            ),
            hazardousComponents: load.hazardousComponents,

              disposalOrRecoveryCodes,
              createdAt: now,
              updatedAt: now,
            },
          ];
        })();

  await database
    .insert(wasteReceiptItems)
    .values(receiptItemValues);

  return {
    success: true,
    receiptId: receipt.id,
    created: true,
  };
}
