"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  jobLoads,
  users,
  vehicles,
} from "@/db/schema";

function cleanString(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function optionalString(value: FormDataEntryValue | null) {
  const cleaned = cleanString(value);
  return cleaned || null;
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normaliseVehicleRegistration(value: FormDataEntryValue | null) {
  return cleanString(value).toUpperCase().replace(/\s+/g, " ");
}

function redirectWorksheet(
  returnDate: string,
  key: "success" | "error",
  code: string,
  focusLoadId?: string,
): never {
  const params = new URLSearchParams();

  if (validDate(returnDate)) {
    params.set("date", returnDate);
  }

  params.set("view", "live");
  params.set(key, code);

  const hash = focusLoadId ? `#load-${encodeURIComponent(focusLoadId)}` : "";
  redirect(`/home/worksheet?${params.toString()}${hash}`);
}

type OperationsContext = {
  userId: string;
  organisationId: string;
};

async function getOperationsContext(): Promise<
  | { ok: true; data: OperationsContext }
  | { ok: false; error: string }
> {
  const session = await auth();

  if (!session?.user?.id) {
    return { ok: false, error: "Your session has expired. Sign in again." };
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
    return { ok: false, error: "Your organisation account is not available." };
  }

  const allowed =
    currentUser.role === "administrator" ||
    currentUser.role === "operations" ||
    currentUser.role === "seniorManagement" ||
    currentUser.role === "employee";

  if (!allowed) {
    return { ok: false, error: "You do not have permission to edit transport." };
  }

  return {
    ok: true,
    data: {
      userId: currentUser.id,
      organisationId: currentUser.organisationId,
    },
  };
}

async function activeHaulier(organisationId: string, counterpartyId: string) {
  const [match] = await database
    .select({ id: counterparties.id })
    .from(counterparties)
    .innerJoin(
      counterpartyRoles,
      and(
        eq(counterpartyRoles.counterpartyId, counterparties.id),
        eq(counterpartyRoles.organisationId, organisationId),
        eq(counterpartyRoles.role, "haulier"),
      ),
    )
    .where(
      and(
        eq(counterparties.id, counterpartyId),
        eq(counterparties.organisationId, organisationId),
        eq(counterparties.isActive, true),
      ),
    )
    .limit(1);

  return match ?? null;
}

export async function assignLoadTransportAction(formData: FormData) {
  const contextResult = await getOperationsContext();
  const returnDate = cleanString(formData.get("returnDate"));
  const loadId = cleanString(formData.get("loadId"));

  if (!contextResult.ok) {
    redirectWorksheet(returnDate, "error", "unauthorised", loadId || undefined);
  }

  const { organisationId } = contextResult.data;
  const transportMode = cleanString(formData.get("transportMode"));
  const requestedHaulierId = cleanString(formData.get("haulierCounterpartyId"));
  const driverId = cleanString(formData.get("driverId"));
  const vehicleId = cleanString(formData.get("vehicleId"));

  if (!loadId) {
    redirectWorksheet(returnDate, "error", "load_required");
  }

  if (transportMode !== "own" && transportMode !== "external") {
    redirectWorksheet(returnDate, "error", "invalid_transport_mode", loadId);
  }

  const haulierCounterpartyId =
    transportMode === "external" ? requestedHaulierId || null : null;

  if (transportMode === "external" && !haulierCounterpartyId) {
    redirectWorksheet(returnDate, "error", "haulier_required", loadId);
  }

  if (!driverId) {
    redirectWorksheet(returnDate, "error", "driver_required", loadId);
  }

  if (!vehicleId) {
    redirectWorksheet(returnDate, "error", "vehicle_required", loadId);
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, loadId),
      eq(jobLoads.organisationId, organisationId),
    ),
    columns: {
      id: true,
      jobId: true,
      status: true,
    },
  });

  if (!load) {
    redirectWorksheet(returnDate, "error", "load_not_found", loadId);
  }

  if (
    load.status === "completed" ||
    load.status === "rejected" ||
    load.status === "cancelled"
  ) {
    redirectWorksheet(returnDate, "error", "load_is_terminal", load.id);
  }

  if (
    haulierCounterpartyId &&
    !(await activeHaulier(organisationId, haulierCounterpartyId))
  ) {
    redirectWorksheet(returnDate, "error", "invalid_haulier", load.id);
  }

  const [driver, vehicle] = await Promise.all([
    database.query.drivers.findFirst({
      where: and(
        eq(drivers.id, driverId),
        eq(drivers.organisationId, organisationId),
        eq(drivers.isActive, true),
      ),
      columns: {
        id: true,
        haulierCounterpartyId: true,
      },
    }),
    database.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, vehicleId),
        eq(vehicles.organisationId, organisationId),
        eq(vehicles.isActive, true),
      ),
      columns: {
        id: true,
        haulierCounterpartyId: true,
      },
    }),
  ]);

  if (!driver) {
    redirectWorksheet(returnDate, "error", "invalid_driver", load.id);
  }

  if (!vehicle) {
    redirectWorksheet(returnDate, "error", "invalid_vehicle", load.id);
  }

  if (driver.haulierCounterpartyId !== haulierCounterpartyId) {
    redirectWorksheet(
      returnDate,
      "error",
      haulierCounterpartyId
        ? "driver_not_for_haulier"
        : "driver_not_for_own_transport",
      load.id,
    );
  }

  if (vehicle.haulierCounterpartyId !== haulierCounterpartyId) {
    redirectWorksheet(
      returnDate,
      "error",
      haulierCounterpartyId
        ? "vehicle_not_for_haulier"
        : "vehicle_not_for_own_transport",
      load.id,
    );
  }

  /*
    This updates the factual Load only, not the parent Job's planned/default
    haulier. That lets Load 2 use a different carrier/own vehicle at the last
    minute while Loads 1 and 3 remain part of the same Job.
  */
  await database
    .update(jobLoads)
    .set({
      haulierCounterpartyId,
      driverId: driver.id,
      vehicleId: vehicle.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(jobLoads.id, load.id),
        eq(jobLoads.organisationId, organisationId),
      ),
    );

  revalidatePath("/home/worksheet");
  revalidatePath("/home/jobs");
  revalidatePath(`/home/jobs/${load.jobId}`);

  redirectWorksheet(returnDate, "success", "transport_assigned", load.id);
}

