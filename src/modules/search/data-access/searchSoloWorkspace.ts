import { and, eq, ilike, or } from "drizzle-orm";

import { database } from "@/db/database";
import {
  counterparties,
  drivers,
  jobs,
  materialProfiles,
  sites,
  vehicles,
  wasteTrackingSubmissions,
} from "@/db/schema";

export type SoloSearchResultType =
  | "job"
  | "client"
  | "haulier"
  | "counterparty"
  | "material"
  | "driver"
  | "vehicle"
  | "receiving_site"
  | "dwt";

export type SoloSearchResult = {
  id: string;
  type: SoloSearchResultType;
  title: string;
  subtitle: string;
  reference: string;
  href: string;
};

export type SoloSearchResponse = {
  query: string;
  results: SoloSearchResult[];
  groups: Record<SoloSearchResultType, SoloSearchResult[]>;
};

function emptyGroups(): SoloSearchResponse["groups"] {
  return {
    job: [],
    client: [],
    haulier: [],
    counterparty: [],
    material: [],
    driver: [],
    vehicle: [],
    receiving_site: [],
    dwt: [],
  };
}

function cleanQuery(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function counterpartyType(roles: { role: string }[]): SoloSearchResultType {
  if (roles.some((row) => row.role === "client")) return "client";
  if (roles.some((row) => row.role === "haulier")) return "haulier";
  return "counterparty";
}

function counterpartyHref(type: SoloSearchResultType, id: string) {
  if (type === "client") return `/home/clients/${id}`;
  if (type === "haulier") return `/home/hauliers/${id}`;
  return "/home/clients";
}

export async function searchSoloWorkspace(params: {
  organisationId: string;
  query: string;
  limitPerGroup?: number;
}): Promise<SoloSearchResponse> {
  const query = cleanQuery(params.query);
  const limit = Math.max(3, Math.min(params.limitPerGroup ?? 8, 20));
  const groups = emptyGroups();

  if (query.length < 2) {
    return {
      query,
      results: [],
      groups,
    };
  }

  const pattern = `%${query}%`;

  const [jobRows, counterpartyRows, materialRows, driverRows, vehicleRows, siteRows, dwtRows] =
    await Promise.all([
      database.query.jobs.findMany({
        where: and(
          eq(jobs.organisationId, params.organisationId),
          or(
            ilike(jobs.jobNumber, pattern),
            ilike(jobs.purchaseOrder, pattern),
            ilike(jobs.customerReference, pattern),
          ),
        ),
        with: {
          client: true,
          clientSite: true,
        },
        limit,
      }),

      database.query.counterparties.findMany({
        where: and(
          eq(counterparties.organisationId, params.organisationId),
          or(
            ilike(counterparties.name, pattern),
            ilike(counterparties.accountReference, pattern),
            ilike(counterparties.postcode, pattern),
          ),
        ),
        with: {
          roles: true,
        },
        limit: limit * 2,
      }),

      database.query.materialProfiles.findMany({
        where: and(
          eq(materialProfiles.organisationId, params.organisationId),
          or(
            ilike(materialProfiles.name, pattern),
            ilike(materialProfiles.wasteDescription, pattern),
          ),
        ),
        with: {
          ewcCode: true,
        },
        limit,
      }),

      database.query.drivers.findMany({
        where: and(
          eq(drivers.organisationId, params.organisationId),
          ilike(drivers.name, pattern),
        ),
        with: {
          haulier: true,
        },
        limit,
      }),

      database.query.vehicles.findMany({
        where: and(
          eq(vehicles.organisationId, params.organisationId),
          or(
            ilike(vehicles.registrationNumber, pattern),
            ilike(vehicles.vehicleType, pattern),
          ),
        ),
        with: {
          haulier: true,
        },
        limit,
      }),

      database.query.sites.findMany({
        where: and(
          eq(sites.organisationId, params.organisationId),
          eq(sites.siteType, "waste_receiving_site"),
          or(
            ilike(sites.name, pattern),
            ilike(sites.postcode, pattern),
            ilike(sites.fullAddress, pattern),
          ),
        ),
        limit,
      }),

      database.query.wasteTrackingSubmissions.findMany({
        where: and(
          eq(wasteTrackingSubmissions.organisationId, params.organisationId),
          ilike(wasteTrackingSubmissions.wasteTrackingId, pattern),
        ),
        with: {
          jobLoad: {
            with: {
              job: true,
            },
          },
        },
        limit,
      }),
    ]);

  for (const job of jobRows) {
    groups.job.push({
      id: job.id,
      type: "job",
      title: job.jobNumber,
      subtitle: [job.client?.name, job.clientSite?.name]
        .filter(Boolean)
        .join(" · ") || "Waste X job",
      reference: job.purchaseOrder ?? job.customerReference ?? job.status,
      href: `/home/jobs/${job.id}`,
    });
  }

  for (const counterparty of counterpartyRows) {
    const type = counterpartyType(counterparty.roles);
    const result: SoloSearchResult = {
      id: counterparty.id,
      type,
      title: counterparty.name,
      subtitle:
        type === "client"
          ? "Client"
          : type === "haulier"
            ? "Haulier"
            : "Business contact",
      reference:
        counterparty.accountReference ??
        counterparty.carrierRegistrationNumber ??
        counterparty.postcode ??
        "",
      href: counterpartyHref(type, counterparty.id),
    };

    groups[type].push(result);
  }

  for (const material of materialRows) {
    groups.material.push({
      id: material.id,
      type: "material",
      title: material.name,
      subtitle: material.wasteDescription,
      reference: material.ewcCode?.code
        ? `EWC ${material.ewcCode.code}`
        : "No EWC",
      href: "/home/materials",
    });
  }

  for (const driver of driverRows) {
    groups.driver.push({
      id: driver.id,
      type: "driver",
      title: driver.name,
      subtitle: driver.haulier?.name ?? "Own driver",
      reference: "Driver",
      href: `/home/transport/drivers/${driver.id}`,
    });
  }

  for (const vehicle of vehicleRows) {
    groups.vehicle.push({
      id: vehicle.id,
      type: "vehicle",
      title: vehicle.registrationNumber,
      subtitle: vehicle.haulier?.name ?? "Own vehicle",
      reference: vehicle.vehicleType ?? "Vehicle",
      href: `/home/transport/vehicles/${vehicle.id}`,
    });
  }

  for (const site of siteRows) {
    groups.receiving_site.push({
      id: site.id,
      type: "receiving_site",
      title: site.name,
      subtitle: site.fullAddress ?? "Receiving site",
      reference: site.postcode ?? "",
      href: "/home/sites",
    });
  }

  for (const submission of dwtRows) {
    const job = submission.jobLoad?.job;

    groups.dwt.push({
      id: submission.id,
      type: "dwt",
      title: submission.wasteTrackingId ?? "DWT submission",
      subtitle: job
        ? `${job.jobNumber}${
            submission.jobLoad?.loadNumber
              ? ` · Load ${submission.jobLoad.loadNumber}`
              : ""
          }`
        : "Digital Waste Tracking submission",
      reference: submission.status.replaceAll("_", " "),
      href: submission.jobLoadId
        ? `/home/dwt/intake/${submission.jobLoadId}`
        : "/home/dwt/submissions",
    });
  }

  const results = (Object.values(groups) as SoloSearchResult[][]).flat();

  return {
    query,
    results,
    groups,
  };
}
