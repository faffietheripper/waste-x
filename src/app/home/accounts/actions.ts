"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import { jobs } from "@/db/schema";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

export async function markJobBilledAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = cleanString(formData.get("jobId"));
  const invoiceReference = cleanString(formData.get("invoiceReference"));

  if (!jobId || !invoiceReference) {
    redirect("/home/accounts?error=invoice_reference_required");
  }

  const job = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, jobId),
      eq(jobs.organisationId, access.organisationId),
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  if (!job) {
    redirect("/home/accounts?error=job_not_found");
  }

  if (job.status !== "completed") {
    redirect("/home/accounts?error=job_not_completed");
  }

  await database
    .update(jobs)
    .set({
      customerInvoiceReference: invoiceReference,
      customerInvoicedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.organisationId, access.organisationId),
      ),
    );

  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");
  revalidatePath(`/home/jobs/${jobId}`);

  redirect("/home/accounts?success=marked_billed");
}

export async function markJobUnbilledAction(formData: FormData) {
  const access = await requireAdminValueAccess();
  const jobId = cleanString(formData.get("jobId"));

  if (!jobId) {
    redirect("/home/accounts?error=job_not_found");
  }

  await database
    .update(jobs)
    .set({
      customerInvoiceReference: null,
      customerInvoicedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobs.id, jobId),
        eq(jobs.organisationId, access.organisationId),
      ),
    );

  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");
  revalidatePath(`/home/jobs/${jobId}`);

  redirect("/home/accounts?success=marked_unbilled");
}
