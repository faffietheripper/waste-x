import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { and, eq, inArray, like } from "drizzle-orm";

loadEnvConfig(process.cwd());

const TARGET_EMAIL = "tino@wastextracking.com";
const DEMO_PREFIX = "WX-MOB-DEMO-";

function atDayOffset(days: number, hour: number, minute = 0) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  value.setHours(hour, minute, 0, 0);
  return value;
}

type DemoDefinition = {
  number: string;
  dayOffset: number;
  hour: number;
  jobStatus: "booked" | "completed";
  loadStatus: "planned" | "completed" | "rejected";
  customerReference: string;
  purchaseOrder: string;
  notes: string;
  grossWeight?: string;
  tareWeight?: string;
  netWeight?: string;
};

const DEMOS: DemoDefinition[] = [
  {
    number: "001",
    dayOffset: 0,
    hour: 8,
    jobStatus: "booked",
    loadStatus: "planned",
    customerReference: "MOBILE-A",
    purchaseOrder: "PO-MOB-001",
    notes: "Morning collection · driver operational demo.",
  },
  {
    number: "002",
    dayOffset: 0,
    hour: 10,
    jobStatus: "booked",
    loadStatus: "planned",
    customerReference: "MOBILE-B",
    purchaseOrder: "PO-MOB-002",
    notes: "Second collection · use this load for live Driver workflow testing.",
  },

  {
    number: "003",
    dayOffset: 0,
    hour: 11,
    jobStatus: "completed",
    loadStatus: "completed",
    customerReference: "MOBILE-C",
    purchaseOrder: "PO-MOB-003",
    notes: "Completed demo movement.",
    grossWeight: "27.800",
    tareWeight: "12.400",
    netWeight: "15.400",
  },
  {
    number: "004",
    dayOffset: 0,
    hour: 13,
    jobStatus: "completed",
    loadStatus: "completed",
    customerReference: "MOBILE-D",
    purchaseOrder: "PO-MOB-004",
    notes: "Completed demo movement.",
    grossWeight: "24.250",
    tareWeight: "11.900",
    netWeight: "12.350",
  },

  {
    number: "005",
    dayOffset: 0,
    hour: 14,
    jobStatus: "booked",
    loadStatus: "rejected",
    customerReference: "MOBILE-E",
    purchaseOrder: "PO-MOB-005",
    notes: "Demo rejected load · contamination reported before collection.",
  },
  {
    number: "006",
    dayOffset: 0,
    hour: 15,
    jobStatus: "booked",
    loadStatus: "rejected",
    customerReference: "MOBILE-F",
    purchaseOrder: "PO-MOB-006",
    notes: "Demo rejected load · collection refused.",
  },

  {
    number: "007",
    dayOffset: 1,
    hour: 9,
    jobStatus: "booked",
    loadStatus: "planned",
    customerReference: "MOBILE-G",
    purchaseOrder: "PO-MOB-007",
    notes: "Tomorrow morning collection.",
  },
  {
    number: "008",
    dayOffset: 3,
    hour: 11,
    jobStatus: "booked",
    loadStatus: "planned",
    customerReference: "MOBILE-H",
    purchaseOrder: "PO-MOB-008",
    notes: "Upcoming authorised collection.",
  },
];

