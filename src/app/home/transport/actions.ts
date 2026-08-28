"use server";
/* WASTE_X_OWN_CARRIER_DRIVER_DWT_V1 */

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
import {
  canManageOwnCarrierDwtSettings,
  saveOwnCarrierDwtSettings,
} from "@/modules/digital-waste-tracking/data-access/saveOwnCarrierDwtSettings";

type OrganisationContext = {
  userId: string;
  organisationId: string;
  role: string | null;
};

async function requireOrganisationMember(): Promise<OrganisationContext> {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

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
    redirect("/home?reason=account_unavailable");
  }

  return {
    userId: currentUser.id,
    organisationId: currentUser.organisationId,
    role: currentUser.role,
  };
}

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function normaliseRegistration(value: FormDataEntryValue | null) {
  return cleanString(value).toUpperCase().replace(/\s+/g, "");
}

function normaliseTare(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return "INVALID" as const;

  return parsed.toFixed(3);
}

async function saveOwnCarrierDwtFromDriverForm(
  formData: FormData,
  context: OrganisationContext,
  haulierId: string | null,
) {
  if (haulierId) return null;
  if (cleanString(formData.get("ownCarrierDwtPresent")) !== "1") return null;
  if (!canManageOwnCarrierDwtSettings(context.role)) return null;

  const result = await saveOwnCarrierDwtSettings({
    organisationId: context.organisationId,
    input: {
      registrationNumber: cleanString(
        formData.get("ownCarrierRegistrationNumber"),
      ),
      reasonForNoRegistrationNumber: cleanString(
        formData.get("ownCarrierReasonForNoRegistrationNumber"),
      ),
      meansOfTransport: cleanString(
        formData.get("ownCarrierMeansOfTransport"),
      ),
    },
  });

  if (!result.ok) {
    return `own_carrier_${result.code}`;
  }

  revalidatePath("/home/settings/digital-waste-tracking");
  revalidatePath("/home/dwt");
  revalidatePath("/home/dwt/batch");

  return null;
}

async function getActiveHaulier(organisationId: string, haulierId: string | null) {
  if (!haulierId) return null;

  const rows = await database
    .select({ id: counterparties.id, name: counterparties.name })
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
        eq(counterparties.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

function driverError(driverId: string, error: string): never {
  redirect(`/home/transport/drivers/${driverId}?error=${encodeURIComponent(error)}`);
}

function vehicleError(vehicleId: string, error: string): never {
  redirect(`/home/transport/vehicles/${vehicleId}?error=${encodeURIComponent(error)}`);
}

export async function createDriverAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const name = cleanString(formData.get("name"));
  const telephone = optionalString(formData.get("telephone"));
  const email = optionalString(formData.get("email"));
  const haulierId = optionalString(formData.get("haulierCounterpartyId"));
  const defaultVehicleId = optionalString(formData.get("defaultVehicleId"));
  const notes = optionalString(formData.get("notes"));

  if (!name) redirect("/home/transport/drivers/new?error=name_required");

  if (haulierId) {
    const haulier = await getActiveHaulier(context.organisationId, haulierId);
    if (!haulier) redirect("/home/transport/drivers/new?error=invalid_haulier");
  }

  if (defaultVehicleId) {
    const vehicle = await database.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, defaultVehicleId),
        eq(vehicles.organisationId, context.organisationId),
        eq(vehicles.isActive, true),
      ),
    });

    if (!vehicle) redirect("/home/transport/drivers/new?error=invalid_vehicle");

    if (
      haulierId &&
      vehicle.haulierCounterpartyId &&
      vehicle.haulierCounterpartyId !== haulierId
    ) {
      redirect("/home/transport/drivers/new?error=vehicle_haulier_mismatch");
    }
  }

  const ownCarrierError = await saveOwnCarrierDwtFromDriverForm(
    formData,
    context,
    haulierId,
  );

  if (ownCarrierError) {
    redirect(`/home/transport/drivers/new?error=${ownCarrierError}`);
  }

  const [created] = await database
    .insert(drivers)
    .values({
      organisationId: context.organisationId,
      haulierCounterpartyId: haulierId,
      name,
      telephone,
      email,
      defaultVehicleId,
      isActive: true,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: drivers.id });

  if (!created) redirect("/home/transport/drivers/new?error=create_failed");

  revalidatePath("/home/transport");
  revalidatePath("/home/hauliers");
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);

  redirect(`/home/transport/drivers/${created.id}?success=created`);
}