export type WorksheetDriverCreateResult =
  | {
      ok: true;
      driver: {
        id: string;
        name: string;
        haulierCounterpartyId: string | null;
      };
    }
  | { ok: false; error: string };

export async function createWorksheetDriverAction(
  formData: FormData,
): Promise<WorksheetDriverCreateResult> {
  const contextResult = await getOperationsContext();
  if (!contextResult.ok) return { ok: false, error: contextResult.error };

  const { organisationId } = contextResult.data;
  const name = cleanString(formData.get("name"));
  const telephone = optionalString(formData.get("telephone"));
  const email = optionalString(formData.get("email"));
  const haulierCounterpartyId = optionalString(
    formData.get("haulierCounterpartyId"),
  );

  if (!name) return { ok: false, error: "Driver name is required." };

  if (
    haulierCounterpartyId &&
    !(await activeHaulier(organisationId, haulierCounterpartyId))
  ) {
    return { ok: false, error: "That haulier is no longer available." };
  }

  const [created] = await database
    .insert(drivers)
    .values({
      organisationId,
      haulierCounterpartyId,
      name,
      telephone,
      email,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: drivers.id,
      name: drivers.name,
      haulierCounterpartyId: drivers.haulierCounterpartyId,
    });

  if (!created) {
    return { ok: false, error: "The driver could not be created." };
  }

  revalidatePath("/home/worksheet");
  revalidatePath("/home/hauliers");

  return { ok: true, driver: created };
}

export type WorksheetVehicleCreateResult =
  | {
      ok: true;
      vehicle: {
        id: string;
        registrationNumber: string;
        vehicleType: string | null;
        haulierCounterpartyId: string | null;
      };
    }
  | { ok: false; error: string };

export async function createWorksheetVehicleAction(
  formData: FormData,
): Promise<WorksheetVehicleCreateResult> {
  const contextResult = await getOperationsContext();
  if (!contextResult.ok) return { ok: false, error: contextResult.error };

  const { organisationId } = contextResult.data;
  const registrationNumber = normaliseVehicleRegistration(
    formData.get("registrationNumber"),
  );
  const vehicleType = optionalString(formData.get("vehicleType"));
  const haulierCounterpartyId = optionalString(
    formData.get("haulierCounterpartyId"),
  );

  if (!registrationNumber) {
    return { ok: false, error: "Vehicle registration is required." };
  }

  if (
    haulierCounterpartyId &&
    !(await activeHaulier(organisationId, haulierCounterpartyId))
  ) {
    return { ok: false, error: "That haulier is no longer available." };
  }

  const duplicate = await database.query.vehicles.findFirst({
    where: and(
      eq(vehicles.organisationId, organisationId),
      eq(vehicles.registrationNumber, registrationNumber),
    ),
    columns: { id: true },
  });

  if (duplicate) {
    return {
      ok: false,
      error: "That vehicle registration already exists. Select it from the list.",
    };
  }

  const [created] = await database
    .insert(vehicles)
    .values({
      organisationId,
      haulierCounterpartyId,
      registrationNumber,
      vehicleType,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning({
      id: vehicles.id,
      registrationNumber: vehicles.registrationNumber,
      vehicleType: vehicles.vehicleType,
      haulierCounterpartyId: vehicles.haulierCounterpartyId,
    });

  if (!created) {
    return { ok: false, error: "The vehicle could not be created." };
  }

  revalidatePath("/home/worksheet");
  revalidatePath("/home/hauliers");

  return { ok: true, vehicle: created };
}
