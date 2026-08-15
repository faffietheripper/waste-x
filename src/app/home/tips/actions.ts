"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ilike, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  counterpartySites,
  counterpartySiteAuthorisations,
  counterpartySiteEwcCodes,
  ewcCodes,
  users,
  type PermitAuthorisationType,
  type PermitRegulator,
  type PermitStatus,
} from "@/db/schema";

type UserContext = { userId: string; organisationId: string };

const REGULATORS: PermitRegulator[] = ["EA", "NRW", "SEPA", "NIEA", "other"];
const AUTHORISATION_TYPES: PermitAuthorisationType[] = [
  "permit",
  "licence",
  "exemption",
  "other",
];
const STATUSES: PermitStatus[] = [
  "active",
  "expired",
  "suspended",
  "revoked",
  "unknown",
];

async function requireOrganisationMember(): Promise<UserContext> {
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

  if (!currentUser?.organisationId || !currentUser.isActive || currentUser.isSuspended) {
    redirect("/home?reason=account_unavailable");
  }

  return { userId: currentUser.id, organisationId: currentUser.organisationId };
}

function clean(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: FormDataEntryValue | null) {
  const valueString = clean(value);
  return valueString || null;
}

function postcode(value: FormDataEntryValue | null) {
  return optional(value)?.toUpperCase() ?? null;
}