export async function updateDriverAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const driverId = cleanString(formData.get("driverId"));
  const name = cleanString(formData.get("name"));
  const telephone = optionalString(formData.get("telephone"));
  const email = optionalString(formData.get("email"));
  const haulierId = optionalString(formData.get("haulierCounterpartyId"));
  const defaultVehicleId = optionalString(formData.get("defaultVehicleId"));
  const notes = optionalString(formData.get("notes"));

  if (!driverId) redirect("/home/transport?error=missing_driver");
  if (!name) driverError(driverId, "name_required");

  const existing = await database.query.drivers.findFirst({
    where: and(
      eq(drivers.id, driverId),
      eq(drivers.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=driver_not_found");

  if (haulierId) {
    const haulier = await getActiveHaulier(context.organisationId, haulierId);
    if (!haulier) driverError(driverId, "invalid_haulier");
  }

  if (defaultVehicleId) {
    const vehicle = await database.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, defaultVehicleId),
        eq(vehicles.organisationId, context.organisationId),
        eq(vehicles.isActive, true),
      ),
    });

    if (!vehicle) driverError(driverId, "invalid_vehicle");

    if (
      haulierId &&
      vehicle.haulierCounterpartyId &&
      vehicle.haulierCounterpartyId !== haulierId
    ) {
      driverError(driverId, "vehicle_haulier_mismatch");
    }
  }

  const ownCarrierError = await saveOwnCarrierDwtFromDriverForm(
    formData,
    context,
    haulierId,
  );

  if (ownCarrierError) {
    driverError(driverId, ownCarrierError);
  }

  await database
    .update(drivers)
    .set({
      name,
      telephone,
      email,
      haulierCounterpartyId: haulierId,
      defaultVehicleId,
      notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(drivers.id, driverId),
        eq(drivers.organisationId, context.organisationId),
      ),
    );

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/drivers/${driverId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);

  redirect(`/home/transport/drivers/${driverId}?success=updated`);
}

