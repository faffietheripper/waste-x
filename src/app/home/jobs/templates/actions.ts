"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobs, jobTemplates, users } from "@/db/schema";

type Context = {
  userId: string;
  organisationId: string;
};

async function requireTemplateAccess(): Promise<Context> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

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
    redirect("/home");
  }

  const allowed =
    user.role === "administrator" ||
    user.role === "operations" ||
    user.role === "seniorManagement" ||
    user.role === "employee";

  if (!allowed) {
    redirect("/home/jobs?error=unauthorised");
  }

  return {
    userId: user.id,
    organisationId: user.organisationId,
  };
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function templateError(code: string, jobId?: string): never {
  if (jobId) {
    redirect(`/home/jobs/${jobId}?templateError=${encodeURIComponent(code)}`);
  }

  redirect(`/home/jobs/templates?error=${encodeURIComponent(code)}`);
}

export async function createTemplateFromJobAction(formData: FormData) {
  const { userId, organisationId } = await requireTemplateAccess();

  const jobId = clean(formData.get("jobId"));
  const name = clean(formData.get("name"));

  if (!jobId) templateError("job_required");
  if (name.length < 2 || name.length > 120) {
    templateError("invalid_name", jobId);
  }

  const sourceJob = await database.query.jobs.findFirst({
    where: and(
      eq(jobs.id, jobId),
      eq(jobs.organisationId, organisationId),
    ),
    columns: {
      id: true,
      direction: true,
      clientCounterpartyId: true,
      clientSiteId: true,
      ownSiteId: true,
      sitePermitId: true,
      thirdPartyDestinationSiteId: true,
      haulierCounterpartyId: true,
      driverId: true,
      vehicleId: true,
      materialProfileId: true,
      rateId: true,
      plannedLoads: true,
      customerReference: true,
      notes: true,
    },
  });

  if (!sourceJob) templateError("job_not_found");

  const existing = await database.query.jobTemplates.findFirst({
    where: and(
      eq(jobTemplates.organisationId, organisationId),
      eq(jobTemplates.name, name),
    ),
    columns: { id: true },
  });

  if (existing) templateError("name_exists", jobId);

  const templateId = crypto.randomUUID();

  await database.insert(jobTemplates).values({
    id: templateId,
    organisationId,
    name,
    direction: sourceJob.direction,
    clientCounterpartyId: sourceJob.clientCounterpartyId,
    clientSiteId: sourceJob.clientSiteId,
    ownSiteId: sourceJob.ownSiteId,
    sitePermitId: sourceJob.sitePermitId,
    thirdPartyDestinationSiteId: sourceJob.thirdPartyDestinationSiteId,
    haulierCounterpartyId: sourceJob.haulierCounterpartyId,
    driverId: sourceJob.driverId,
    vehicleId: sourceJob.vehicleId,
    materialProfileId: sourceJob.materialProfileId,
    rateId: sourceJob.rateId,
    plannedLoads: sourceJob.plannedLoads,
    defaultCustomerReference: sourceJob.customerReference,
    notes: sourceJob.notes,
    isActive: true,
    createdByUserId: userId,
    updatedAt: new Date(),
  });

  revalidatePath("/home/jobs/templates");
  revalidatePath(`/home/jobs/${jobId}`);
  revalidatePath("/home/jobs/new");

  redirect(`/home/jobs/${jobId}?templateSaved=${templateId}`);
}

export async function archiveJobTemplateAction(formData: FormData) {
  const { organisationId } = await requireTemplateAccess();
  const templateId = clean(formData.get("templateId"));

  if (!templateId) templateError("template_required");

  const template = await database.query.jobTemplates.findFirst({
    where: and(
      eq(jobTemplates.id, templateId),
      eq(jobTemplates.organisationId, organisationId),
    ),
    columns: { id: true },
  });

  if (!template) templateError("template_not_found");

  await database
    .update(jobTemplates)
    .set({
      isActive: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobTemplates.id, templateId),
        eq(jobTemplates.organisationId, organisationId),
      ),
    );

  revalidatePath("/home/jobs/templates");
  revalidatePath("/home/jobs/new");
}

export async function restoreJobTemplateAction(formData: FormData) {
  const { organisationId } = await requireTemplateAccess();
  const templateId = clean(formData.get("templateId"));

  if (!templateId) templateError("template_required");

  const template = await database.query.jobTemplates.findFirst({
    where: and(
      eq(jobTemplates.id, templateId),
      eq(jobTemplates.organisationId, organisationId),
    ),
    columns: { id: true },
  });

  if (!template) templateError("template_not_found");

  await database
    .update(jobTemplates)
    .set({
      isActive: true,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobTemplates.id, templateId),
        eq(jobTemplates.organisationId, organisationId),
      ),
    );

  revalidatePath("/home/jobs/templates");
  revalidatePath("/home/jobs/new");
}
