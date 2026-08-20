"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { database } from "@/db/database";
import { jobLoads } from "@/db/schema";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

export async function prepareJobLoadDwtDraftAction(formData: FormData) {
  const context = await requireSoloPermission("dwt:review");
  const jobLoadId = String(formData.get("jobLoadId") ?? "").trim();

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, jobLoadId),
      eq(jobLoads.organisationId, context.organisationId),
    ),
    columns: {
      id: true,
      direction: true,
      status: true,
    },
  });

  if (!load || load.direction !== "incoming" || load.status !== "completed") {
    redirect("/home/dwt?error=load_not_ready");
  }

  const result = await prepareJobLoadWasteReceipt({
    organisationId: context.organisationId,
    jobLoadId: load.id,
    receivedByUserId: context.userId,
  });

  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/batch");
  revalidatePath("/home/dwt/intake");

  if (!result.success) {
    const params = new URLSearchParams({ error: result.reason });
    if (result.missing.length > 0) {
      params.set("missing", result.missing.join(","));
    }
    redirect(`/home/dwt?${params.toString()}`);
  }

  // New default workflow: prepared loads return to the batch workflow.
  // Individual intake remains available only when an exception needs a full edit.
  redirect("/home/dwt/batch");
}