export async function archiveDriverAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const driverId = cleanString(formData.get("driverId"));

  if (!driverId) redirect("/home/transport?error=missing_driver");

  const existing = await database.query.drivers.findFirst({
    where: and(
      eq(drivers.id, driverId),
      eq(drivers.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=driver_not_found");

  await database
    .update(drivers)
    .set({ isActive: false, updatedAt: new Date() })
    .where(eq(drivers.id, driverId));

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/drivers/${driverId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);

  redirect(`/home/transport/drivers/${driverId}?success=archived`);
}

export async function restoreDriverAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const driverId = cleanString(formData.get("driverId"));

  if (!driverId) redirect("/home/transport?error=missing_driver");

  const existing = await database.query.drivers.findFirst({
    where: and(
      eq(drivers.id, driverId),
      eq(drivers.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=driver_not_found");

  await database
    .update(drivers)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(drivers.id, driverId));

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/drivers/${driverId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);

  redirect(`/home/transport/drivers/${driverId}?success=restored`);
}

export async function createVehicleAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const registrationNumber = normaliseRegistration(formData.get("registrationNumber"));
  const vehicleType = optionalString(formData.get("vehicleType"));
  const haulierId = optionalString(formData.get("haulierCounterpartyId"));
  const tareWeightKg = normaliseTare(formData.get("tareWeightKg"));
  const notes = optionalString(formData.get("notes"));

  if (!registrationNumber) redirect("/home/transport/vehicles/new?error=registration_required");
  if (tareWeightKg === "INVALID") redirect("/home/transport/vehicles/new?error=invalid_tare");

  if (haulierId) {
    const haulier = await getActiveHaulier(context.organisationId, haulierId);
    if (!haulier) redirect("/home/transport/vehicles/new?error=invalid_haulier");
  }

  const duplicate = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.organisationId, context.organisationId),
      eq(vehicles.registrationNumber, registrationNumber),
    ),
    columns: { id: true },
  });

  if (duplicate) redirect("/home/transport/vehicles/new?error=duplicate_registration");

  const [created] = await database
    .insert(vehicles)
    .values({
      organisationId: context.organisationId,
      haulierCounterpartyId: haulierId,
      registrationNumber,
      vehicleType,
      tareWeightKg,
      isActive: true,
      notes,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({ id: vehicles.id });

  if (!created) redirect("/home/transport/vehicles/new?error=create_failed");

  revalidatePath("/home/transport");
  revalidatePath("/home/hauliers");
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);

  redirect(`/home/transport/vehicles/${created.id}?success=created`);
}

export async function updateVehicleAction(formData: FormData) {
  const context = await requireOrganisationMember();

  const vehicleId = cleanString(formData.get("vehicleId"));
  const registrationNumber = normaliseRegistration(formData.get("registrationNumber"));
  const vehicleType = optionalString(formData.get("vehicleType"));
  const haulierId = optionalString(formData.get("haulierCounterpartyId"));
  const tareWeightKg = normaliseTare(formData.get("tareWeightKg"));
  const notes = optionalString(formData.get("notes"));

  if (!vehicleId) redirect("/home/transport?error=missing_vehicle");
  if (!registrationNumber) vehicleError(vehicleId, "registration_required");
  if (tareWeightKg === "INVALID") vehicleError(vehicleId, "invalid_tare");

  const existing = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.id, vehicleId),
      eq(vehicles.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=vehicle_not_found");

  if (haulierId) {
    const haulier = await getActiveHaulier(context.organisationId, haulierId);
    if (!haulier) vehicleError(vehicleId, "invalid_haulier");
  }

  const duplicate = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.organisationId, context.organisationId),
      eq(vehicles.registrationNumber, registrationNumber),
      ne(vehicles.id, vehicleId),
    ),
    columns: { id: true },
  });

  if (duplicate) vehicleError(vehicleId, "duplicate_registration");

  await database.transaction(async (tx) => {
    await tx
      .update(vehicles)
      .set({
        registrationNumber,
        vehicleType,
        haulierCounterpartyId: haulierId,
        tareWeightKg,
        notes,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(vehicles.id, vehicleId),
          eq(vehicles.organisationId, context.organisationId),
        ),
      );

    if (existing.haulierCounterpartyId !== haulierId) {
      await tx
        .update(drivers)
        .set({ defaultVehicleId: null, updatedAt: new Date() })
        .where(
          and(
            eq(drivers.organisationId, context.organisationId),
            eq(drivers.defaultVehicleId, vehicleId),
          ),
        );
    }
  });

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/vehicles/${vehicleId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);
  if (haulierId) revalidatePath(`/home/hauliers/${haulierId}`);

  redirect(`/home/transport/vehicles/${vehicleId}?success=updated`);
}

export async function archiveVehicleAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const vehicleId = cleanString(formData.get("vehicleId"));

  if (!vehicleId) redirect("/home/transport?error=missing_vehicle");

  const existing = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.id, vehicleId),
      eq(vehicles.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=vehicle_not_found");

  await database.transaction(async (tx) => {
    await tx
      .update(vehicles)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(vehicles.id, vehicleId));

    await tx
      .update(drivers)
      .set({ defaultVehicleId: null, updatedAt: new Date() })
      .where(
        and(
          eq(drivers.organisationId, context.organisationId),
          eq(drivers.defaultVehicleId, vehicleId),
        ),
      );
  });

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/vehicles/${vehicleId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);

  redirect(`/home/transport/vehicles/${vehicleId}?success=archived`);
}

export async function restoreVehicleAction(formData: FormData) {
  const context = await requireOrganisationMember();
  const vehicleId = cleanString(formData.get("vehicleId"));

  if (!vehicleId) redirect("/home/transport?error=missing_vehicle");

  const existing = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.id, vehicleId),
      eq(vehicles.organisationId, context.organisationId),
    ),
  });

  if (!existing) redirect("/home/transport?error=vehicle_not_found");

  await database
    .update(vehicles)
    .set({ isActive: true, updatedAt: new Date() })
    .where(eq(vehicles.id, vehicleId));

  revalidatePath("/home/transport");
  revalidatePath(`/home/transport/vehicles/${vehicleId}`);
  if (existing.haulierCounterpartyId) revalidatePath(`/home/hauliers/${existing.haulierCounterpartyId}`);

  redirect(`/home/transport/vehicles/${vehicleId}?success=restored`);
}