async function main() {
  const { database } = await import("../src/db/database");
  const schema = await import("../src/db/schema");

  const {
    users,
    drivers,
    vehicles,
    sites,
    counterpartySites,
    jobs,
    jobLoads,
    syncEventInbox,
    syncEntityVersions,
  } = schema;

  /* =========================================================
     Resolve the actual authenticated Mobile identity.
  ========================================================= */

  const [user] = await database
    .select({
      id: users.id,
      email: users.email,
      organisationId: users.organisationId,
      role: users.role,
      isActive: users.isActive,
      isSuspended: users.isSuspended,
    })
    .from(users)
    .where(eq(users.email, TARGET_EMAIL))
    .limit(1);

  if (!user) {
    throw new Error(`No Waste X user exists for ${TARGET_EMAIL}`);
  }

  if (!user.organisationId) {
    throw new Error(`${TARGET_EMAIL} is not attached to an organisation.`);
  }

  if (!user.isActive || user.isSuspended) {
    throw new Error(`${TARGET_EMAIL} is not an active Waste X identity.`);
  }

  const linkedDrivers = await database
    .select({
      id: drivers.id,
      name: drivers.name,
      organisationId: drivers.organisationId,
      mobileAccessStatus: drivers.mobileAccessStatus,
      defaultVehicleId: drivers.defaultVehicleId,
    })
    .from(drivers)
    .where(
      and(
        eq(drivers.organisationId, user.organisationId),
        eq(drivers.linkedUserId, user.id),
        eq(drivers.isActive, true),
      ),
    )
    .limit(2);

  if (linkedDrivers.length !== 1) {
    throw new Error(
      `Expected exactly one active Driver linked to ${TARGET_EMAIL}; found ${linkedDrivers.length}.`,
    );
  }

  const driver = linkedDrivers[0]!;

  if (driver.mobileAccessStatus !== "ACTIVE") {
    throw new Error(
      `Driver Mobile Access must be ACTIVE before seeding. Current status: ${driver.mobileAccessStatus}`,
    );
  }

  /* =========================================================
     Resolve real organisation locations.

     We deliberately reuse the organisation's existing sites,
     rather than creating fake site master-data.
  ========================================================= */

  const [ownSite] = await database
    .select({
      id: sites.id,
      name: sites.name,
    })
    .from(sites)
    .where(eq(sites.organisationId, user.organisationId))
    .limit(1);

  if (!ownSite) {
    throw new Error(
      "This organisation has no Waste X own site. Create/configure a site before running the Mobile demo seed.",
    );
  }

  const [clientSite] = await database
    .select({
      id: counterpartySites.id,
      name: counterpartySites.name,
    })
    .from(counterpartySites)
    .where(eq(counterpartySites.organisationId, user.organisationId))
    .limit(1);

  if (!clientSite) {
    throw new Error(
      "This organisation has no counterparty/client site. Add one before running the Mobile demo seed.",
    );
  }

  let vehicleId = driver.defaultVehicleId;

  if (!vehicleId) {
    const [existingVehicle] = await database
      .select({
        id: vehicles.id,
        registrationNumber: vehicles.registrationNumber,
      })
      .from(vehicles)
      .where(eq(vehicles.organisationId, user.organisationId))
      .limit(1);

    vehicleId = existingVehicle?.id ?? null;
  }

  if (!vehicleId) {
    const [createdVehicle] = await database
      .insert(vehicles)
      .values({
        id: randomUUID(),
        organisationId: user.organisationId,
        registrationNumber: "WX26 DEM",
        vehicleType: "Demo vehicle",
        notes: "[Mobile Demo] Vehicle created for Tino Mobile UI testing.",
        isActive: true,
      })
      .returning({
        id: vehicles.id,
      });

    vehicleId = createdVehicle!.id;
  }

  /* =========================================================
     Seed atomically.

     Existing WX-MOB-DEMO-* jobs are removed first.

     Old Mobile workflow/version rows belonging to those demo
     loads are also removed, preventing a rerun from accidentally
     inheriting an earlier test journey.
  ========================================================= */

  await database.transaction(async (tx) => {
    const oldJobs = await tx
      .select({ id: jobs.id })
      .from(jobs)
      .where(
        and(
          eq(jobs.organisationId, user.organisationId!),
          like(jobs.jobNumber, `${DEMO_PREFIX}%`),
        ),
      );

    if (oldJobs.length > 0) {
      const oldJobIds = oldJobs.map((row) => row.id);

      const oldLoads = await tx
        .select({ id: jobLoads.id })
        .from(jobLoads)
        .where(inArray(jobLoads.jobId, oldJobIds));

      const oldLoadIds = oldLoads.map((row) => row.id);

      if (oldLoadIds.length > 0) {
        await tx
          .delete(syncEventInbox)
          .where(
            and(
              eq(syncEventInbox.organisationId, user.organisationId!),
              eq(syncEventInbox.entityType, "job_load"),
              inArray(syncEventInbox.entityId, oldLoadIds),
            ),
          );

        await tx
          .delete(syncEntityVersions)
          .where(
            and(
              eq(syncEntityVersions.organisationId, user.organisationId!),
              eq(syncEntityVersions.entityType, "job_load"),
              inArray(syncEntityVersions.entityId, oldLoadIds),
            ),
          );
      }

      await tx.delete(jobs).where(inArray(jobs.id, oldJobIds));
    }

    for (const demo of DEMOS) {
      const jobId = randomUUID();
      const loadId = randomUUID();
      const eventAt = atDayOffset(demo.dayOffset, demo.hour);

      const jobNumber = `${DEMO_PREFIX}${demo.number}`;

      await tx.insert(jobs).values({
        id: jobId,
        organisationId: user.organisationId!,
        jobNumber,

        source: "manual",
        direction: "incoming",
        status: demo.jobStatus,
        jobDate: eventAt,

        clientSiteId: clientSite.id,
        ownSiteId: ownSite.id,

        driverId: driver.id,
        vehicleId,

        plannedLoads: 1,

        purchaseOrder: demo.purchaseOrder,
        customerReference: demo.customerReference,

        notes: `[Mobile Demo] ${demo.notes}`,
        createdByUserId: user.id,

        completedAt:
          demo.jobStatus === "completed"
            ? new Date(eventAt.getTime() + 60 * 60 * 1000)
            : null,

        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(jobLoads).values({
        id: loadId,
        organisationId: user.organisationId!,
        jobId,
        loadNumber: 1,

        status: demo.loadStatus,
        direction: "incoming",

        movementAt:
          demo.loadStatus === "completed"
            ? eventAt
            : null,

        receivedAt:
          demo.loadStatus === "completed"
            ? new Date(eventAt.getTime() + 45 * 60 * 1000)
            : null,

        clientSiteId: clientSite.id,
        ownSiteId: ownSite.id,

        driverId: driver.id,
        vehicleId,

        ewcCodeSnapshot: "17 05 04",
        wasteDescriptionSnapshot:
          "Soil and stones other than those mentioned in 17 05 03",
        physicalFormSnapshot: "Solid",

        numberOfContainers: 1,
        containerTypeSnapshot: "SKI",

        containsPops: false,
        containsHazardous: false,

        grossWeight: demo.grossWeight ?? null,
        tareWeight: demo.tareWeight ?? null,
        netWeight: demo.netWeight ?? null,

        weightMetric: "Tonnes",
        weightIsEstimate: false,
        weightSource: "manual",

        purchaseOrder: demo.purchaseOrder,
        customerReference: demo.customerReference,

        notes: `[Mobile Demo] ${demo.notes}`,

        createdByUserId: user.id,

        completedAt:
          demo.loadStatus === "completed"
            ? new Date(eventAt.getTime() + 60 * 60 * 1000)
            : null,

        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  });

  console.log("");
  console.log("🔥 TINO MOBILE DEMO SEEDED");
  console.log(`User:       ${TARGET_EMAIL}`);
  console.log(`Driver:     ${driver.name}`);
  console.log(`Origin:     ${clientSite.name}`);
  console.log(`Destination:${ownSite.name}`);
  console.log("");
  console.log("Today:");
  console.log("  WX-MOB-DEMO-001  ASSIGNED");
  console.log("  WX-MOB-DEMO-002  ASSIGNED");
  console.log("");
  console.log("Completed:");
  console.log("  WX-MOB-DEMO-003  COMPLETED");
  console.log("  WX-MOB-DEMO-004  COMPLETED");
  console.log("");
  console.log("Rejected:");
  console.log("  WX-MOB-DEMO-005  REJECTED");
  console.log("  WX-MOB-DEMO-006  REJECTED");
  console.log("");
  console.log("Upcoming:");
  console.log("  WX-MOB-DEMO-007  TOMORROW");
  console.log("  WX-MOB-DEMO-008  +3 DAYS");
  console.log("");
  console.log("Pull to refresh Waste X Mobile.");
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("");
    console.error("❌ Tino Mobile demo seed failed");
    console.error(error);
    process.exit(1);
  });
