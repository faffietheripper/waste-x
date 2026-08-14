// src/app/home/receiving/intake/[assignmentId]/page.tsx

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  carrierAssignments,
  users,
  wasteListings,
  wasteReceiptItems,
  wasteReceipts,
  wasteTrackingOrganisationSettings,
} from "@/db/schema";

import {
  type Capability,
  type DepartmentType,
  hasOperationalPermissionForOrganisation,
} from "@/modules/auth/core/permissions";

import { getLatestWasteTrackingSubmissionByAssignment } from "@/modules/digital-waste-tracking/data-access/getWasteTrackingSubmissionByAssignment";

import {
  getDwtListingProfileReadiness,
  hasAnyDwtListingProfileValue,
  safeParseDwtListingProfile,
  type DwtListingProfile,
} from "@/modules/digital-waste-tracking/core/dwtListingProfile";

import ReceiveMovementForm from "./ReceiveMovementForm";

import {
  createDefaultWasteItem,
  createDisposalRecoveryCode,
  createHazardousComponent,
  createPopsComponent,
  type WasteItemFormState,
} from "./receiveMovementFormTypes";

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: Date | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(value);
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function isOrganisationInvolved(params: {
  organisationId: string;
  assignment: typeof carrierAssignments.$inferSelect;
}) {
  return (
    params.assignment.organisationId === params.organisationId ||
    params.assignment.assignedByOrganisationId === params.organisationId ||
    params.assignment.managerOrganisationId === params.organisationId ||
    params.assignment.carrierOrganisationId === params.organisationId
  );
}

function isAssignmentOperationallyComplete(params: {
  status: string;
  completedAt: Date | null;
  listingStatus?: string | null;
}) {
  return (
    params.status === "completed" ||
    Boolean(params.completedAt) ||
    params.listingStatus === "completed"
  );
}

function isReceiptConfirmed(
  receipt:
    | {
        status: string;
      }
    | null
    | undefined,
) {
  return receipt?.status === "confirmed" || receipt?.status === "submitted";
}

function getBlockReason(params: {
  assignmentComplete: boolean;
}) {
  if (!params.assignmentComplete) {
    return {
      title: "DWT intake is not available yet",
      message:
        "This assignment has not been fully completed operationally. The DWT receive movement page is locked until the job is complete.",
      detail:
        "Collection alone is not enough. The assignment or linked listing must be completed before it can move into Digital Waste Tracking submission.",
    };
  }

  return {
    title: "DWT intake is locked",
    message:
      "This assignment is not currently eligible for DWT receive movement submission.",
    detail:
      "Check the assignment status, listing status, incidents and organisation DWT settings.",
  };
}

type StoredDisposalOrRecoveryCode = {
  code?: string | null;
  weight?: {
    metric?: "Grams" | "Kilograms" | "Tonnes" | null;
    amount?: string | number | null;
    isEstimate?: boolean | null;
  } | null;
};

type StoredPopsComponent = {
  code?: string | null;
  concentration?: string | number | null;
};

type StoredHazardousComponent = {
  name?: string | null;
  concentration?: string | number | null;
};

function parseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);

    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function parseCodeList(value: string | null | undefined) {
  const parsed = parseJsonArray<string>(value);

  if (parsed.length > 0) {
    return parsed.join(", ");
  }

  return (value ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .join(", ");
}

function stringifyNumber(value: string | number | null | undefined) {
  if (value === null || value === undefined) return "";

  return String(value);
}

function buildAddress(parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(", ");
}

function formatRpsNumbers(value: string | null | undefined) {
  return parseJsonArray<number>(value).join(", ");
}

function firstNonEmptyString(
  ...values: Array<string | null | undefined>
): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return "";
}

function receiptItemHasMeaningfulDwtData(
  item: typeof wasteReceiptItems.$inferSelect,
) {
  return Boolean(
    parseCodeList(item.ewcCodes) ||
      item.wasteDescription?.trim() ||
      item.typeOfContainers?.trim() ||
      stringifyNumber(item.weightAmount).trim() ||
      parseCodeList(item.hazardousHazCodes) ||
      item.disposalOrRecoveryCodes?.trim() ||
      item.popsComponents?.trim() ||
      item.hazardousComponents?.trim(),
  );
}

