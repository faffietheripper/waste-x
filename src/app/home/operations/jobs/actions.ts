// src/app/home/operations/jobs/actions.ts

"use server";

import crypto from "crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, inArray } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  incidents,
  users,
  wasteListings,
  wasteReceiptItems,
  wasteReceipts,
  type OrganisationOperatingMode,
} from "@/db/schema";
import { getSiteForOrganisation } from "@/modules/sites/data-access/getSiteForOrganisation";
import {
  shouldShowExternalJobs,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

type ActionContext = {
  userId: string;
  organisationId: string;
};

/* =========================================================
   REDIRECT HELPERS
========================================================= */

function redirectWithError(error: string): never {
  redirect(`/home/operations/jobs/new?error=${encodeURIComponent(error)}`);
}

function redirectJobsWithError(error: string): never {
  redirect(`/home/operations/jobs?error=${encodeURIComponent(error)}`);
}

function redirectJobWithError(assignmentId: string, error: string): never {
  redirect(
    `/home/operations/jobs/${assignmentId}?error=${encodeURIComponent(error)}`,
  );
}

/* =========================================================
   ACCESS
========================================================= */

async function requireExternalJobsAccess(): Promise<ActionContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
    columns: {
      id: true,
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.organisation ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home");
  }

  const organisationContext = {
    operatingMode:
      currentUser.organisation.operatingMode as OrganisationOperatingMode | null,
    capabilities:
      (currentUser.organisation.capabilities as
        | OrganisationCapability[]
        | null) ?? [],
  };

  if (!shouldShowExternalJobs(organisationContext)) {
    redirect("/home");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
  };
}

/* =========================================================
   FORM HELPERS
========================================================= */

function cleanString(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "";

  return value.trim();
}

function cleanOptionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  return cleaned.length > 0 ? cleaned : null;
}

function cleanDecimalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  const normalised = cleaned.replace(",", ".");

  if (!/^\d+(\.\d{1,3})?$/.test(normalised)) {
    return null;
  }

  return normalised;
}

