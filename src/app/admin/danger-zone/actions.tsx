"use server";

import { database } from "@/db/database";
import { organisations, wasteListings, incidents, users } from "@/db/schema";
import { requirePlatformAdmin } from "@/lib/access/require-platform-admin";
import { recordPlatformAdminAuditEvent } from "@/lib/admin/recordPlatformAdminAudit";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

export async function suspendOrganisation(formData: FormData) {
  await requirePlatformAdmin();

  const organisationId = String(formData.get("organisationId") ?? "").trim();
  if (!organisationId) throw new Error("Organisation ID is required.");

  const target = await database.query.organisations.findFirst({
    where: eq(organisations.id, organisationId),
    columns: {
      id: true,
      status: true,
      isSuspended: true,
    },
  });

  if (!target) throw new Error("Organisation not found.");

  await database
    .update(organisations)
    .set({ isSuspended: true })
    .where(eq(organisations.id, organisationId));

  await recordPlatformAdminAuditEvent({
    organisationId,
    entityType: "organisation",
    entityId: organisationId,
    action: "ADMIN_ORGANISATION_SUSPENDED",
    previousState: {
      status: target.status,
      isSuspended: target.isSuspended,
    },
    newState: {
      status: target.status,
      isSuspended: true,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/organisations");
}

// Retained for compatibility with older hidden admin routes.
export async function cancelListing(formData: FormData) {
  await requirePlatformAdmin();

  const listingId = Number(formData.get("listingId"));
  if (!Number.isFinite(listingId)) throw new Error("Valid listing ID is required.");

  const listing = await database.query.wasteListings.findFirst({
    where: eq(wasteListings.id, listingId),
    columns: {
      id: true,
      organisationId: true,
      status: true,
    },
  });

  if (!listing) throw new Error("Listing not found.");

  await database
    .update(wasteListings)
    .set({ status: "cancelled" })
    .where(eq(wasteListings.id, listingId));

  await recordPlatformAdminAuditEvent({
    organisationId: listing.organisationId,
    entityType: "waste_listing",
    entityId: String(listing.id),
    action: "ADMIN_LEGACY_LISTING_CANCELLED",
    previousState: { status: listing.status },
    newState: { status: "cancelled" },
  });

  revalidatePath("/admin");
}

// Retained for compatibility with older hidden admin routes.
export async function resolveIncident(formData: FormData) {
  await requirePlatformAdmin();

  const incidentId = String(formData.get("incidentId") ?? "").trim();
  if (!incidentId) throw new Error("Incident ID is required.");

  const incident = await database.query.incidents.findFirst({
    where: eq(incidents.id, incidentId),
    columns: {
      id: true,
      organisationId: true,
      status: true,
    },
  });

  if (!incident) throw new Error("Incident not found.");

  await database
    .update(incidents)
    .set({ status: "resolved", resolvedAt: new Date() })
    .where(eq(incidents.id, incidentId));

  await recordPlatformAdminAuditEvent({
    organisationId: incident.organisationId,
    entityType: "incident",
    entityId: incident.id,
    action: "ADMIN_LEGACY_INCIDENT_RESOLVED",
    previousState: { status: incident.status },
    newState: { status: "resolved" },
  });

  revalidatePath("/admin");
}

export async function resetUserAccount(formData: FormData) {
  await requirePlatformAdmin();

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) throw new Error("User ID is required.");

  const target = await database.query.users.findFirst({
    where: eq(users.id, userId),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      status: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (!target) throw new Error("User not found.");
  if (target.role === "platform_admin") {
    throw new Error("Platform admin accounts cannot be reset from Danger Zone.");
  }
  if (!target.organisationId) {
    throw new Error("Customer user is not attached to an organisation.");
  }

  await database
    .update(users)
    .set({ isSuspended: false, passwordHash: null })
    .where(eq(users.id, userId));

  await recordPlatformAdminAuditEvent({
    organisationId: target.organisationId,
    entityType: "user",
    entityId: target.id,
    action: "ADMIN_USER_ACCOUNT_RESET",
    previousState: {
      status: target.status,
      isActive: target.isActive,
      isSuspended: target.isSuspended,
    },
    newState: {
      status: target.status,
      isActive: target.isActive,
      isSuspended: false,
      credentialResetRequired: true,
    },
  });

  revalidatePath("/admin");
  revalidatePath("/admin/users");
}
