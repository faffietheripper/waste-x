// src/app/home/settings/sites/actions.ts

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { sites, users, type SiteStatus, type SiteType } from "@/db/schema";

const VALID_SITE_TYPES: SiteType[] = [
  "main_site",
  "transfer_station",
  "depot",
  "recycling_yard",
  "construction_site",
  "customer_site",
  "other",
];

const VALID_SITE_STATUSES: SiteStatus[] = ["active", "inactive", "archived"];

type ActionUserContext = {
  userId: string;
  organisationId: string;
};

async function requireOrganisationAdmin(): Promise<ActionUserContext> {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: {
      id: true,
      organisationId: true,
      role: true,
      isActive: true,
      isSuspended: true,
    },
  });

  if (
    !currentUser?.organisationId ||
    !currentUser.isActive ||
    currentUser.isSuspended
  ) {
    redirectWithError("account");
  }

  if (
    currentUser.role !== "administrator" &&
    currentUser.role !== "seniorManagement"
  ) {
    redirectWithError("permission");
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

function normaliseSiteType(value: FormDataEntryValue | null): SiteType {
  const cleaned = cleanString(value) as SiteType;

  if (VALID_SITE_TYPES.includes(cleaned)) {
    return cleaned;
  }

  return "other";
}

function normaliseSiteStatus(value: FormDataEntryValue | null): SiteStatus {
  const cleaned = cleanString(value) as SiteStatus;

  if (VALID_SITE_STATUSES.includes(cleaned)) {
    return cleaned;
  }

  return "active";
}

function redirectWithError(error: string): never {
  redirect(`/home/settings/sites?error=${encodeURIComponent(error)}`);
}

function redirectWithSuccess(success: string): never {
  redirect(`/home/settings/sites?success=${encodeURIComponent(success)}`);
}

/* =========================================================
   CREATE SITE
========================================================= */

export async function createSiteAction(formData: FormData) {
  const context = await requireOrganisationAdmin();

  const name = cleanString(formData.get("name"));
  const siteType = normaliseSiteType(formData.get("siteType"));
  const fullAddress = cleanOptionalString(formData.get("fullAddress"));
  const postcode = cleanOptionalString(formData.get("postcode"));
  const permitNumber = cleanOptionalString(formData.get("permitNumber"));

  if (!name) {
    redirectWithError("site_name_required");
  }

  const existingSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, context.organisationId),
      eq(sites.name, name),
    ),
    columns: {
      id: true,
    },
  });

  if (existingSite) {
    redirectWithError("duplicate_site_name");
  }

  const existingDefaultSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, context.organisationId),
      eq(sites.isDefault, true),
    ),
    columns: {
      id: true,
    },
  });

  await database.insert(sites).values({
    organisationId: context.organisationId,
    name,
    siteType,
    fullAddress,
    postcode,
    permitNumber,
    isDefault: !existingDefaultSite,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  revalidatePath("/home/settings/sites");
  redirectWithSuccess("site_created");
}

/* =========================================================
   UPDATE SITE
========================================================= */

export async function updateSiteAction(formData: FormData) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));
  const name = cleanString(formData.get("name"));
  const siteType = normaliseSiteType(formData.get("siteType"));
  const status = normaliseSiteStatus(formData.get("status"));
  const fullAddress = cleanOptionalString(formData.get("fullAddress"));
  const postcode = cleanOptionalString(formData.get("postcode"));
  const permitNumber = cleanOptionalString(formData.get("permitNumber"));

  if (!siteId) {
    redirectWithError("missing_site_id");
  }

  if (!name) {
    redirectWithError("site_name_required");
  }

  const existingSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.id, siteId),
      eq(sites.organisationId, context.organisationId),
    ),
  });

  if (!existingSite) {
    redirectWithError("site_not_found");
  }

  const siteToUpdate = existingSite;

  if (siteToUpdate.isDefault && status !== "active") {
    redirectWithError("default_site_must_stay_active");
  }

  const duplicateSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, context.organisationId),
      eq(sites.name, name),
      ne(sites.id, siteId),
    ),
    columns: {
      id: true,
    },
  });

  if (duplicateSite) {
    redirectWithError("duplicate_site_name");
  }

  await database
    .update(sites)
    .set({
      name,
      siteType,
      fullAddress,
      postcode,
      permitNumber,
      status,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sites.id, siteId),
        eq(sites.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/settings/sites");
  redirectWithSuccess("site_updated");
}

/* =========================================================
   SET DEFAULT SITE
========================================================= */

export async function setDefaultSiteAction(formData: FormData) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));

  if (!siteId) {
    redirectWithError("missing_site_id");
  }

  const selectedSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.id, siteId),
      eq(sites.organisationId, context.organisationId),
    ),
  });

  if (!selectedSite) {
    redirectWithError("site_not_found");
  }

  const siteToMakeDefault = selectedSite;

  if (siteToMakeDefault.status === "archived") {
    redirectWithError("archived_site_cannot_be_default");
  }

  await database.transaction(async (tx) => {
    await tx
      .update(sites)
      .set({
        isDefault: false,
        updatedAt: new Date(),
      })
      .where(eq(sites.organisationId, context.organisationId));

    await tx
      .update(sites)
      .set({
        isDefault: true,
        status: "active",
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sites.id, siteToMakeDefault.id),
          eq(sites.organisationId, context.organisationId),
        ),
      );
  });

  revalidatePath("/home/settings/sites");
  redirectWithSuccess("default_site_updated");
}

/* =========================================================
   ARCHIVE SITE
========================================================= */

export async function archiveSiteAction(formData: FormData) {
  const context = await requireOrganisationAdmin();

  const siteId = cleanString(formData.get("siteId"));

  if (!siteId) {
    redirectWithError("missing_site_id");
  }

  const selectedSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.id, siteId),
      eq(sites.organisationId, context.organisationId),
    ),
  });

  if (!selectedSite) {
    redirectWithError("site_not_found");
  }

  const siteToArchive = selectedSite;

  if (siteToArchive.isDefault) {
    redirectWithError("cannot_archive_default_site");
  }

  await database
    .update(sites)
    .set({
      status: "archived",
      isDefault: false,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(sites.id, siteToArchive.id),
        eq(sites.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/settings/sites");
  redirectWithSuccess("site_archived");
}