function cleanInteger(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  const parsed = Number(cleaned);

  if (!Number.isInteger(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseOptionalDate(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  const date = new Date(`${cleaned}T12:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function parseOptionalDateTime(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function addDays(date: Date, days: number) {
  const result = new Date(date);

  result.setDate(result.getDate() + days);

  return result;
}

function normaliseEwcCode(value: string | null) {
  if (!value) return null;

  const cleaned = value.replace(/\s+/g, "").toUpperCase();

  return cleaned.length > 0 ? cleaned : null;
}

function isYes(value: FormDataEntryValue | null) {
  return cleanString(value).toLowerCase() === "yes";
}

function jsonString(value: unknown) {
  return JSON.stringify(value);
}

function getDefaultCollectionEndDate(collectionDate: Date | null) {
  if (collectionDate) return addDays(collectionDate, 30);

  return addDays(new Date(), 30);
}

/* =========================================================
   CREATE EXTERNAL JOB
========================================================= */

export async function createExternalCarrierJobAction(formData: FormData) {
  const context = await requireExternalJobsAccess();

  const siteId = cleanOptionalString(formData.get("siteId"));

  const externalCustomerName = cleanString(
    formData.get("externalCustomerName"),
  );
  const externalCustomerEmail = cleanOptionalString(
    formData.get("externalCustomerEmail"),
  );
  const externalCustomerPhone = cleanOptionalString(
    formData.get("externalCustomerPhone"),
  );
  const externalReference = cleanOptionalString(
    formData.get("externalReference"),
  );

  const externalPickupAddress = cleanString(
    formData.get("externalPickupAddress"),
  );
  const externalPickupPostcode = cleanOptionalString(
    formData.get("externalPickupPostcode"),
  );

  const externalDestinationName = cleanOptionalString(
    formData.get("externalDestinationName"),
  );
  const externalDestinationAddress = cleanOptionalString(
    formData.get("externalDestinationAddress"),
  );
  const externalDestinationPostcode = cleanOptionalString(
    formData.get("externalDestinationPostcode"),
  );

  const externalWasteDescription = cleanString(
    formData.get("externalWasteDescription"),
  );
  const externalEwcCode = cleanOptionalString(formData.get("externalEwcCode"));
  const normalisedEwcCode = normaliseEwcCode(externalEwcCode);

  const externalEstimatedWeight = cleanDecimalString(
    formData.get("externalEstimatedWeight"),
  );

  const externalCollectionDate = parseOptionalDate(
    formData.get("externalCollectionDate"),
  );

  const dateTimeReceived = parseOptionalDateTime(
    formData.get("dateTimeReceived"),
  );

  const externalNotes = cleanOptionalString(formData.get("externalNotes"));

  const hazardousWasteConsignmentCode = cleanOptionalString(
    formData.get("hazardousWasteConsignmentCode"),
  );

  const reasonForNoConsignmentCode = cleanOptionalString(
    formData.get("reasonForNoConsignmentCode"),
  ) as
    | "NON_HAZ_WASTE_TRANSFER"
    | "NO_DOC_WITH_WASTE"
    | "HWRC_RECEIPT"
    | null;

  const yourUniqueReference =
    cleanOptionalString(formData.get("yourUniqueReference")) ??
    externalReference ??
    null;

  const specialHandlingRequirements = cleanOptionalString(
    formData.get("specialHandlingRequirements"),
  );

  const carrierRegistrationNumber = cleanOptionalString(
    formData.get("carrierRegistrationNumber"),
  );

  const carrierReasonForNoRegistrationNumber = cleanOptionalString(
    formData.get("carrierReasonForNoRegistrationNumber"),
  ) as "ON_SITE" | "HOUSEHOLD" | "ONE_OFF" | "MARINE" | null;

  const carrierOrganisationName = cleanOptionalString(
    formData.get("carrierOrganisationName"),
  );
  const carrierFullAddress = cleanOptionalString(
    formData.get("carrierFullAddress"),
  );
  const carrierPostcode = cleanOptionalString(formData.get("carrierPostcode"));
  const carrierEmailAddress = cleanOptionalString(
    formData.get("carrierEmailAddress"),
  );
  const carrierPhoneNumber = cleanOptionalString(
    formData.get("carrierPhoneNumber"),
  );
  const carrierVehicleRegistration = cleanOptionalString(
    formData.get("carrierVehicleRegistration"),
  );

  const carrierMeansOfTransport =
    (cleanOptionalString(formData.get("carrierMeansOfTransport")) as
      | "Road"
      | "Rail"
      | "Air"
      | "Sea"
      | "Inland Waterway"
      | "Piped"
      | "Other"
      | null) ?? "Road";

  const receiverSiteName = cleanOptionalString(
    formData.get("receiverSiteName"),
  );
  const receiverEmailAddress = cleanOptionalString(
    formData.get("receiverEmailAddress"),
  );
  const receiverPhoneNumber = cleanOptionalString(
    formData.get("receiverPhoneNumber"),
  );
  const receiverAuthorisationNumber = cleanOptionalString(
    formData.get("receiverAuthorisationNumber"),
  );
  const receiptFullAddress = cleanOptionalString(
    formData.get("receiptFullAddress"),
  );
  const receiptPostcode = cleanOptionalString(formData.get("receiptPostcode"));

  const physicalForm = cleanOptionalString(formData.get("physicalForm")) as
    | "Gas"
    | "Liquid"
    | "Solid"
    | "Powder"
    | "Sludge"
    | "Mixed"
    | null;

  const numberOfContainers = cleanInteger(formData.get("numberOfContainers"));

  const typeOfContainers = cleanOptionalString(
    formData.get("typeOfContainers"),
  );

  const weightMetric =
    (cleanOptionalString(formData.get("weightMetric")) as
      | "Grams"
      | "Kilograms"
      | "Tonnes"
      | null) ?? "Tonnes";

  const weightAmount =
    cleanDecimalString(formData.get("weightAmount")) ?? externalEstimatedWeight;

  const weightIsEstimate =
    cleanString(formData.get("weightIsEstimate")).toLowerCase() !== "actual";

  const containsPops = isYes(formData.get("containsPops"));
  const containsHazardous = isYes(formData.get("containsHazardous"));

  const disposalOrRecoveryCode = cleanOptionalString(
    formData.get("disposalOrRecoveryCode"),
  );

  if (!externalCustomerName) {
    redirectWithError("customer_required");
  }

  if (!externalPickupAddress) {
    redirectWithError("pickup_required");
  }

  if (!externalWasteDescription) {
    redirectWithError("waste_required");
  }

  const selectedSite = await getSiteForOrganisation({
    organisationId: context.organisationId,
    siteId,
    fallbackToDefault: true,
  });

  if (!selectedSite) {
    redirectWithError("site_required");
  }

  const resolvedReceiverSiteName =
    receiverSiteName ?? selectedSite.name ?? "Receiving site";

  const resolvedReceiptFullAddress =
    receiptFullAddress ?? selectedSite.fullAddress ?? null;

  const resolvedReceiptPostcode =
    receiptPostcode ?? selectedSite.postcode ?? null;

  const resolvedReceiverAuthorisationNumber =
    receiverAuthorisationNumber ?? selectedSite.permitNumber ?? null;

  const listingName = externalCustomerName;
  const listingLocation =
    [externalPickupAddress, externalPickupPostcode].filter(Boolean).join(", ") ||
    externalPickupAddress;

  const listingEndDate = getDefaultCollectionEndDate(externalCollectionDate);

  const canCreateDraftWasteItem = Boolean(
    normalisedEwcCode &&
      externalWasteDescription &&
      physicalForm &&
      typeOfContainers &&
      typeof numberOfContainers === "number" &&
      weightAmount,
  );

  const createdAssignmentId = await database.transaction(async (tx) => {
    const now = new Date();

    const [backingListing] = await tx
      .insert(wasteListings)
      .values({
        userId: context.userId,
        organisationId: context.organisationId,

        siteId: selectedSite.id,

        participationMode: "internal",
        marketMode: "direct_award",
        listingType: "waste_collection",
        visibility: "private",

        assignmentMethod: "direct",
        assignedCarrierOrganisationId: context.organisationId,
        assignedByOrganisationId: context.organisationId,
        assignedAt: now,

        templateId: "external-manual-job",
        templateVersion: 1,

        name: listingName,
        location: listingLocation,

        startingPrice: 0,
        currentBid: 0,

        fileKey: `external-manual-job-${crypto.randomUUID()}`,
        endDate: listingEndDate,

        archived: false,
        status: "assigned",
        createdAt: now,
      })
      .returning({
        id: wasteListings.id,
      });

    if (!backingListing?.id) {
      throw new Error("BACKING_LISTING_CREATE_FAILED");
    }

    const [assignment] = await tx
      .insert(carrierAssignments)
      .values({
        organisationId: context.organisationId,
        listingId: backingListing.id,

        siteId: selectedSite.id,

        carrierOrganisationId: context.organisationId,
        assignedByOrganisationId: context.organisationId,
        managerOrganisationId: context.organisationId,

        assignmentMethod: "direct",
        bidId: null,

        jobSource: "external_manual",

        externalCustomerName,
        externalCustomerEmail,
        externalCustomerPhone,
        externalReference,

        externalPickupAddress,
        externalPickupPostcode,

        externalDestinationName,
        externalDestinationAddress,
        externalDestinationPostcode,

        externalWasteDescription,
        externalEwcCode,
        externalEstimatedWeight,

        externalCollectionDate,
        externalNotes,

        status: "accepted",
        assignedAt: now,
        respondedAt: now,
        managerAcceptedAt: now,
      })
      .returning({
        id: carrierAssignments.id,
      });

    if (!assignment?.id) {
      throw new Error("EXTERNAL_JOB_CREATE_FAILED");
    }

    const [receipt] = await tx
      .insert(wasteReceipts)
      .values({
        organisationId: context.organisationId,
        assignmentId: assignment.id,
        listingId: backingListing.id,
        siteId: selectedSite.id,

        receivedByUserId: context.userId,

        carrierOrganisationId: context.organisationId,
        receiverOrganisationId: context.organisationId,

        receivedAt: dateTimeReceived,
        status: "draft",

        hazardousWasteConsignmentCode,
        reasonForNoConsignmentCode,
        yourUniqueReference,

        otherReferencesForMovement: jsonString([
          {
            label: "Waste X external job",
            reference: assignment.id,
          },
          ...(externalReference
            ? [
                {
                  label: "Customer reference",
                  reference: externalReference,
                },
              ]
            : []),
        ]),

        specialHandlingRequirements,

        carrierRegistrationNumber,
        carrierReasonForNoRegistrationNumber,
        carrierOrganisationName: carrierOrganisationName ?? externalCustomerName,
        carrierFullAddress,
        carrierPostcode,
        carrierEmailAddress,
        carrierPhoneNumber,
        carrierVehicleRegistration,
        carrierMeansOfTransport,

        receiverSiteName: resolvedReceiverSiteName,
        receiverEmailAddress,
        receiverPhoneNumber,
        receiverAuthorisationNumber: resolvedReceiverAuthorisationNumber,

        receiverRegulatoryPositionStatements: jsonString([]),

        receiptFullAddress: resolvedReceiptFullAddress,
        receiptPostcode: resolvedReceiptPostcode,

        createdAt: now,
        updatedAt: now,
      })
      .returning({
        id: wasteReceipts.id,
      });

    if (!receipt?.id) {
      throw new Error("WASTE_RECEIPT_DRAFT_CREATE_FAILED");
    }

    if (
      canCreateDraftWasteItem &&
      normalisedEwcCode &&
      physicalForm &&
      weightAmount
    ) {
      await tx.insert(wasteReceiptItems).values({
        organisationId: context.organisationId,
        receiptId: receipt.id,

        ewcCodes: jsonString([normalisedEwcCode]),
        wasteDescription: externalWasteDescription,
        physicalForm,

        numberOfContainers: numberOfContainers ?? 0,
        typeOfContainers: typeOfContainers ?? "Not confirmed",

        weightMetric,
        weightAmount,
        weightIsEstimate,

        containsPops,
        popsSourceOfComponents: containsPops ? "NOT_PROVIDED" : null,
        popsComponents: containsPops ? jsonString([]) : null,

        containsHazardous,
        hazardousSourceOfComponents: containsHazardous
          ? "NOT_PROVIDED"
          : null,
        hazardousHazCodes: containsHazardous ? jsonString([]) : null,
        hazardousComponents: containsHazardous ? jsonString([]) : null,

        disposalOrRecoveryCodes: disposalOrRecoveryCode
          ? jsonString([
              {
                code: disposalOrRecoveryCode,
                weight: {
                  metric: weightMetric,
                  amount: Number(weightAmount),
                  isEstimate: weightIsEstimate,
                },
              },
            ])
          : null,

        createdAt: now,
        updatedAt: now,
      });
    }

    return assignment.id;
  });

  revalidatePath("/home/operations/jobs");
  revalidatePath("/home/operations/jobs/new");
  revalidatePath("/home/operations/assignments");
  revalidatePath("/home/operations/incidents");
  revalidatePath("/home/receiving/intake");
  revalidatePath("/home/receiving/submissions");

  redirect(`/home/operations/jobs/${createdAssignmentId}?success=created`);
}

/* =========================================================
   COMPLETE EXTERNAL JOB
========================================================= */

export async function completeExternalCarrierJobAction(formData: FormData) {
  const context = await requireExternalJobsAccess();

  const assignmentId = cleanString(formData.get("assignmentId"));

  if (!assignmentId) {
    redirectJobsWithError("missing_assignment");
  }

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
  });

  if (!assignment) {
    redirectJobsWithError("assignment_not_found");
  }

  const userCanAccess =
    assignment.jobSource === "external_manual" &&
    (assignment.organisationId === context.organisationId ||
      assignment.assignedByOrganisationId === context.organisationId ||
      assignment.managerOrganisationId === context.organisationId ||
      assignment.carrierOrganisationId === context.organisationId);

  if (!userCanAccess) {
    redirectJobsWithError("assignment_not_found");
  }

  if (
    assignment.status === "completed" ||
    assignment.status === "cancelled" ||
    assignment.status === "rejected"
  ) {
    redirect(`/home/operations/jobs/${assignment.id}`);
  }

  /*
    Critical guard:
    External jobs use the same incident system as normal assignments.
    A job cannot be completed while any linked incident is open/under review.
    This prevents bypassing the UI by manually posting the server action.
  */
  const [openIncident] = await database
    .select({
      id: incidents.id,
    })
    .from(incidents)
    .where(
      and(
        eq(incidents.assignmentId, assignment.id),
        inArray(incidents.status, ["open", "under_review"]),
      ),
    )
    .limit(1);

  if (openIncident) {
    redirectJobWithError(assignment.id, "unresolved_incident");
  }

  await database.transaction(async (tx) => {
    const now = new Date();

    await tx
      .update(carrierAssignments)
      .set({
        status: "completed",
        collectedAt: assignment.collectedAt ?? now,
        completedAt: assignment.completedAt ?? now,
      })
      .where(eq(carrierAssignments.id, assignment.id));

    await tx
      .update(wasteListings)
      .set({
        status: "completed",
      })
      .where(eq(wasteListings.id, assignment.listingId));

    const existingReceipt = await tx.query.wasteReceipts.findFirst({
      where: and(
        eq(wasteReceipts.assignmentId, assignment.id),
        eq(wasteReceipts.organisationId, context.organisationId),
      ),
    });

    if (existingReceipt) {
      await tx
        .update(wasteReceipts)
        .set({
          status: "confirmed",
          receivedAt: existingReceipt.receivedAt ?? now,
          updatedAt: now,
        })
        .where(
          and(
            eq(wasteReceipts.id, existingReceipt.id),
            eq(wasteReceipts.organisationId, context.organisationId),
          ),
        );
    } else {
      await tx.insert(wasteReceipts).values({
        organisationId: context.organisationId,
        assignmentId: assignment.id,
        listingId: assignment.listingId,
        siteId: assignment.siteId,

        receivedByUserId: context.userId,

        carrierOrganisationId: assignment.carrierOrganisationId,
        receiverOrganisationId:
          assignment.managerOrganisationId ?? context.organisationId,

        receivedAt: now,
        status: "confirmed",

        carrierOrganisationName: assignment.externalCustomerName,
        receiverSiteName: assignment.externalDestinationName,
        receiptFullAddress: assignment.externalDestinationAddress,
        receiptPostcode: assignment.externalDestinationPostcode,

        createdAt: now,
        updatedAt: now,
      });
    }
  });

  revalidatePath("/home/operations/jobs");
  revalidatePath(`/home/operations/jobs/${assignment.id}`);
  revalidatePath("/home/operations/assignments");
  revalidatePath(`/home/operations/assignments/${assignment.id}`);
  revalidatePath("/home/operations/incidents");
  revalidatePath("/home/receiving/intake");
  revalidatePath(`/home/receiving/intake/${assignment.id}`);
  revalidatePath("/home/receiving/submissions");

  redirect(`/home/operations/jobs/${assignment.id}?success=completed`);
}