function dateValue(value: FormDataEntryValue | null) {
  const raw = clean(value);
  if (!raw) return null;
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function regulator(value: FormDataEntryValue | null): PermitRegulator {
  const parsed = clean(value) as PermitRegulator;
  return REGULATORS.includes(parsed) ? parsed : "EA";
}

function authorisationType(value: FormDataEntryValue | null): PermitAuthorisationType {
  const parsed = clean(value) as PermitAuthorisationType;
  return AUTHORISATION_TYPES.includes(parsed) ? parsed : "permit";
}

function permitStatus(value: FormDataEntryValue | null): PermitStatus {
  const parsed = clean(value) as PermitStatus;
  return STATUSES.includes(parsed) ? parsed : "unknown";
}

function detailError(facilityId: string, error: string): never {
  redirect(`/home/tips/${facilityId}?error=${encodeURIComponent(error)}`);
}

function detailSuccess(facilityId: string, success: string): never {
  redirect(`/home/tips/${facilityId}?success=${encodeURIComponent(success)}`);
}

async function getFacility(organisationId: string, facilityId: string) {
  return database.query.counterpartySites.findFirst({
    where: and(
      eq(counterpartySites.id, facilityId),
      eq(counterpartySites.organisationId, organisationId),
      eq(counterpartySites.siteType, "third_party_tip"),
    ),
  });
}

export async function createExternalFacilityAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const operatorName = clean(formData.get("operatorName"));
  const facilityName = clean(formData.get("facilityName"));
  const fullAddress = optional(formData.get("fullAddress"));
  const facilityPostcode = postcode(formData.get("postcode"));
  const contactName = optional(formData.get("contactName"));
  const contactEmail = optional(formData.get("contactEmail"));
  const contactTelephone = optional(formData.get("contactTelephone"));
  const notes = optional(formData.get("notes"));

  const authorisationNumber = clean(formData.get("authorisationNumber"));
  const authRegulator = regulator(formData.get("regulator"));
  const authType = authorisationType(formData.get("authorisationType"));
  const authStatus = permitStatus(formData.get("status"));
  const validFrom = dateValue(formData.get("validFrom"));
  const expiresAt = dateValue(formData.get("expiresAt"));
  const verificationSource = optional(formData.get("verificationSource"));
  const verifiedAt = dateValue(formData.get("verifiedAt"));

  if (!operatorName) redirect("/home/tips/new?error=operator_required");
  if (!facilityName) redirect("/home/tips/new?error=facility_required");
  if (!authorisationNumber) redirect("/home/tips/new?error=authorisation_required");

  const facilityId = await database.transaction(async (tx) => {
    let operator = await tx.query.counterparties.findFirst({
      where: and(
        eq(counterparties.organisationId, context.organisationId),
        ilike(counterparties.name, operatorName),
      ),
    });

    if (!operator) {
      const [createdOperator] = await tx
        .insert(counterparties)
        .values({
          organisationId: context.organisationId,
          name: operatorName,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      if (!createdOperator) throw new Error("FACILITY_OPERATOR_CREATE_FAILED");
      operator = createdOperator;
    }

    await tx
      .insert(counterpartyRoles)
      .values([
        {
          organisationId: context.organisationId,
          counterpartyId: operator.id,
          role: "third_party_tip",
          createdAt: new Date(),
        },
        {
          organisationId: context.organisationId,
          counterpartyId: operator.id,
          role: "receiver",
          createdAt: new Date(),
        },
      ])
      .onConflictDoNothing();

    const duplicateSite = await tx.query.counterpartySites.findFirst({
      where: and(
        eq(counterpartySites.counterpartyId, operator.id),
        eq(counterpartySites.name, facilityName),
      ),
      columns: { id: true },
    });

    if (duplicateSite) {
      redirect(`/home/tips/${duplicateSite.id}?error=duplicate_facility`);
    }

    const [facility] = await tx
      .insert(counterpartySites)
      .values({
        organisationId: context.organisationId,
        counterpartyId: operator.id,
        name: facilityName,
        siteType: "third_party_tip",
        fullAddress,
        postcode: facilityPostcode,
        contactName,
        contactEmail,
        contactTelephone,
        authorisationNumber,
        isDefault: false,
        isActive: true,
        notes,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: counterpartySites.id });

    if (!facility) throw new Error("FACILITY_CREATE_FAILED");

    await tx.insert(counterpartySiteAuthorisations).values({
      organisationId: context.organisationId,
      counterpartySiteId: facility.id,
      authorisationNumber,
      regulator: authRegulator,
      authorisationType: authType,
      status: authStatus,
      isPrimary: true,
      validFrom,
      expiresAt,
      verificationSource,
      verifiedAt,
      createdByUserId: context.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return facility.id;
  });

  revalidatePath("/home/tips");
  redirect(`/home/tips/${facilityId}?success=created`);
}

export async function updateExternalFacilityAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  const operatorId = clean(formData.get("operatorId"));
  const operatorName = clean(formData.get("operatorName"));
  const facilityName = clean(formData.get("facilityName"));

  if (!facilityId || !operatorId) redirect("/home/tips?error=missing_facility");
  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility || facility.counterpartyId !== operatorId) redirect("/home/tips?error=facility_not_found");
  if (!operatorName) detailError(facilityId, "operator_required");
  if (!facilityName) detailError(facilityId, "facility_required");

  const duplicate = await database.query.counterpartySites.findFirst({
    where: and(
      eq(counterpartySites.counterpartyId, operatorId),
      eq(counterpartySites.name, facilityName),
      ne(counterpartySites.id, facilityId),
    ),
    columns: { id: true },
  });
  if (duplicate) detailError(facilityId, "duplicate_facility");

  await database.transaction(async (tx) => {
    await tx
      .update(counterparties)
      .set({ name: operatorName, updatedAt: new Date() })
      .where(
        and(
          eq(counterparties.id, operatorId),
          eq(counterparties.organisationId, context.organisationId),
        ),
      );

    await tx
      .update(counterpartySites)
      .set({
        name: facilityName,
        siteType: "third_party_tip",
        fullAddress: optional(formData.get("fullAddress")),
        postcode: postcode(formData.get("postcode")),
        contactName: optional(formData.get("contactName")),
        contactEmail: optional(formData.get("contactEmail")),
        contactTelephone: optional(formData.get("contactTelephone")),
        notes: optional(formData.get("notes")),
        updatedAt: new Date(),
      })
      .where(eq(counterpartySites.id, facilityId));
  });

  revalidatePath("/home/tips");
  revalidatePath(`/home/tips/${facilityId}`);
  detailSuccess(facilityId, "facility_updated");
}

export async function updateExternalFacilityAuthorisationAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  const authorisationId = clean(formData.get("authorisationId"));
  const authorisationNumber = clean(formData.get("authorisationNumber"));

  if (!facilityId || !authorisationId) redirect("/home/tips?error=missing_authorisation");
  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility) redirect("/home/tips?error=facility_not_found");
  if (!authorisationNumber) detailError(facilityId, "authorisation_required");

  const existing = await database.query.counterpartySiteAuthorisations.findFirst({
    where: and(
      eq(counterpartySiteAuthorisations.id, authorisationId),
      eq(counterpartySiteAuthorisations.counterpartySiteId, facilityId),
      eq(counterpartySiteAuthorisations.organisationId, context.organisationId),
    ),
  });
  if (!existing) detailError(facilityId, "authorisation_not_found");

  await database.transaction(async (tx) => {
    await tx
      .update(counterpartySiteAuthorisations)
      .set({
        authorisationNumber,
        regulator: regulator(formData.get("regulator")),
        authorisationType: authorisationType(formData.get("authorisationType")),
        status: permitStatus(formData.get("status")),
        validFrom: dateValue(formData.get("validFrom")),
        expiresAt: dateValue(formData.get("expiresAt")),
        verificationSource: optional(formData.get("verificationSource")),
        verifiedAt: dateValue(formData.get("verifiedAt")),
        notes: optional(formData.get("authorisationNotes")),
        isPrimary: true,
        updatedAt: new Date(),
      })
      .where(eq(counterpartySiteAuthorisations.id, authorisationId));

    await tx
      .update(counterpartySites)
      .set({ authorisationNumber, updatedAt: new Date() })
      .where(eq(counterpartySites.id, facilityId));
  });

  revalidatePath(`/home/tips/${facilityId}`);
  detailSuccess(facilityId, "authorisation_updated");
}

export async function addExternalFacilityEwcCodeAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  const authorisationId = clean(formData.get("authorisationId"));
  const ewcCodeId = clean(formData.get("ewcCodeId"));
  const query = clean(formData.get("query"));

  if (!facilityId || !authorisationId || !ewcCodeId) redirect("/home/tips?error=missing_ewc_context");
  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility) redirect("/home/tips?error=facility_not_found");

  const authorisation = await database.query.counterpartySiteAuthorisations.findFirst({
    where: and(
      eq(counterpartySiteAuthorisations.id, authorisationId),
      eq(counterpartySiteAuthorisations.counterpartySiteId, facilityId),
      eq(counterpartySiteAuthorisations.organisationId, context.organisationId),
    ),
  });
  if (!authorisation) detailError(facilityId, "authorisation_not_found");

  const ewc = await database.query.ewcCodes.findFirst({
    where: and(eq(ewcCodes.id, ewcCodeId), eq(ewcCodes.isActive, true)),
  });
  if (!ewc) detailError(facilityId, "ewc_not_found");

  await database
    .insert(counterpartySiteEwcCodes)
    .values({
      organisationId: context.organisationId,
      authorisationId,
      ewcCodeId,
      isActive: true,
      configuredByUserId: context.userId,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [counterpartySiteEwcCodes.authorisationId, counterpartySiteEwcCodes.ewcCodeId],
      set: { isActive: true, configuredByUserId: context.userId },
    });

  revalidatePath(`/home/tips/${facilityId}`);
  const suffix = query ? `&q=${encodeURIComponent(query)}` : "";
  redirect(`/home/tips/${facilityId}?success=ewc_added${suffix}#permitted-ewc`);
}

export async function removeExternalFacilityEwcCodeAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  const authorisationId = clean(formData.get("authorisationId"));
  const ewcCodeId = clean(formData.get("ewcCodeId"));

  if (!facilityId || !authorisationId || !ewcCodeId) redirect("/home/tips?error=missing_ewc_context");
  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility) redirect("/home/tips?error=facility_not_found");

  await database
    .update(counterpartySiteEwcCodes)
    .set({ isActive: false, configuredByUserId: context.userId })
    .where(
      and(
        eq(counterpartySiteEwcCodes.organisationId, context.organisationId),
        eq(counterpartySiteEwcCodes.authorisationId, authorisationId),
        eq(counterpartySiteEwcCodes.ewcCodeId, ewcCodeId),
      ),
    );

  revalidatePath(`/home/tips/${facilityId}`);
  redirect(`/home/tips/${facilityId}?success=ewc_removed#permitted-ewc`);
}

export async function archiveExternalFacilityAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  if (!facilityId) redirect("/home/tips?error=missing_facility");

  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility) redirect("/home/tips?error=facility_not_found");

  await database
    .update(counterpartySites)
    .set({ isActive: false, isDefault: false, updatedAt: new Date() })
    .where(eq(counterpartySites.id, facilityId));

  revalidatePath("/home/tips");
  revalidatePath(`/home/tips/${facilityId}`);
  detailSuccess(facilityId, "archived");
}

export async function restoreExternalFacilityAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const facilityId = clean(formData.get("facilityId"));
  if (!facilityId) redirect("/home/tips?error=missing_facility");

  const facility = await getFacility(context.organisationId, facilityId);
  if (!facility) redirect("/home/tips?error=facility_not_found");

  await database
    .update(counterpartySites)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(counterpartySites.id, facilityId));

  revalidatePath("/home/tips");
  revalidatePath(`/home/tips/${facilityId}`);
  detailSuccess(facilityId, "restored");
}
