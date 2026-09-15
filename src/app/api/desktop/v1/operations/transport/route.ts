import { and, asc, eq, ne } from "drizzle-orm";
import { z } from "zod";

import { database } from "@/db/database";
import {
  counterparties,
  counterpartyRoles,
  drivers,
  vehicles,
} from "@/db/schema";
import {
  requireClientApiContext,
  requireOperationsRole,
} from "@/lib/client-api/auth";
import { recordSyncChange } from "@/lib/client-api/change-feed";
import {
  clientApiError,
  clientApiJson,
  handleClientApiError,
} from "@/lib/client-api/http";

export const dynamic = "force-dynamic";

/* WASTE_X_DESKTOP_CLIENT_STABLE_MASTER_IDS_V1 */

const nullableText = z.string().trim().max(4000).nullable().optional();

const driverDataSchema = z.object({
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1).max(300),
  telephone: nullableText,
  email: nullableText,
  haulierCounterpartyId: z.string().trim().min(1).nullable().optional(),
  defaultVehicleId: z.string().trim().min(1).nullable().optional(),
  notes: nullableText,
});

const vehicleDataSchema = z.object({
  id: z.string().trim().min(1).optional(),
  registrationNumber: z.string().trim().min(1).max(100),
  vehicleType: nullableText,
  haulierCounterpartyId: z.string().trim().min(1).nullable().optional(),
  tareWeightKg: z.string().trim().max(50).nullable().optional(),
  notes: nullableText,
});

const mutationSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("driver.create"),
    data: driverDataSchema,
  }),
  z.object({
    operation: z.literal("driver.update"),
    data: driverDataSchema.extend({ id: z.string().trim().min(1) }),
  }),
  z.object({
    operation: z.literal("driver.archive"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("driver.restore"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("vehicle.create"),
    data: vehicleDataSchema,
  }),
  z.object({
    operation: z.literal("vehicle.update"),
    data: vehicleDataSchema.extend({ id: z.string().trim().min(1) }),
  }),
  z.object({
    operation: z.literal("vehicle.archive"),
    id: z.string().trim().min(1),
  }),
  z.object({
    operation: z.literal("vehicle.restore"),
    id: z.string().trim().min(1),
  }),
]);

function nullable(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  return clean || null;
}

function normaliseRegistration(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

function normaliseTare(value: string | null | undefined) {
  const clean = value?.trim() ?? "";
  if (!clean) return { ok: true as const, value: null };

  const parsed = Number(clean);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { ok: false as const };
  }

  return { ok: true as const, value: parsed.toFixed(3) };
}

async function activeHaulier(
  organisationId: string,
  haulierId: string | null,
) {
  if (!haulierId) return null;

  const rows = await database
    .select({
      id: counterparties.id,
      name: counterparties.name,
    })
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
        eq(counterparties.id, haulierId),
        eq(counterparties.organisationId, organisationId),
        eq(counterparties.isActive, true),
      ),
    )
    .limit(1);

  return rows[0] ?? null;
}

async function readTransportMasterData(organisationId: string) {
  const [hauliers, driverRows, vehicleRows] = await Promise.all([
    database
      .select({
        id: counterparties.id,
        name: counterparties.name,
        carrierRegistrationNumber:
          counterparties.carrierRegistrationNumber,
        isActive: counterparties.isActive,
      })
      .from(counterparties)
      .innerJoin(
        counterpartyRoles,
        and(
          eq(counterpartyRoles.counterpartyId, counterparties.id),
          eq(counterpartyRoles.organisationId, organisationId),
          eq(counterpartyRoles.role, "haulier"),
        ),
      )
      .where(eq(counterparties.organisationId, organisationId))
      .orderBy(asc(counterparties.name)),

    database
      .select({
        id: drivers.id,
        name: drivers.name,
        telephone: drivers.telephone,
        email: drivers.email,
        haulierCounterpartyId: drivers.haulierCounterpartyId,
        defaultVehicleId: drivers.defaultVehicleId,
        isActive: drivers.isActive,
        notes: drivers.notes,
        linkedUserId: drivers.linkedUserId,
        mobileAccessStatus: drivers.mobileAccessStatus,
        createdAt: drivers.createdAt,
        updatedAt: drivers.updatedAt,
      })
      .from(drivers)
      .where(eq(drivers.organisationId, organisationId))
      .orderBy(asc(drivers.name)),

    database
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
        vehicleType: vehicles.vehicleType,
        haulierCounterpartyId: vehicles.haulierCounterpartyId,
        tareWeightKg: vehicles.tareWeightKg,
        isActive: vehicles.isActive,
        notes: vehicles.notes,
        createdAt: vehicles.createdAt,
        updatedAt: vehicles.updatedAt,
      })
      .from(vehicles)
      .where(eq(vehicles.organisationId, organisationId))
      .orderBy(asc(vehicles.registrationNumber)),
  ]);

  return {
    hauliers,
    drivers: driverRows,
    vehicles: vehicleRows,
  };
}

