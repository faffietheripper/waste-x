// src/app/home/operations/jobs/actions.ts

"use server";

import crypto from "crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  users,
  wasteListings,
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

function redirectWithError(error: string): never {
  redirect(`/home/operations/jobs/new?error=${encodeURIComponent(error)}`);
}

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
      (currentUser.organisation.capabilities as OrganisationCapability[] | null) ??
      [],
  };

  if (!shouldShowExternalJobs(organisationContext)) {
    redirect("/home");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
  };
}

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

function parseOptionalDate(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);

  if (!cleaned) return null;

  const date = new Date(`${cleaned}T12:00:00`);

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
  const externalEwcCode = cleanOptionalString(
    formData.get("externalEwcCode"),
  );
  const externalEstimatedWeight = cleanDecimalString(
    formData.get("externalEstimatedWeight"),
  );
  const externalCollectionDate = parseOptionalDate(
    formData.get("externalCollectionDate"),
  );
  const externalNotes = cleanOptionalString(formData.get("externalNotes"));

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

  const listingName = externalCustomerName;
  const listingLocation =
    [externalPickupAddress, externalPickupPostcode].filter(Boolean).join(", ") ||
    externalPickupAddress;

  const listingEndDate = externalCollectionDate
    ? addDays(externalCollectionDate, 30)
    : addDays(new Date(), 30);

  const createdAssignmentId = await database.transaction(async (tx) => {
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
        assignedAt: new Date(),

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
        createdAt: new Date(),
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
        managerOrganisationId: null,

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
        assignedAt: new Date(),
        respondedAt: new Date(),
        managerAcceptedAt: new Date(),
      })
      .returning({
        id: carrierAssignments.id,
      });

    if (!assignment?.id) {
      throw new Error("EXTERNAL_JOB_CREATE_FAILED");
    }

    return assignment.id;
  });

  revalidatePath("/home/operations/jobs");
  revalidatePath("/home/operations/jobs/new");

  redirect(`/home/operations/jobs/${createdAssignmentId}?success=created`);
}