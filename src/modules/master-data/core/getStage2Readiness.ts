// src/modules/master-data/core/getStage2Readiness.ts

import type {
  SoloMasterData,
} from "./getSoloMasterData";

export type ReadinessState =
  | "ready"
  | "warning"
  | "missing";

export type ReadinessCheck = {
  key: string;
  label: string;
  detail: string;
  state: ReadinessState;
  href: string;
  blocking: boolean;
};

export function getStage2Readiness(
  data: SoloMasterData,
) {
  const permittedEwcIds =
    new Set(
      data.permittedEwcCodes.map(
        (ewc) => ewc.id,
      ),
    );

  const materialProfilesNotPermitted =
    data.materials.filter(
      (material) =>
        !permittedEwcIds.has(
          material.ewcCodeId,
        ),
    );

  const activeSiteCountByClient =
    new Map<string, number>();

  for (const site of data.clientSites) {
    activeSiteCountByClient.set(
      site.counterpartyId,
      (activeSiteCountByClient.get(
        site.counterpartyId,
      ) ?? 0) + 1,
    );
  }

  const clientsWithoutSites =
    data.clients.filter(
      (client) =>
        !activeSiteCountByClient.get(
          client.id,
        ),
    );

  const activeHaulierIds =
    new Set(
      data.hauliers.map(
        (haulier) => haulier.id,
      ),
    );

  const ownDrivers = data.drivers.filter(
    (driver) => driver.haulierCounterpartyId === null,
  );

  const externalDrivers = data.drivers.filter(
    (driver) => driver.haulierCounterpartyId !== null,
  );

  const ownVehicles = data.vehicles.filter(
    (vehicle) => vehicle.haulierCounterpartyId === null,
  );

  const externalVehicles = data.vehicles.filter(
    (vehicle) => vehicle.haulierCounterpartyId !== null,
  );

  const driversWithUnknownHaulier =
    data.drivers.filter(
      (driver) =>
        driver.haulierCounterpartyId &&
        !activeHaulierIds.has(
          driver.haulierCounterpartyId,
        ),
    );

  const vehicleById =
    new Map(
      data.vehicles.map(
        (vehicle) => [
          vehicle.id,
          vehicle,
        ],
      ),
    );

  const driversWithMissingDefaultVehicle =
    data.drivers.filter(
      (driver) =>
        driver.defaultVehicleId &&
        !vehicleById.has(
          driver.defaultVehicleId,
        ),
    );

  const primaryExternalAuthorisations =
    data.externalAuthorisations.filter(
      (authorisation) =>
        authorisation.isPrimary &&
        authorisation.status ===
          "active",
    );

  const externalFacilityIdsWithActiveAuthorisation =
    new Set(
      primaryExternalAuthorisations.map(
        (authorisation) =>
          authorisation.counterpartySiteId,
      ),
    );

  const externalFacilitiesWithoutActiveAuthorisation =
    data.externalFacilities.filter(
      (facility) =>
        !externalFacilityIdsWithActiveAuthorisation.has(
          facility.id,
        ),
    );

  const externalAuthorisationIdsWithEwc =
    new Set(
      data.externalFacilityEwcCodes.map(
        (link) =>
          link.authorisationId,
      ),
    );

  const externalAuthorisationsWithoutEwc =
    primaryExternalAuthorisations.filter(
      (authorisation) =>
        !externalAuthorisationIdsWithEwc.has(
          authorisation.id,
        ),
    );

  const checks: ReadinessCheck[] = [
    {
      key: "receiving-site",
      label:
        "Receiving site",
      detail:
        data.receivingSite
          ? data.receivingSite.name
          : "No active primary receiving site configured.",
      state:
        data.receivingSite
          ? "ready"
          : "missing",
      href: "/home/sites",
      blocking: true,
    },

    {
      key: "permit",
      label:
        "Environmental permit",
      detail:
        data.primaryPermit
          ? data.primaryPermit.permitNumber
          : "No active primary permit configured for the receiving site.",
      state:
        data.primaryPermit
          ? "ready"
          : "missing",
      href: data.receivingSite
        ? `/home/sites/${data.receivingSite.id}`
        : "/home/sites",
      blocking: true,
    },

    {
      key: "permitted-ewc",
      label:
        "Permitted EWC codes",
      detail:
        data.permittedEwcCodes.length > 0
          ? `${data.permittedEwcCodes.length} EWC code${
              data.permittedEwcCodes.length === 1
                ? ""
                : "s"
            } configured against the receiving-site permit.`
          : "No EWC codes are configured against the active permit.",
      state:
        data.permittedEwcCodes.length > 0
          ? "ready"
          : "missing",
      href: data.receivingSite
        ? `/home/sites/${data.receivingSite.id}`
        : "/home/sites",
      blocking: true,
    },

    {
      key: "materials",
      label:
        "Material profiles",
      detail:
        data.materials.length > 0
          ? `${data.materials.length} active material profile${
              data.materials.length === 1
                ? ""
                : "s"
            } ready for reuse.`
          : "No active material profiles exist.",
      state:
        data.materials.length > 0
          ? "ready"
          : "missing",
      href: "/home/materials",
      blocking: true,
    },

    {
      key: "material-permit-match",
      label:
        "Material ↔ permit compatibility",
      detail:
        materialProfilesNotPermitted.length === 0
          ? "Every active material profile is currently configured on the receiving-site permit."
          : `${materialProfilesNotPermitted.length} active material profile${
              materialProfilesNotPermitted.length === 1
                ? " is"
                : "s are"
            } not currently configured on the receiving-site permit.`,
      state:
        data.materials.length === 0
          ? "missing"
          : materialProfilesNotPermitted.length === 0
            ? "ready"
            : "warning",
      href: "/home/materials",
      blocking: false,
    },

    {
      key: "clients",
      label: "Clients",
      detail:
        data.clients.length > 0
          ? `${data.clients.length} active client${
              data.clients.length === 1
                ? ""
                : "s"
            } available.`
          : "No active clients exist.",
      state:
        data.clients.length > 0
          ? "ready"
          : "missing",
      href: "/home/clients",
      blocking: true,
    },

    {
      key: "client-sites",
      label:
        "Client sites",
      detail:
        data.clientSites.length > 0
          ? `${data.clientSites.length} active waste-origin site${
              data.clientSites.length === 1
                ? ""
                : "s"
            } available.`
          : "No active client waste-origin sites exist.",
      state:
        data.clientSites.length > 0
          ? clientsWithoutSites.length > 0
            ? "warning"
            : "ready"
          : "missing",
      href: "/home/clients",
      blocking: true,
    },

    {
      key: "hauliers",
      label: "External hauliers",
      detail:
        data.hauliers.length > 0
          ? `${data.hauliers.length} active external haulier${
              data.hauliers.length === 1 ? "" : "s"
            } available. Own transport remains available as a separate option.`
          : "None configured. Fine when your organisation handles transport itself.",
      state:
        data.hauliers.length > 0
          ? "ready"
          : "warning",
      href: "/home/hauliers",
      blocking: false,
    },

    {
      key: "drivers",
      label: "Drivers",
      detail:
        data.drivers.length > 0
          ? `${data.drivers.length} active driver${
              data.drivers.length === 1 ? "" : "s"
            } available · ${ownDrivers.length} own · ${externalDrivers.length} external.`
          : "No drivers saved yet. Jobs can still be booked and a driver assigned later.",
      state:
        data.drivers.length === 0
          ? "warning"
          : driversWithUnknownHaulier.length > 0 ||
              driversWithMissingDefaultVehicle.length > 0
            ? "warning"
            : "ready",
      href: "/home/transport",
      blocking: false,
    },

    {
      key: "vehicles",
      label: "Vehicles",
      detail:
        data.vehicles.length > 0
          ? `${data.vehicles.length} active vehicle${
              data.vehicles.length === 1 ? "" : "s"
            } available · ${ownVehicles.length} own · ${externalVehicles.length} external.`
          : "No vehicles saved yet. Jobs can still be booked and a vehicle assigned later.",
      state:
        data.vehicles.length > 0
          ? "ready"
          : "warning",
      href: "/home/transport",
      blocking: false,
    },

    {
      key: "external-facilities",
      label:
        "Third-party facilities",
      detail:
        data.externalFacilities.length === 0
          ? "None configured. Fine for own-site-only incoming work."
          : `${data.externalFacilities.length} active external facilit${
              data.externalFacilities.length === 1
                ? "y"
                : "ies"
            } available.`,
      state:
        data.externalFacilities.length === 0
          ? "warning"
          : externalFacilitiesWithoutActiveAuthorisation.length > 0 ||
              externalAuthorisationsWithoutEwc.length > 0
            ? "warning"
            : "ready",
      href: "/home/tips",
      blocking: false,
    },

    {
      key: "rates",
      label: "Rates / pricing",
      detail:
        data.rates.length === 0
          ? "No active rates configured. Jobs can still be booked without a stored rate."
          : `${data.rates.length} active reusable rate${
              data.rates.length === 1
                ? ""
                : "s"
            } configured.`,
      state:
        data.rates.length > 0
          ? "ready"
          : "warning",
      href: "/home/rates",
      blocking: false,
    },
  ];

  const blockingFailures =
    checks.filter(
      (check) =>
        check.blocking &&
        check.state === "missing",
    );

  const warningChecks =
    checks.filter(
      (check) =>
        check.state === "warning",
    );

  return {
    readyForBookJob:
      blockingFailures.length === 0,

    checks,
    blockingFailures,
    warningChecks,

    diagnostics: {
      materialProfilesNotPermitted,
      clientsWithoutSites,
      driversWithUnknownHaulier,
      driversWithMissingDefaultVehicle,
      ownDrivers,
      externalDrivers,
      ownVehicles,
      externalVehicles,
      externalFacilitiesWithoutActiveAuthorisation,
      externalAuthorisationsWithoutEwc,
    },
  };
}
