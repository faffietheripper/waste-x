"use server";

import { database } from "@/db/database";
import { organisations, wasteListings, incidents, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function suspendOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const organisationId = String(formData.get("organisationId") ?? "").trim();
  if (!organisationId) throw new Error("Organisation ID is required.");

  await database
    .update(organisations)
    .set({ isSuspended: true })
    .where(eq(organisations.id, organisationId));

  revalidatePath("/admin");
  revalidatePath("/admin/organisations");
}

// Retained for compatibility with older hidden admin routes.
export async function cancelListing(formData: FormData) {
  await requirePlatformAdmin();

  const listingId = Number(formData.get("listingId"));
  if (!Number.isFinite(listingId)) throw new Error("Valid listing ID is required.");

  await database
    .update(wasteListings)
    .set({ status: "cancelled" })
    .where(eq(wasteListings.id, listingId));

  revalidatePath("/admin");
}

// Retained for compatibility with older hidden admin routes.
export async function resolveIncident(formData: FormData) {
  await requirePlatformAdmin();

  const incidentId = String(formData.get("incidentId") ?? "").trim();
  if (!incidentId) throw new Error("Incident ID is required.");

  await database
    .update(incidents)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  revalidatePath("/admin");
}

export async function resetUserAccount(formData: FormData) {
  await requirePlatformAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("User ID is required.");

  const target = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true, role: true },
  });

  if (!target) throw new Error("User not found.");
  if (target.role === "platform_admin") {
    throw new Error("Platform admin accounts cannot be reset from Danger Zone.");
  }

  await database
    .update(users)
    .set({ isSuspended: false, passwordHash: null })
    .where(eq(users.id, userId));

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
