import { and, eq } from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads, users } from "@/db/schema";

export type WeighbridgeTicketData = {
  ticketNumber: string;
  jobNumber: string;
  loadNumber: number;
  direction: "incoming" | "outgoing";
  status: string;

  organisationName: string;
  organisationAddress: string;

  siteName: string;
  siteAddress: string;
  permitNumber: string;

  customerName: string;
  customerAddress: string;

  carrierName: string;
  carrierRegistrationNumber: string;
  driverName: string;
  vehicleRegistration: string;

  ewcCode: string;
  wasteDescription: string;

  grossWeight: string | null;
  tareWeight: string | null;
  netWeight: string | null;
  weightMetric: "Grams" | "Kilograms" | "Tonnes";
  weightIsEstimate: boolean;
  weightSource: string;

  arrivedAt: Date | null;
  movementAt: Date | null;
  completedAt: Date | null;

  purchaseOrder: string;
  customerReference: string;
  notes: string;
};

function clean(value: string | null | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

function organisationAddress(org: {
  streetAddress: string;
  city: string;
  region: string;
  postCode: string;
  country: string;
}) {
  return [
    org.streetAddress,
    org.city,
    org.region,
    org.postCode,
    org.country,
  ]
    .map((part) => clean(part))
    .filter(Boolean)
    .join(", ");
}

export async function getWeighbridgeTicketData(params: {
  userId: string;
  loadId: string;
}): Promise<WeighbridgeTicketData | null> {
  const currentUser = await database.query.users.findFirst({
    where: eq(users.id, params.userId),
    columns: {
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
    return null;
  }

  const load = await database.query.jobLoads.findFirst({
    where: and(
      eq(jobLoads.id, params.loadId),
      eq(jobLoads.organisationId, currentUser.organisationId),
    ),
    with: {
      organisation: true,
      job: true,
      client: true,
      clientSite: true,
      ownSite: true,
      sitePermit: true,
      haulier: true,
      driver: true,
      vehicle: true,
      materialProfile: {
        with: {
          ewcCode: true,
        },
      },
      thirdPartyDestinationSite: {
        with: {
          counterparty: true,
        },
      },
    },
  });

  if (!load || load.status !== "completed") {
    return null;
  }

  const job = load.job;
  const ownSite = load.ownSite;
  const externalDestination = load.thirdPartyDestinationSite;

  const customerName =
    load.direction === "incoming"
      ? load.client?.name ?? "Not recorded"
      : externalDestination?.counterparty?.name ?? "Not recorded";

  const customerAddress =
    load.direction === "incoming"
      ? load.clientSite?.fullAddress ??
        load.clientSite?.postcode ??
        "Not recorded"
      : externalDestination?.fullAddress ??
        externalDestination?.postcode ??
        "Not recorded";

  const siteName =
    load.direction === "incoming"
      ? ownSite?.name ?? "Not recorded"
      : externalDestination?.name ?? "Not recorded";

  const siteAddress =
    load.direction === "incoming"
      ? ownSite?.fullAddress ?? ownSite?.postcode ?? "Not recorded"
      : externalDestination?.fullAddress ??
        externalDestination?.postcode ??
        "Not recorded";

  // Keep the fallback aligned with the existing DWT receipt reference.
  const generatedTicketNumber = `WX-${job.jobNumber}-L${load.loadNumber}`;

  return {
    ticketNumber: clean(load.ticketNumber) || generatedTicketNumber,
    jobNumber: job.jobNumber,
    loadNumber: load.loadNumber,
    direction: load.direction,
    status: load.status,

    organisationName: load.organisation.teamName,
    organisationAddress: organisationAddress(load.organisation),

    siteName,
    siteAddress,
    permitNumber: load.sitePermit?.permitNumber ?? "Not recorded",

    customerName,
    customerAddress,

    carrierName: load.haulier?.name ?? load.organisation.teamName,
    carrierRegistrationNumber:
      load.haulier?.carrierRegistrationNumber ?? "Not recorded",
    driverName: load.driver?.name ?? "Not recorded",
    vehicleRegistration: load.vehicle?.registrationNumber ?? "Not recorded",

    ewcCode:
      clean(load.ewcCodeSnapshot) ||
      load.materialProfile?.ewcCode?.code ||
      "Not recorded",
    wasteDescription:
      clean(load.wasteDescriptionSnapshot) ||
      load.materialProfile?.wasteDescription ||
      "Not recorded",

    grossWeight: load.grossWeight,
    tareWeight: load.tareWeight,
    netWeight: load.netWeight,
    weightMetric: load.weightMetric,
    weightIsEstimate: load.weightIsEstimate,
    weightSource: load.weightSource,

    arrivedAt: load.receivedAt,
    movementAt: load.movementAt,
    completedAt: load.completedAt,

    purchaseOrder: clean(load.purchaseOrder ?? job.purchaseOrder),
    customerReference: clean(
      load.customerReference ?? job.customerReference,
    ),
    notes: clean(load.notes),
  };
}
