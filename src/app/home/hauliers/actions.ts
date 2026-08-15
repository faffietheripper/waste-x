"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, ne } from "drizzle-orm";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  users,
  vehicles,
} from "@/db/schema";

type OrganisationContext = {
  userId: string;
  organisationId: string;
};

async function requireOrganisationMember(): Promise<OrganisationContext> {
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

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
  };
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normalisePostcode(value: FormDataEntryValue | null) {
  const cleaned = optionalString(value);
  return cleaned ? cleaned.toUpperCase() : null;
}

function normaliseCarrierNumber(value: FormDataEntryValue | null) {
  const cleaned = optionalString(value);
  return cleaned ? cleaned.toUpperCase().replace(/\s+/g, "") : null;
}

async function getHaulier(organisationId: string, haulierId: string) {
  const rows = await database
    .select({
      id: counterparties.id,
      isActive: counterparties.isActive,
    })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.role, "haulier"),
      ),
    )
    .where(
      and(
        eq(counterparties.id, haulierId),
        eq(counterparties.organisationId, organisationId),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

function redirectNewError(error: string): never {
  redirect(`/home/hauliers/new?error=${encodeURIComponent(error)}`);
}

function redirectHaulierError(haulierId: string, error: string): never {
  redirect(`/home/hauliers/${haulierId}?error=${encodeURIComponent(error)}`);
}

function redirectHaulierSuccess(haulierId: string, success: string): never {
  redirect(`/home/hauliers/${haulierId}?success=${encodeURIComponent(success)}`);
}

export async function createHaulierAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const name = cleanString(formData.get("name"));
  const carrierRegistrationNumber = normaliseCarrierNumber(
    formData.get("carrierRegistrationNumber"),
  );
  const email = optionalString(formData.get("email"));
  const telephone = optionalString(formData.get("telephone"));
  const fullAddress = optionalString(formData.get("fullAddress"));
  const postcode = normalisePostcode(formData.get("postcode"));
  const notes = optionalString(formData.get("notes"));

  if (!name) redirectNewError("name_required");

  const sameName = await database.query.counterparties.findFirst({
    where: and(
      eq(counterparties.organisationId, context.organisationId),
      eq(counterparties.name, name),
    ),
  });

  if (sameName) {
    const existingRole = await database.query.counterpartyRoles.findFirst({
      where: and(
        eq(counterpartyRoles.counterpartyId, sameName.id),
        eq(counterpartyRoles.role, "haulier"),
      ),
    });

    if (existingRole) redirectNewError("duplicate_haulier");

    await database.transaction(async (tx) => {
      await tx
        .update(counterparties)
        .set({
          carrierRegistrationNumber,
          email: email ?? sameName.email,
          telephone: telephone ?? sameName.telephone,
          fullAddress: fullAddress ?? sameName.fullAddress,
          postcode: postcode ?? sameName.postcode,
          notes: notes ?? sameName.notes,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(counterparties.id, sameName.id));

      await tx.insert(counterpartyRoles).values({
        organisationId: context.organisationId,
        counterpartyId: sameName.id,
        role: "haulier",
        createdAt: new Date(),
      });
    });

    revalidatePath("/home/hauliers");
    redirectHaulierSuccess(sameName.id, "haulier_created");
  }

  const haulierId = await database.transaction(async (tx) => {
    const [created] = await tx
      .insert(counterparties)
      .values({
        organisationId: context.organisationId,
        name,
        carrierRegistrationNumber,
        email,
        telephone,
        fullAddress,
        postcode,
        notes,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: counterparties.id });

    if (!created) throw new Error("HAULIER_CREATE_FAILED");

    await tx.insert(counterpartyRoles).values({
      organisationId: context.organisationId,
      counterpartyId: created.id,
      role: "haulier",
      createdAt: new Date(),
    });

    return created.id;
  });

  revalidatePath("/home/hauliers");
  redirectHaulierSuccess(haulierId, "haulier_created");
}

export async function updateHaulierAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const haulierId = cleanString(formData.get("haulierId"));
  const name = cleanString(formData.get("name"));
  const carrierRegistrationNumber = normaliseCarrierNumber(
    formData.get("carrierRegistrationNumber"),
  );
  const email = optionalString(formData.get("email"));
  const telephone = optionalString(formData.get("telephone"));
  const fullAddress = optionalString(formData.get("fullAddress"));
  const postcode = normalisePostcode(formData.get("postcode"));
  const notes = optionalString(formData.get("notes"));

  if (!haulierId) redirect("/home/hauliers?error=missing_haulier");
  if (!name) redirectHaulierError(haulierId, "name_required");

  const haulier = await getHaulier(context.organisationId, haulierId);
  if (!haulier) redirect("/home/hauliers?error=haulier_not_found");

  const duplicate = await database.query.counterparties.findFirst({
    where: and(
      eq(counterparties.organisationId, context.organisationId),
      eq(counterparties.name, name),
      ne(counterparties.id, haulierId),
    ),
    columns: { id: true },
  });

  if (duplicate) redirectHaulierError(haulierId, "duplicate_name");

  await database
    .update(counterparties)
    .set({
      name,
      carrierRegistrationNumber,
      email,
      telephone,
      fullAddress,
      postcode,
      notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(counterparties.id, haulierId),
        eq(counterparties.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/hauliers");
  revalidatePath(`/home/hauliers/${haulierId}`);
  revalidatePath("/home/transport");
  redirectHaulierSuccess(haulierId, "haulier_updated");
}

export async function archiveHaulierAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const haulierId = cleanString(formData.get("haulierId"));

  if (!haulierId) redirect("/home/hauliers?error=missing_haulier");

  const haulier = await getHaulier(context.organisationId, haulierId);
  if (!haulier) redirect("/home/hauliers?error=haulier_not_found");

  /*
    counterparties.isActive belongs to the whole business record.
    Do not deactivate it from the Hauliers screen when the same
    business is also being reused as a client, producer, etc.
  */
  const otherRole = await database.query.counterpartyRoles.findFirst({
    where: and(
      eq(counterpartyRoles.counterpartyId, haulierId),
      ne(counterpartyRoles.role, "haulier"),
    ),
    columns: { role: true },
  });

  if (otherRole) {
    redirectHaulierError(haulierId, "multi_role_archive_blocked");
  }

  await database.transaction(async (tx) => {
    await tx
      .update(counterparties)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(counterparties.id, haulierId));

    await tx
      .update(drivers)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(drivers.organisationId, context.organisationId),
          eq(drivers.haulierCounterpartyId, haulierId),
        ),
      );

    await tx
      .update(vehicles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(vehicles.organisationId, context.organisationId),
          eq(vehicles.haulierCounterpartyId, haulierId),
        ),
      );
  });

  revalidatePath("/home/hauliers");
  revalidatePath(`/home/hauliers/${haulierId}`);
  revalidatePath("/home/transport");
  redirectHaulierSuccess(haulierId, "haulier_archived");
}

export async function restoreHaulierAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const haulierId = cleanString(formData.get("haulierId"));

  if (!haulierId) redirect("/home/hauliers?error=missing_haulier");

  const haulier = await getHaulier(context.organisationId, haulierId);
  if (!haulier) redirect("/home/hauliers?error=haulier_not_found");

  await database
    .update(counterparties)
    .set({ isActive: true, updatedAt: new Date() })
    .where(
      and(
        eq(counterparties.id, haulierId),
        eq(counterparties.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/hauliers");
  revalidatePath(`/home/hauliers/${haulierId}`);
  redirectHaulierSuccess(haulierId, "haulier_restored");
}
