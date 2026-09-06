"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoadFieldStates } from "@/db/mobile-field-schema";
import { jobLoads, jobs, users } from "@/db/schema";
import { syncJobStatus } from "@/modules/jobs/core/syncJobStatus";

export const SITE_REJECTION_CATEGORIES = [
  "WASTE_MISMATCH",
  "CONTAMINATION",
  "PERMIT_OR_COMPLIANCE",
  "UNSAFE_LOAD",
  "DOCUMENTATION",
  "SITE_CAPACITY",
  "OTHER",
] as const;

type SiteRejectionCategory = (typeof SITE_REJECTION_CATEGORIES)[number];

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isCategory(value: string): value is SiteRejectionCategory {
  return (SITE_REJECTION_CATEGORIES as readonly string[]).includes(value);
}

function redirectWorksheet(
  returnDate: string,
  key: "success" | "error",
  code: string,
): never {
  const params = new URLSearchParams();
  if (validDate(returnDate)) params.set("date", returnDate);
  if (key === "success") params.set("view", "rejected");
  params.set(key, code);
  redirect(`/home/worksheet?${params.toString()}`);
}

async function requireSiteOperator(returnDate: string) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!user?.organisationId || !user.isActive || user.isSuspended) {
    redirectWorksheet(returnDate, "error", "unauthorised");
  }

  if (
    user.role !== "administrator" &&
    user.role !== "operations" &&
    user.role !== "seniorManagement" &&
    user.role !== "employee"
  ) {
    redirectWorksheet(returnDate, "error", "unauthorised");
  }

  return { userId: user.id, organisationId: user.organisationId };
}

async function ownTransportDriverHasArrived(
  organisationId: string,
  loadId: string,
  driverId: string | null,
  haulierCounterpartyId: string | null,
) {
  if (!driverId || haulierCounterpartyId) return true;
  const fieldState = await database.query.jobLoadFieldStates.findFirst({
    where: and(
      eq(jobLoadFieldStates.jobLoadId, loadId),
      eq(jobLoadFieldStates.organisationId, organisationId),
    ),
    columns: { step: true },
  });
  const step = fieldState?.step as string | undefined;
  return step === "ARRIVED_DESTINATION" || step === "DELIVERED";
}

function appendSiteRejectionNote(
  existing: string | null,
  category: SiteRejectionCategory,
  reason: string,
  rejectedAt: Date,
) {
  const entry = `[SITE REJECTED · ${category} · ${rejectedAt.toISOString()}] ${reason}`;
  return existing?.trim() ? `${existing.trim()}\n${entry}` : entry;
}

function revalidateOperations(jobId: string) {
  revalidatePath("/home/worksheet");
  revalidatePath("/home/jobs");
  revalidatePath(`/home/jobs/${jobId}`);
  revalidatePath("/home/movements/incoming");
  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/intake");
}

export async function rejectReceivingSiteLoadAction(formData: FormData) {
  const returnDate = clean(formData.get("returnDate"));
  const { organisationId } = await requireSiteOperator(returnDate);
  const loadId = clean(formData.get("loadId"));
  const categoryRaw = clean(formData.get("category"));
  const reason = clean(formData.get("reason"));

  if (!loadId) redirectWorksheet(returnDate, "error", "load_required");
  if (!isCategory(categoryRaw)) {
    redirectWorksheet(returnDate, "error", "rejection_category_required");
  }
  if (reason.length < 3 || reason.length > 2000) {
    redirectWorksheet(returnDate, "error", "rejection_reason_required");
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: {
      id: true,
      jobId: true,
      direction: true,
      status: true,
      driverId: true,
      haulierCounterpartyId: true,
      notes: true,
    },
  });

  if (!load) redirectWorksheet(returnDate, "error", "load_not_found");
  if (load.direction !== "incoming") {
    redirectWorksheet(returnDate, "error", "incoming_only_action");
  }
  if (load.status !== "arrived") {
    redirectWorksheet(returnDate, "error", "load_must_be_arrived");
  }

  const parentJob = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, load.jobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: { status: true },
  });
  if (!parentJob || parentJob.status === "cancelled" || parentJob.status === "draft") {
    redirectWorksheet(returnDate, "error", "job_not_operational");
  }

  if (
    !(await ownTransportDriverHasArrived(
      organisationId,
      load.id,
      load.driverId,
      load.haulierCounterpartyId,
    ))
  ) {
    redirectWorksheet(returnDate, "error", "driver_destination_arrival_required");
  }

  const now = new Date();
  await database
    .update(jobLoads)
    .set({
      status: "rejected",
      notes: appendSiteRejectionNote(load.notes, categoryRaw, reason, now),
      completedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  await syncJobStatus(load.jobId, organisationId);
  revalidateOperations(load.jobId);
  redirectWorksheet(returnDate, "success", "load_rejected");
}