async function publishChange(input: {
  organisationId: string;
  siteId: string | null;
  entityType: "driver" | "vehicle";
  entityId: string;
  payload: unknown;
}) {
  try {
    await recordSyncChange({
      organisationId: input.organisationId,
      siteId: input.siteId,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload,
    });
    return false;
  } catch (error) {
    console.error("[DESKTOP_MASTER_DATA_CHANGE_FEED]", {
      entityType: input.entityType,
      entityId: input.entityId,
      error,
    });
    return true;
  }
}

export async function GET(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    return clientApiJson({
      ok: true,
      ...(await readTransportMasterData(context.organisationId)),
      boundary: {
        mobileAccessAdministration: "WEB_ONLY",
        dwtCarrierAdministration: "WEB_ONLY",
      },
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireClientApiContext(request);
    requireOperationsRole(context);

    const parsed = mutationSchema.safeParse(await request.json());

    if (!parsed.success) {
      return clientApiError(
        "INVALID_TRANSPORT_MASTER_DATA",
        400,
        "The Driver / Vehicle details are invalid.",
        parsed.error.flatten(),
      );
    }

    const mutation = parsed.data;
    let changedType: "driver" | "vehicle";
    let changedId: string;
    let action: "created" | "updated" | "archived" | "restored";

    if (
      mutation.operation === "driver.create" ||
      mutation.operation === "driver.update"
    ) {
      const data = mutation.data;
      const haulierId = data.haulierCounterpartyId ?? null;
      const defaultVehicleId = data.defaultVehicleId ?? null;

      if (haulierId) {
        const haulier = await activeHaulier(
          context.organisationId,
          haulierId,
        );

        if (!haulier) {
          return clientApiError(
            "INVALID_HAULIER",
            400,
            "Choose a valid active haulier.",
          );
        }
      }

      if (defaultVehicleId) {
        const vehicle = await database.query.vehicles.findFirst({
          where: and(
            eq(vehicles.id, defaultVehicleId),
            eq(vehicles.organisationId, context.organisationId),
            eq(vehicles.isActive, true),
          ),
        });

        if (!vehicle) {
          return clientApiError(
            "INVALID_DEFAULT_VEHICLE",
            400,
            "Choose a valid active default Vehicle.",
          );
        }

        if (
          haulierId &&
          vehicle.haulierCounterpartyId &&
          vehicle.haulierCounterpartyId !== haulierId
        ) {
          return clientApiError(
            "VEHICLE_HAULIER_MISMATCH",
            400,
            "The default Vehicle belongs to a different haulier.",
          );
        }
      }

      if (mutation.operation === "driver.create") {
        const requestedId = data.id ?? null;
        const existingRequested = requestedId
          ? await database.query.drivers.findFirst({
              where: and(
                eq(drivers.id, requestedId),
                eq(drivers.organisationId, context.organisationId),
              ),
              columns: { id: true },
            })
          : null;

        if (existingRequested) {
          // Response-loss safe: retrying the same locally-generated id is a duplicate success.
          changedType = "driver";
          changedId = existingRequested.id;
          action = "created";
        } else {
          const [created] = await database
            .insert(drivers)
            .values({
              ...(requestedId ? { id: requestedId } : {}),
              organisationId: context.organisationId,
              haulierCounterpartyId: haulierId,
              name: data.name.trim(),
              telephone: nullable(data.telephone),
              email: nullable(data.email),
              defaultVehicleId,
              isActive: true,
              notes: nullable(data.notes),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: drivers.id });

          if (!created) {
            return clientApiError(
              "DRIVER_CREATE_FAILED",
              500,
              "Waste X could not create the Driver.",
            );
          }

          changedType = "driver";
          changedId = created.id;
          action = "created";
        }
      } else {
        const existing = await database.query.drivers.findFirst({
          where: and(
            eq(drivers.id, mutation.data.id),
            eq(drivers.organisationId, context.organisationId),
          ),
          columns: { id: true },
        });

        if (!existing) {
          return clientApiError(
            "DRIVER_NOT_FOUND",
            404,
            "That Driver was not found.",
          );
        }

        await database
          .update(drivers)
          .set({
            name: data.name.trim(),
            telephone: nullable(data.telephone),
            email: nullable(data.email),
            haulierCounterpartyId: haulierId,
            defaultVehicleId,
            notes: nullable(data.notes),
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(drivers.id, mutation.data.id),
              eq(drivers.organisationId, context.organisationId),
            ),
          );

        changedType = "driver";
        changedId = mutation.data.id;
        action = "updated";
      }
    } else if (
      mutation.operation === "driver.archive" ||
      mutation.operation === "driver.restore"
    ) {
      const existing = await database.query.drivers.findFirst({
        where: and(
          eq(drivers.id, mutation.id),
          eq(drivers.organisationId, context.organisationId),
        ),
        columns: { id: true },
      });

      if (!existing) {
        return clientApiError(
          "DRIVER_NOT_FOUND",
          404,
          "That Driver was not found.",
        );
      }

      const restoring = mutation.operation === "driver.restore";

      await database
        .update(drivers)
        .set({
          isActive: restoring,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(drivers.id, mutation.id),
            eq(drivers.organisationId, context.organisationId),
          ),
        );

      changedType = "driver";
      changedId = mutation.id;
      action = restoring ? "restored" : "archived";
    } else if (
      mutation.operation === "vehicle.create" ||
      mutation.operation === "vehicle.update"
    ) {
      const data = mutation.data;
      const registrationNumber = normaliseRegistration(
        data.registrationNumber,
      );
      const haulierId = data.haulierCounterpartyId ?? null;
      const tare = normaliseTare(data.tareWeightKg);

      if (!registrationNumber) {
        return clientApiError(
          "REGISTRATION_REQUIRED",
          400,
          "Enter the Vehicle registration.",
        );
      }

      if (!tare.ok) {
        return clientApiError(
          "INVALID_TARE",
          400,
          "Stored tare must be a valid number of kilograms.",
        );
      }

      if (haulierId) {
        const haulier = await activeHaulier(
          context.organisationId,
          haulierId,
        );

        if (!haulier) {
          return clientApiError(
            "INVALID_HAULIER",
            400,
            "Choose a valid active haulier.",
          );
        }
      }

      const requestedVehicleId =
        mutation.operation === "vehicle.create" ? data.id ?? null : null;
      const existingRequestedVehicle = requestedVehicleId
        ? await database.query.vehicles.findFirst({
            where: and(
              eq(vehicles.id, requestedVehicleId),
              eq(vehicles.organisationId, context.organisationId),
            ),
            columns: { id: true },
          })
        : null;

      const duplicate = existingRequestedVehicle
        ? null
        : await database.query.vehicles.findFirst({
            where:
              mutation.operation === "vehicle.update"
                ? and(
                    eq(vehicles.organisationId, context.organisationId),
                    eq(vehicles.registrationNumber, registrationNumber),
                    ne(vehicles.id, mutation.data.id),
                  )
                : and(
                    eq(vehicles.organisationId, context.organisationId),
                    eq(vehicles.registrationNumber, registrationNumber),
                  ),
            columns: { id: true },
          });

      if (duplicate) {
        return clientApiError(
          "DUPLICATE_REGISTRATION",
          409,
          "That registration is already stored in Waste X.",
        );
      }

      if (mutation.operation === "vehicle.create") {
        if (existingRequestedVehicle) {
          // Response-loss safe: retrying the same locally-generated id is a duplicate success.
          changedType = "vehicle";
          changedId = existingRequestedVehicle.id;
          action = "created";
        } else {
          const [created] = await database
            .insert(vehicles)
            .values({
              ...(requestedVehicleId ? { id: requestedVehicleId } : {}),
              organisationId: context.organisationId,
              haulierCounterpartyId: haulierId,
              registrationNumber,
              vehicleType: nullable(data.vehicleType),
              tareWeightKg: tare.value,
              isActive: true,
              notes: nullable(data.notes),
              createdAt: new Date(),
              updatedAt: new Date(),
            })
            .returning({ id: vehicles.id });

          if (!created) {
            return clientApiError(
              "VEHICLE_CREATE_FAILED",
              500,
              "Waste X could not create the Vehicle.",
            );
          }

          changedType = "vehicle";
          changedId = created.id;
          action = "created";
        }
      } else {
        const existing = await database.query.vehicles.findFirst({
          where: and(
            eq(vehicles.id, mutation.data.id),
            eq(vehicles.organisationId, context.organisationId),
          ),
          columns: {
            id: true,
            haulierCounterpartyId: true,
          },
        });

        if (!existing) {
          return clientApiError(
            "VEHICLE_NOT_FOUND",
            404,
            "That Vehicle was not found.",
          );
        }

        await database.transaction(async (tx) => {
          await tx
            .update(vehicles)
            .set({
              registrationNumber,
              vehicleType: nullable(data.vehicleType),
              haulierCounterpartyId: haulierId,
              tareWeightKg: tare.value,
              notes: nullable(data.notes),
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vehicles.id, mutation.data.id),
                eq(vehicles.organisationId, context.organisationId),
              ),
            );

          if (existing.haulierCounterpartyId !== haulierId) {
            await tx
              .update(drivers)
              .set({
                defaultVehicleId: null,
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(drivers.organisationId, context.organisationId),
                  eq(drivers.defaultVehicleId, mutation.data.id),
                ),
              );
          }
        });

        changedType = "vehicle";
        changedId = mutation.data.id;
        action = "updated";
      }
    } else {
      const existing = await database.query.vehicles.findFirst({
        where: and(
          eq(vehicles.id, mutation.id),
          eq(vehicles.organisationId, context.organisationId),
        ),
        columns: { id: true },
      });

      if (!existing) {
        return clientApiError(
          "VEHICLE_NOT_FOUND",
          404,
          "That Vehicle was not found.",
        );
      }

      const restoring = mutation.operation === "vehicle.restore";

      if (restoring) {
        await database
          .update(vehicles)
          .set({
            isActive: true,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(vehicles.id, mutation.id),
              eq(vehicles.organisationId, context.organisationId),
            ),
          );
      } else {
        await database.transaction(async (tx) => {
          await tx
            .update(vehicles)
            .set({
              isActive: false,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(vehicles.id, mutation.id),
                eq(vehicles.organisationId, context.organisationId),
              ),
            );

          await tx
            .update(drivers)
            .set({
              defaultVehicleId: null,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(drivers.organisationId, context.organisationId),
                eq(drivers.defaultVehicleId, mutation.id),
              ),
            );
        });
      }

      changedType = "vehicle";
      changedId = mutation.id;
      action = restoring ? "restored" : "archived";
    }

    const changed =
      changedType === "driver"
        ? await database.query.drivers.findFirst({
            where: and(
              eq(drivers.id, changedId),
              eq(drivers.organisationId, context.organisationId),
            ),
          })
        : await database.query.vehicles.findFirst({
            where: and(
              eq(vehicles.id, changedId),
              eq(vehicles.organisationId, context.organisationId),
            ),
          });

    if (!changed) {
      throw new Error(
        "Waste X changed master data but could not verify the canonical record.",
      );
    }

    const syncFeedWarning = await publishChange({
      organisationId: context.organisationId,
      siteId: context.defaultSiteId ?? null,
      entityType: changedType,
      entityId: changedId,
      payload: changed,
    });

    return clientApiJson({
      ok: true,
      action,
      entityType: changedType,
      entityId: changedId,
      syncFeedWarning,
      data: await readTransportMasterData(context.organisationId),
    });
  } catch (error) {
    return handleClientApiError(error);
  }
}
