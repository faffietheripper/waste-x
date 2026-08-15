"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { jobLoads, users } from "@/db/schema";
import { prepareJobLoadWasteReceipt } from "@/modules/digital-waste-tracking/data-access/prepareJobLoadWasteReceipt";

export async function prepareJobLoadDwtDraftAction(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      organisationId: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirect("/home?reason=account_unavailable");
  }

  const jobLoadId = String(formData.get("jobLoadId") ?? "").trim();

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, jobLoadId),
      eq(jobLoads.organisationId, currentUser.organisationId),
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
    organisationId: currentUser.organisationId,
    jobLoadId: load.id,
    receivedByUserId: currentUser.id,
  });

  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/intake");

  if (!result.success) {
    const params = new URLSearchParams({
      error: result.reason,
    });
    if (result.missing.length > 0) {
      params.set("missing", result.missing.join(","));
    }
    redirect(`/home/dwt?${params.toString()}`);
  }

  redirect(`/home/dwt/intake/${load.id}`);
}