function normalisePhysicalFormForForm(
  value: DwtListingProfile["physicalForm"],
): WasteItemFormState["physicalForm"] {
  const allowed: WasteItemFormState["physicalForm"][] = [
    "Gas",
    "Liquid",
    "Solid",
    "Powder",
    "Sludge",
    "Mixed",
  ];

  if (allowed.includes(value as WasteItemFormState["physicalForm"])) {
    return value as WasteItemFormState["physicalForm"];
  }

  return "Solid";
}

function normaliseSourceOfComponentsForForm(
  value: string | null | undefined,
): WasteItemFormState["popsSourceOfComponents"] {
  const allowed: WasteItemFormState["popsSourceOfComponents"][] = [
    "NOT_PROVIDED",
    "GUIDANCE",
    "OWN_TESTING",
  ];

  if (allowed.includes(value as WasteItemFormState["popsSourceOfComponents"])) {
    return value as WasteItemFormState["popsSourceOfComponents"];
  }

  return "NOT_PROVIDED";
}

function mapReceiptItemToFormState(
  item: typeof wasteReceiptItems.$inferSelect,
): WasteItemFormState {
  const disposalOrRecoveryCodes =
    parseJsonArray<StoredDisposalOrRecoveryCode>(
      item.disposalOrRecoveryCodes,
    );

  const popsComponents = parseJsonArray<StoredPopsComponent>(
    item.popsComponents,
  );

  const hazardousComponents = parseJsonArray<StoredHazardousComponent>(
    item.hazardousComponents,
  );

  return createDefaultWasteItem(item.wasteDescription, {
    ewcCodes: parseCodeList(item.ewcCodes),
    wasteDescription: item.wasteDescription,
    physicalForm: item.physicalForm,
    numberOfContainers: stringifyNumber(item.numberOfContainers),
    typeOfContainers: item.typeOfContainers,
    weightMetric: item.weightMetric,
    weightAmount: stringifyNumber(item.weightAmount),
    weightIsEstimate: item.weightIsEstimate,

    containsPops: item.containsPops,
    popsSourceOfComponents: item.popsSourceOfComponents ?? "NOT_PROVIDED",
    popsComponents: popsComponents.map((component) =>
      createPopsComponent({
        code: component.code ?? "",
        concentration: stringifyNumber(component.concentration),
      }),
    ),

    containsHazardous: item.containsHazardous,
    hazardousSourceOfComponents:
      item.hazardousSourceOfComponents ?? "NOT_PROVIDED",
    hazCodes: parseCodeList(item.hazardousHazCodes),
    hazardousComponents: hazardousComponents.map((component) =>
      createHazardousComponent({
        name: component.name ?? "",
        concentration: stringifyNumber(component.concentration),
      }),
    ),

    disposalOrRecoveryCodes:
      disposalOrRecoveryCodes.length > 0
        ? disposalOrRecoveryCodes.map((row) =>
            createDisposalRecoveryCode({
              code: row.code ?? "",
              weightAmount: stringifyNumber(row.weight?.amount),
              weightMetric: row.weight?.metric ?? item.weightMetric,
              weightIsEstimate:
                row.weight?.isEstimate ?? item.weightIsEstimate,
            }),
          )
        : [createDisposalRecoveryCode()],
  });
}

