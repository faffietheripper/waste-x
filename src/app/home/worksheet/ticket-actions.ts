"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { deriveReceivingSiteTicketNumber } from "@waste-x/operations-core";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoads, jobs, users } from "@/db/schema";

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function returnToWorksheet(returnDate: string, key: "success" | "error", code: string): never {
  const params = new URLSearchParams();
  if (validDate(returnDate)) params.set("date", returnDate);
  params.set("view", "completed");
  params.set(key, code);
  redirect(`/home/worksheet?${params.toString()}`);
}

export async function issueReceivingSiteTicketAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      organisationId: true,
      isActive: true,
      isSuspended: true,
      role: true,
    },
  });

  const allowed =
    user?.role === "administrator" ||
    user?.role === "operations" ||
    user?.role === "seniorManagement" ||
    user?.role === "employee";

  if (!user?.organisationId || !user.isActive || user.isSuspended || !allowed) {
    redirect("/home/worksheet?error=unauthorised");
  }

  const loadId = clean(formData.get("loadId"));
  const returnDate = clean(formData.get("returnDate"));

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, user.organisationId),
    ),
    columns: {
      id: true,
      jobId: true,
      loadNumber: true,
      status: true,
      ticketNumber: true,
      netWeight: true,
      wasteDescriptionSnapshot: true,
      driverId: true,
      vehicleId: true,
    },
  });

  if (!load) returnToWorksheet(returnDate, "error", "load_not_found");
  if (load.status !== "completed") {
    returnToWorksheet(returnDate, "error", "site_ticket_requires_completed_load");
  }

  const net = Number(load.netWeight ?? "0");
  if (!Number.isFinite(net) || net <= 0) {
    returnToWorksheet(returnDate, "error", "net_weight_required");
  }
  if (!load.wasteDescriptionSnapshot?.trim()) {
    returnToWorksheet(returnDate, "error", "waste_description_required");
  }
  if (!load.driverId) returnToWorksheet(returnDate, "error", "driver_required");
  if (!load.vehicleId) returnToWorksheet(returnDate, "error", "vehicle_required");

  if (load.ticketNumber) {
    returnToWorksheet(returnDate, "success", "site_ticket_ready");
  }

  const job = await database.query.jobs.findFirst({
    where: and(eq(jobs.id, load.jobId), eq(jobs.organisationId, user.organisationId)),
    columns: { jobNumber: true },
  });
  if (!job) returnToWorksheet(returnDate, "error", "job_not_available");

  const ticketNumber = deriveReceivingSiteTicketNumber({
    jobNumber: job.jobNumber,
    loadNumber: load.loadNumber,
    loadId: load.id,
  });

  await database
    .update(jobLoads)
    .set({ ticketNumber, updatedAt: new Date() })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, user.organisationId),
        eq(jobLoads.status, "completed"),
      ),
    );

  revalidatePath("/home/worksheet");
  revalidatePath(`/home/jobs/${load.jobId}`);
  returnToWorksheet(returnDate, "success", "site_ticket_ready");
}