function mapListingDwtSnapshotToFormState({
  profile,
  listingName,
}: {
  profile: DwtListingProfile;
  listingName: string;
}): WasteItemFormState {
  const popsComponents = parseJsonArray<StoredPopsComponent>(
    profile.popsComponentsJson,
  );

  const hazardousComponents = parseJsonArray<StoredHazardousComponent>(
    profile.hazardousComponentsJson,
  );

  return createDefaultWasteItem(profile.wasteDescription || listingName, {
    ewcCodes: profile.ewcCodes,
    wasteDescription: profile.wasteDescription || listingName,

    physicalForm: normalisePhysicalFormForForm(profile.physicalForm),

    numberOfContainers: profile.numberOfContainers,
    typeOfContainers: profile.typeOfContainers,

    weightMetric: profile.weightMetric,
    weightAmount: profile.weightAmount,
    weightIsEstimate: profile.weightIsEstimate,

    containsPops: profile.containsPops === "yes",
    popsSourceOfComponents: normaliseSourceOfComponentsForForm(
      profile.popsSourceOfComponents,
    ),
    popsComponents: popsComponents.map((component) =>
      createPopsComponent({
        code: component.code ?? "",
        concentration: stringifyNumber(component.concentration),
      }),
    ),

    containsHazardous: profile.containsHazardous === "yes",
    hazardousSourceOfComponents: normaliseSourceOfComponentsForForm(
      profile.hazardousSourceOfComponents,
    ),
    hazCodes: profile.hazardousHazCodes,
    hazardousComponents: hazardousComponents.map((component) =>
      createHazardousComponent({
        name: component.name ?? "",
        concentration: stringifyNumber(component.concentration),
      }),
    ),

    disposalOrRecoveryCodes: profile.disposalOrRecoveryCode
      ? [
          createDisposalRecoveryCode({
            code: profile.disposalOrRecoveryCode,
            weightAmount: profile.weightAmount,
            weightMetric: profile.weightMetric,
            weightIsEstimate: profile.weightIsEstimate,
          }),
        ]
      : [createDisposalRecoveryCode()],
  });
}

/* =========================================================
   PAGE
========================================================= */

export default async function ReceivingIntakeDetailPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = await params;

  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  if (!currentUser?.organisationId || !currentUser.organisation) {
    redirect("/home/settings/organisation?reason=no-organisation");
  }

  const currentOrganisation = currentUser.organisation;
  const isSoloOrganisation = currentOrganisation.operatingMode === "solo";

  if (!currentUser.department && !isSoloOrganisation) {
    redirect("/home/settings/departments?reason=no-active-department");
  }

  const capabilities =
    (currentOrganisation.capabilities as Capability[] | null) ?? [];

  const departmentType =
    (currentUser.department?.type as DepartmentType | undefined) ?? null;

  const canViewReceiving = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "receiving:view",
    operatingMode: currentOrganisation.operatingMode,
  });

  const canSubmitDwt = hasOperationalPermissionForOrganisation({
    capabilities,
    departmentType,
    permission: "dwt:submit_receive_movement",
    operatingMode: currentOrganisation.operatingMode,
  });

  if (!canViewReceiving) {
    redirect("/home/receiving/intake");
  }

  const assignment = await database.query.carrierAssignments.findFirst({
    where: eq(carrierAssignments.id, assignmentId),
    with: {
      listing: true,
      organisation: true,
      carrierOrganisation: true,
      managerOrganisation: true,
      assignedByOrganisation: true,
      incidents: true,
    },
  });

  if (!assignment) {
    notFound();
  }

  if (
    !isOrganisationInvolved({
      organisationId: currentUser.organisationId,
      assignment,
    })
  ) {
    notFound();
  }

  const assignmentComplete = isAssignmentOperationallyComplete({
    status: assignment.status,
    completedAt: assignment.completedAt,
    listingStatus: assignment.listing?.status ?? null,
  });

  /*
    Important:
    Do not only trust assignment.listing.dwtSnapshotJson.
    Depending on the Drizzle relation/query shape, the listing relation may not
    expose newly added columns. This direct fallback guarantees the DWT snapshot
    is loaded from bb_waste_listing.
  */
  const [listingDwtSnapshotRecord] = await database
    .select({
      dwtSnapshotJson: wasteListings.dwtSnapshotJson,
    })
    .from(wasteListings)
    .where(eq(wasteListings.id, assignment.listingId))
    .limit(1);

  const listingDwtSnapshotJson =
    firstNonEmptyString(
      (assignment.listing as { dwtSnapshotJson?: string | null } | null)
        ?.dwtSnapshotJson,
      listingDwtSnapshotRecord?.dwtSnapshotJson,
    ) || null;

  const listingDwtProfile = safeParseDwtListingProfile(listingDwtSnapshotJson);
  const hasListingDwtSnapshot = hasAnyDwtListingProfileValue(listingDwtProfile);
  const listingDwtReadiness =
    getDwtListingProfileReadiness(listingDwtProfile);

  const latestReceipt = await database.query.wasteReceipts.findFirst({
    where: and(
      eq(wasteReceipts.assignmentId, assignment.id),
      eq(wasteReceipts.organisationId, currentUser.organisationId),
    ),
    orderBy: [desc(wasteReceipts.updatedAt)],
  });

  const latestReceiptItems = latestReceipt
    ? await database.query.wasteReceiptItems.findMany({
        where: and(
          eq(wasteReceiptItems.receiptId, latestReceipt.id),
          eq(wasteReceiptItems.organisationId, currentUser.organisationId),
        ),
      })
    : [];

  /*
    Important:
    Receipt items should win only when they actually contain useful DWT data.
    A blank draft item should not override a 9/9 listing/template DWT snapshot.
  */
  const meaningfulReceiptItems = latestReceiptItems.filter(
    receiptItemHasMeaningfulDwtData,
  );

  const defaultWasteItems =
    meaningfulReceiptItems.length > 0
      ? meaningfulReceiptItems.map(mapReceiptItemToFormState)
      : hasListingDwtSnapshot
        ? [
            mapListingDwtSnapshotToFormState({
              profile: listingDwtProfile,
              listingName: assignment.listing?.name ?? "Waste movement",
            }),
          ]
        : [];

  const defaultWasteItemSource =
    meaningfulReceiptItems.length > 0
      ? "receipt_draft"
      : hasListingDwtSnapshot
        ? "listing_snapshot"
        : "blank";

  const receiptConfirmed = isReceiptConfirmed(latestReceipt);

  const unresolvedIncidents = assignment.incidents.filter((incident) =>
    ["open", "under_review"].includes(incident.status),
  );

  const organisationSettings =
    await database.query.wasteTrackingOrganisationSettings.findFirst({
      where: eq(
        wasteTrackingOrganisationSettings.organisationId,
        currentUser.organisationId,
      ),
    });

  const latestSubmission =
    await getLatestWasteTrackingSubmissionByAssignment({
      organisationId: currentUser.organisationId,
      assignmentId: assignment.id,
    });

  if (!assignmentComplete) {
    const blockReason = getBlockReason({
      assignmentComplete,
    });

    return (
      <BlockedDwtIntakePage
        title={blockReason.title}
        message={blockReason.message}
        detail={blockReason.detail}
        assignmentId={assignment.id}
        assignmentName={assignment.listing?.name ?? "Assignment intake"}
        assignmentStatus={assignment.status}
        listingStatus={assignment.listing?.status ?? null}
        collectedAt={assignment.collectedAt}
        completedAt={assignment.completedAt}
        receiptStatus={latestReceipt?.status ?? null}
        receivedAt={latestReceipt?.receivedAt ?? null}
      />
    );
  }

  const dwtEnabled = Boolean(organisationSettings?.isEnabled);

  const canSubmit =
    canSubmitDwt &&
    assignmentComplete &&
    unresolvedIncidents.length === 0 &&
    dwtEnabled;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
              Receiving Intake
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              {assignment.listing?.name ?? "Assignment intake"}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              This assignment is complete operationally. Waste X loads receipt
              draft data first when it contains real DWT values. Otherwise it
              falls back to the listing/template DWT snapshot.
            </p>
          </div>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            ← Intake queue
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-800">
        <p className="text-sm font-semibold">
          Ready for Digital Waste Tracking review
        </p>

        <p className="mt-2 text-sm leading-6">
          Waste X has checked for draft receipt items and the listing DWT
          snapshot. The form below should be prefilled from the best available
          source.
        </p>

        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <StatusBox
            label="Form source"
            value={
              defaultWasteItemSource === "receipt_draft"
                ? "Receipt draft"
                : defaultWasteItemSource === "listing_snapshot"
                  ? "Listing DWT snapshot"
                  : "Blank intake form"
            }
          />

          <StatusBox
            label="Draft receipt"
            value={latestReceipt?.id ?? "No receipt draft yet"}
          />

          <StatusBox
            label="Receipt items"
            value={`${latestReceiptItems.length} total / ${meaningfulReceiptItems.length} usable`}
          />

          <StatusBox
            label="Waste items loaded"
            value={String(defaultWasteItems.length)}
          />
        </div>
      </section>

      {hasListingDwtSnapshot && (
        <ListingDwtSnapshotPanel
          readiness={listingDwtReadiness}
          source={defaultWasteItemSource}
        />
      )}

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Assignment
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Operational context
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Assignment:</span>{" "}
              {assignment.id}
            </p>

            <p>
              <span className="font-medium text-black/70">Listing:</span> #
              {assignment.listingId}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Assignment status:
              </span>{" "}
              {formatStatus(assignment.status)}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Listing status:
              </span>{" "}
              {formatStatus(assignment.listing?.status)}
            </p>

            <p>
              <span className="font-medium text-black/70">Collected:</span>{" "}
              {formatDate(assignment.collectedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Completed:</span>{" "}
              {formatDate(assignment.completedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Receipt
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Draft / confirmation
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Receipt status:</span>{" "}
              {latestReceipt
                ? formatStatus(latestReceipt.status)
                : "Operational completion confirmed"}
            </p>

            <p>
              <span className="font-medium text-black/70">Received at:</span>{" "}
              {formatDate(latestReceipt?.receivedAt ?? assignment.completedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Receipt ID:</span>{" "}
              {latestReceipt?.id ?? "No separate receipt record"}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Receipt waste items:
              </span>{" "}
              {latestReceiptItems.length}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Usable receipt items:
              </span>{" "}
              {meaningfulReceiptItems.length}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Form waste items:
              </span>{" "}
              {defaultWasteItems.length}
            </p>

            <p>
              <span className="font-medium text-black/70">Receiver org:</span>{" "}
              {assignment.managerOrganisation?.teamName ??
                currentOrganisation.teamName ??
                "Not recorded"}
            </p>

            {receiptConfirmed && (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-emerald-700">
                A confirmed receipt record exists for this assignment.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Digital Waste Tracking
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Submission status
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Enabled:</span>{" "}
              {organisationSettings?.isEnabled ? "Yes" : "No"}
            </p>

            <p>
              <span className="font-medium text-black/70">Environment:</span>{" "}
              {organisationSettings?.environment ?? "test"}
            </p>

            <p>
              <span className="font-medium text-black/70">Latest status:</span>{" "}
              {latestSubmission
                ? formatStatus(latestSubmission.status)
                : "No submission yet"}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Waste tracking ID:
              </span>{" "}
              {latestSubmission?.wasteTrackingId ?? "Not issued yet"}
            </p>
          </div>
        </div>
      </section>

      {unresolvedIncidents.length > 0 && (
        <section className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm font-semibold text-red-800">
            Submission blocked by unresolved incident
          </p>

          <p className="mt-2 text-sm leading-6 text-red-700/80">
            Resolve all open or under-review incidents before submitting this
            receive movement.
          </p>

          <Link
            href="/home/operations/incidents"
            className="mt-4 inline-flex rounded-full bg-red-700 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-600"
          >
            Open incidents →
          </Link>
        </section>
      )}

      {!dwtEnabled && (
        <section className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-6">
          <p className="text-sm font-semibold text-orange-800">
            Digital Waste Tracking is disabled
          </p>

          <p className="mt-2 text-sm leading-6 text-orange-700/80">
            Enable Digital Waste Tracking in organisation settings and save the
            Receiver API Code before submitting.
          </p>

          <Link
            href="/home/settings/digital-waste-tracking"
            className="mt-4 inline-flex rounded-full bg-orange-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500"
          >
            Open DWT settings →
          </Link>
        </section>
      )}

      {!canSubmitDwt && (
        <section className="mt-8 rounded-3xl border border-black/10 bg-white p-6">
          <p className="text-sm font-semibold text-black">
            View-only Digital Waste Tracking access
          </p>

          <p className="mt-2 text-sm leading-6 text-black/55">
            Your current workspace can view this receiving intake, but cannot
            submit the receive movement.
          </p>
        </section>
      )}

      <section className="mt-8">
        <ReceiveMovementForm
          assignmentId={assignment.id}
          listingId={assignment.listingId}
          listingName={assignment.listing?.name ?? "Waste movement"}
          listingLocation={assignment.listing?.location ?? ""}
          canSubmit={canSubmit}
          existingWasteTrackingId={latestSubmission?.wasteTrackingId ?? null}
          defaultReceiverApiCode={organisationSettings?.apiCode ?? ""}
          receiptId={latestReceipt?.id ?? null}
          defaultMovement={{
            dateTimeReceived:
              latestReceipt?.receivedAt?.toISOString() ??
              assignment.completedAt?.toISOString() ??
              null,
            hazardousWasteConsignmentCode:
              latestReceipt?.hazardousWasteConsignmentCode ?? "",
            reasonForNoConsignmentCode:
              latestReceipt?.reasonForNoConsignmentCode ?? "",
            yourUniqueReference:
              latestReceipt?.yourUniqueReference ??
              `WX-${assignment.id.slice(0, 8)}`,
            specialHandlingRequirements: firstNonEmptyString(
              latestReceipt?.specialHandlingRequirements,
              listingDwtProfile.specialHandlingRequirements,
            ),
          }}
          defaultWasteItems={defaultWasteItems}
          defaultCarrier={{
            organisationName:
              latestReceipt?.carrierOrganisationName ??
              assignment.carrierOrganisation?.teamName ??
              "Unknown carrier",
            fullAddress:
              latestReceipt?.carrierFullAddress ??
              buildAddress([
                assignment.carrierOrganisation?.streetAddress,
                assignment.carrierOrganisation?.city,
                assignment.carrierOrganisation?.region,
                assignment.carrierOrganisation?.country,
              ]),
            postcode:
              latestReceipt?.carrierPostcode ??
              assignment.carrierOrganisation?.postCode ??
              "",
            emailAddress:
              latestReceipt?.carrierEmailAddress ??
              assignment.carrierOrganisation?.emailAddress ??
              "",
            phoneNumber:
              latestReceipt?.carrierPhoneNumber ??
              assignment.carrierOrganisation?.telephone ??
              "",
            registrationNumber: latestReceipt?.carrierRegistrationNumber ?? "",
            reasonForNoRegistrationNumber:
              latestReceipt?.carrierReasonForNoRegistrationNumber ?? "",
            meansOfTransport: latestReceipt?.carrierMeansOfTransport ?? "Road",
            vehicleRegistration: latestReceipt?.carrierVehicleRegistration ?? "",
          }}
          defaultReceiver={{
            siteName:
              latestReceipt?.receiverSiteName ??
              currentOrganisation.teamName ??
              assignment.managerOrganisation?.teamName ??
              "Receiving site",
            emailAddress:
              latestReceipt?.receiverEmailAddress ??
              currentOrganisation.emailAddress ??
              "",
            phoneNumber:
              latestReceipt?.receiverPhoneNumber ??
              currentOrganisation.telephone ??
              "",
            fullAddress:
              latestReceipt?.receiptFullAddress ??
              buildAddress([
                currentOrganisation.streetAddress,
                currentOrganisation.city,
                currentOrganisation.region,
                currentOrganisation.country,
              ]),
            postcode:
              latestReceipt?.receiptPostcode ??
              currentOrganisation.postCode ??
              "",
            authorisationNumber:
              latestReceipt?.receiverAuthorisationNumber ?? "",
            regulatoryPositionStatements: formatRpsNumbers(
              latestReceipt?.receiverRegulatoryPositionStatements,
            ),
          }}
        />
      </section>
    </main>
  );
}

/* =========================================================
   SMALL UI
========================================================= */

function StatusBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-emerald-200 bg-white/70 p-4 text-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700/70">
        {label}
      </p>

      <p className="mt-2 break-all font-semibold text-emerald-900">{value}</p>
    </div>
  );
}

function ListingDwtSnapshotPanel({
  readiness,
  source,
}: {
  readiness: ReturnType<typeof getDwtListingProfileReadiness>;
  source: "receipt_draft" | "listing_snapshot" | "blank";
}) {
  const isUsed = source === "listing_snapshot";

  return (
    <section
      className={`mt-8 rounded-3xl border p-6 shadow-sm ${
        isUsed
          ? "border-orange-200 bg-orange-50 text-orange-800"
          : "border-black/10 bg-white text-black"
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-600">
        Listing DWT Snapshot
      </p>

      <h2 className="mt-2 text-xl font-semibold text-black">
        {isUsed
          ? "Template/listing prefill has been loaded"
          : "Template/listing prefill is available"}
      </h2>

      <p className="mt-2 max-w-4xl text-sm leading-6 text-black/55">
        {isUsed
          ? "No meaningful receipt waste item was found, so Waste X has used the listing DWT snapshot to prefill the intake form."
          : "A meaningful receipt draft already exists, so Waste X is using the receipt draft first. The listing DWT snapshot remains available as supporting context."}
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/55">
          {readiness.label}
        </span>

        <span className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/55">
          {readiness.completedFields}/{readiness.totalFields} fields
        </span>
      </div>

      {(readiness.missing.length > 0 || readiness.warnings.length > 0) && (
        <div className="mt-5 rounded-2xl border border-black/10 bg-white/70 p-4 text-sm leading-6">
          {readiness.missing.length > 0 && (
            <p className="text-black/55">
              <span className="font-semibold text-black">Still missing:</span>{" "}
              {readiness.missing.join(", ")}
            </p>
          )}

          {readiness.warnings.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-orange-800">
              {readiness.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/* =========================================================
   BLOCKED PAGE
========================================================= */

function BlockedDwtIntakePage({
  title,
  message,
  detail,
  assignmentId,
  assignmentName,
  assignmentStatus,
  listingStatus,
  collectedAt,
  completedAt,
  receiptStatus,
  receivedAt,
}: {
  title: string;
  message: string;
  detail: string;
  assignmentId: string;
  assignmentName: string;
  assignmentStatus: string;
  listingStatus: string | null;
  collectedAt: Date | null;
  completedAt: Date | null;
  receiptStatus: string | null;
  receivedAt: Date | null;
}) {
  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[24vw] pr-10 pt-[17vh] text-black">
      <section className="rounded-[2rem] bg-black p-8 text-white shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
              Receiving Intake Locked
            </p>

            <h1 className="mt-4 text-4xl font-semibold tracking-tight">
              {title}
            </h1>

            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              {message}
            </p>
          </div>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
          >
            ← Intake queue
          </Link>
        </div>
      </section>

      <section className="mt-8 rounded-3xl border border-orange-200 bg-orange-50 p-6 text-orange-800">
        <p className="text-sm font-semibold">Why this page is locked</p>

        <p className="mt-2 max-w-4xl text-sm leading-6">{detail}</p>
      </section>

      <section className="mt-8 grid gap-5 lg:grid-cols-3">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Assignment
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            {assignmentName}
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Assignment:</span>{" "}
              {assignmentId}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Assignment status:
              </span>{" "}
              {formatStatus(assignmentStatus)}
            </p>

            <p>
              <span className="font-medium text-black/70">
                Listing status:
              </span>{" "}
              {formatStatus(listingStatus)}
            </p>

            <p>
              <span className="font-medium text-black/70">Collected:</span>{" "}
              {formatDate(collectedAt)}
            </p>

            <p>
              <span className="font-medium text-black/70">Completed:</span>{" "}
              {formatDate(completedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Receipt
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Receiver confirmation
          </h2>

          <div className="mt-5 space-y-3 text-sm text-black/55">
            <p>
              <span className="font-medium text-black/70">Receipt status:</span>{" "}
              {receiptStatus ? formatStatus(receiptStatus) : "No receipt"}
            </p>

            <p>
              <span className="font-medium text-black/70">Received at:</span>{" "}
              {formatDate(receivedAt)}
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
            Required before DWT
          </p>

          <h2 className="mt-3 text-lg font-semibold text-black">
            Completion rules
          </h2>

          <ul className="mt-5 list-disc space-y-2 pl-5 text-sm leading-6 text-black/55">
            <li>Assignment or linked listing must be completed.</li>
            <li>There must be no unresolved incidents.</li>
            <li>DWT must be enabled for the organisation.</li>
          </ul>
        </div>
      </section>

      <section className="mt-8 flex flex-col gap-3 rounded-3xl border border-black/10 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-black">
            Continue from the operational assignment
          </p>

          <p className="mt-2 text-sm leading-6 text-black/50">
            Complete the operational workflow first, then return to the intake
            queue for DWT submission.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href={`/home/operations/assignments/${assignmentId}`}
            className="inline-flex rounded-full bg-black px-5 py-3 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            View assignment →
          </Link>

          <Link
            href="/home/receiving/intake"
            className="inline-flex rounded-full border border-black/10 bg-[#f7f3ed] px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-600"
          >
            Back to intake queue
          </Link>
        </div>
      </section>
    </main>
  );
}