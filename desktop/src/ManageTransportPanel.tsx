import { invoke } from "@tauri-apps/api/core";
import { ManagePartnersPanel } from "./ManagePartnersPanel";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type ManageTab = "drivers" | "vehicles" | "hauliers" | "sites";

type Haulier = {
  id: string;
  name: string;
  carrierRegistrationNumber: string | null;
  isActive: boolean;
};

type Driver = {
  id: string;
  name: string;
  telephone: string | null;
  email: string | null;
  haulierCounterpartyId: string | null;
  defaultVehicleId: string | null;
  isActive: boolean;
  notes: string | null;
  linkedUserId: string | null;
  mobileAccessStatus:
    | "NOT_INVITED"
    | "INVITED"
    | "ACTIVE"
    | "SUSPENDED"
    | "REVOKED";
};

type Vehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  haulierCounterpartyId: string | null;
  tareWeightKg: string | null;
  isActive: boolean;
  notes: string | null;
};

type TransportData = {
  ok: true;
  hauliers: Haulier[];
  drivers: Driver[];
  vehicles: Vehicle[];
  boundary: {
    mobileAccessAdministration: "WEB_ONLY";
    dwtCarrierAdministration: "WEB_ONLY";
  };
};

type MutationResponse = {
  ok: true;
  action: "created" | "updated" | "archived" | "restored";
  entityType: "driver" | "vehicle";
  entityId: string;
  syncFeedWarning: boolean;
  data: {
    hauliers: Haulier[];
    drivers: Driver[];
    vehicles: Vehicle[];
  };
};

type DriverDraft = {
  id: string | null;
  name: string;
  telephone: string;
  email: string;
  haulierCounterpartyId: string;
  defaultVehicleId: string;
  notes: string;
};

type VehicleDraft = {
  id: string | null;
  registrationNumber: string;
  vehicleType: string;
  haulierCounterpartyId: string;
  tareWeightKg: string;
  notes: string;
};

const EMPTY_DRIVER: DriverDraft = {
  id: null,
  name: "",
  telephone: "",
  email: "",
  haulierCounterpartyId: "",
  defaultVehicleId: "",
  notes: "",
};

const EMPTY_VEHICLE: VehicleDraft = {
  id: null,
  registrationNumber: "",
  vehicleType: "",
  haulierCounterpartyId: "",
  tareWeightKg: "",
  notes: "",
};

function optional(value: string) {
  const clean = value.trim();
  return clean ? clean : null;
}

function mobileLabel(value: Driver["mobileAccessStatus"]) {
  if (value === "NOT_INVITED") return "Not invited";
  if (value === "INVITED") return "Invitation sent";
  if (value === "ACTIVE") return "Mobile active";
  if (value === "SUSPENDED") return "Mobile suspended";
  return "Mobile revoked";
}

export function ManageTransportPanel({
  cloudReachable,
  onMasterDataChanged,
}: {
  cloudReachable: boolean;
  onMasterDataChanged: () => Promise<void> | void;
}) {
  const [tab, setTab] = useState<ManageTab>("drivers");
  const [data, setData] = useState<TransportData | null>(null);
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [selectedDriverId, setSelectedDriverId] =
    useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] =
    useState<string | null>(null);
  const [driverDraft, setDriverDraft] =
    useState<DriverDraft>(EMPTY_DRIVER);
  const [vehicleDraft, setVehicleDraft] =
    useState<VehicleDraft>(EMPTY_VEHICLE);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* WASTE_X_DESKTOP_MANAGE_ACTION_TOAST_V1 */
  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      setData(
        await invoke<TransportData>("desktop_transport_master_data"),
      );
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [cloudReachable]);

  const haulierName = (id: string | null) =>
    id
      ? data?.hauliers.find((haulier) => haulier.id === id)?.name ??
        "Archived / unavailable haulier"
      : "Own fleet";

  const activeHauliers = useMemo(
    () => (data?.hauliers ?? []).filter((haulier) => haulier.isActive),
    [data?.hauliers],
  );

  const visibleDrivers = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (data?.drivers ?? []).filter((driver) => {
      if (!showArchived && !driver.isActive) return false;
      if (!needle) return true;

      return [
        driver.name,
        driver.telephone,
        driver.email,
        haulierName(driver.haulierCounterpartyId),
        mobileLabel(driver.mobileAccessStatus),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, query, showArchived]);

  const visibleVehicles = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return (data?.vehicles ?? []).filter((vehicle) => {
      if (!showArchived && !vehicle.isActive) return false;
      if (!needle) return true;

      return [
        vehicle.registrationNumber,
        vehicle.vehicleType,
        vehicle.tareWeightKg,
        haulierName(vehicle.haulierCounterpartyId),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });
  }, [data, query, showArchived]);

  const driverVehicles = useMemo(() => {
    const owner = driverDraft.haulierCounterpartyId || null;

    return (data?.vehicles ?? []).filter(
      (vehicle) =>
        vehicle.isActive &&
        vehicle.haulierCounterpartyId === owner,
    );
  }, [data?.vehicles, driverDraft.haulierCounterpartyId]);

  function beginDriver(driver?: Driver) {
    setMessage(null);
    setError(null);

    if (!driver) {
      setSelectedDriverId(null);
      setDriverDraft(EMPTY_DRIVER);
      return;
    }

    setSelectedDriverId(driver.id);
    setDriverDraft({
      id: driver.id,
      name: driver.name,
      telephone: driver.telephone ?? "",
      email: driver.email ?? "",
      haulierCounterpartyId:
        driver.haulierCounterpartyId ?? "",
      defaultVehicleId: driver.defaultVehicleId ?? "",
      notes: driver.notes ?? "",
    });
  }

  function beginVehicle(vehicle?: Vehicle) {
    setMessage(null);
    setError(null);

    if (!vehicle) {
      setSelectedVehicleId(null);
      setVehicleDraft(EMPTY_VEHICLE);
      return;
    }

    setSelectedVehicleId(vehicle.id);
    setVehicleDraft({
      id: vehicle.id,
      registrationNumber: vehicle.registrationNumber,
      vehicleType: vehicle.vehicleType ?? "",
      haulierCounterpartyId:
        vehicle.haulierCounterpartyId ?? "",
      tareWeightKg: vehicle.tareWeightKg ?? "",
      notes: vehicle.notes ?? "",
    });
  }

  async function mutate(input: unknown) {
    setBusy(true);
    setError(null);
    setMessage(null);

    try {
      const result = await invoke<MutationResponse>(
        "desktop_mutate_transport_local",
        { input },
      );

      setData((current) =>
        current
          ? { ...current, ...result.data }
          : {
              ok: true,
              ...result.data,
              boundary: {
                mobileAccessAdministration: "WEB_ONLY",
                dwtCarrierAdministration: "WEB_ONLY",
              },
            },
      );

      if (cloudReachable) {
        try {
          await invoke("desktop_sync_transport_mutations");
        } catch {
          // Local change is already durable and will retry automatically.
        }
      }
      await onMasterDataChanged();

      setMessage(
        `${result.entityType === "driver" ? "Driver" : "Vehicle"} ${
          result.action
        }.${
          result.syncFeedWarning
            ? " Local data refreshed; Cloud change-feed publication needs review."
            : ""
        }`,
      );

      return result;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await mutate({
      operation: driverDraft.id ? "driver.update" : "driver.create",
      data: {
        id: driverDraft.id ?? crypto.randomUUID(),
        name: driverDraft.name,
        telephone: optional(driverDraft.telephone),
        email: optional(driverDraft.email),
        haulierCounterpartyId: optional(
          driverDraft.haulierCounterpartyId,
        ),
        defaultVehicleId: optional(driverDraft.defaultVehicleId),
        notes: optional(driverDraft.notes),
      },
    });

    if (result) {
      const driver = result.data.drivers.find(
        (item) => item.id === result.entityId,
      );
      if (driver) beginDriver(driver);
    }
  }

  async function saveVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const result = await mutate({
      operation: vehicleDraft.id
        ? "vehicle.update"
        : "vehicle.create",
      data: {
        id: vehicleDraft.id ?? crypto.randomUUID(),
        registrationNumber: vehicleDraft.registrationNumber,
        vehicleType: optional(vehicleDraft.vehicleType),
        haulierCounterpartyId: optional(
          vehicleDraft.haulierCounterpartyId,
        ),
        tareWeightKg: optional(vehicleDraft.tareWeightKg),
        notes: optional(vehicleDraft.notes),
      },
    });

    if (result) {
      const vehicle = result.data.vehicles.find(
        (item) => item.id === result.entityId,
      );
      if (vehicle) beginVehicle(vehicle);
    }
  }

  const selectedDriver =
    data?.drivers.find((driver) => driver.id === selectedDriverId) ??
    null;

  const selectedVehicle =
    data?.vehicles.find(
      (vehicle) => vehicle.id === selectedVehicleId,
    ) ?? null;

  return (
    <section className="pilot-screen pilot-manage-screen">
      <div className="pilot-page-heading">
        <div>
          <span className="eyebrow">Site master data</span>
          <h1>Manage</h1>
          <p>
            Operational Driver and Vehicle records shared with Web,
            Desktop and Mobile workflows.
          </p>
        </div>

        <div className="pilot-manage-boundary">
          Mobile access & DWT administration remain on Web.
        </div>
      </div>
<div className="pilot-manage-tabs">
        <button
          type="button"
          className={tab === "drivers" ? "active" : ""}
          onClick={() => {
            setTab("drivers");
            setQuery("");
          }}
        >
          Drivers
          <span>{data?.drivers.length ?? 0}</span>
        </button>

        <button
          type="button"
          className={tab === "vehicles" ? "active" : ""}
          onClick={() => {
            setTab("vehicles");
            setQuery("");
          }}
        >
          Vehicles
          <span>{data?.vehicles.length ?? 0}</span>
        </button>

        <button
          type="button"
          className={tab === "hauliers" ? "active" : ""}
          onClick={() => {
            setTab("hauliers");
            setQuery("");
          }}
        >
          Hauliers
        </button>

        <button
          type="button"
          className={tab === "sites" ? "active" : ""}
          onClick={() => {
            setTab("sites");
            setQuery("");
          }}
        >
          Sites / Sources
        </button>
      </div>

      {message ? (
        <div className="pilot-action-toast success" role="status" aria-live="polite">
          <div>
            <strong>Action completed</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="pilot-action-toast error" role="alert" aria-live="assertive">
          <div>
            <strong>Action unsuccessful</strong>
            <span>{error}</span>
          </div>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss error">
            ×
          </button>
        </div>
      ) : null}

      {tab === "hauliers" || tab === "sites" ? (
        <ManagePartnersPanel
          tab={tab}
          cloudReachable={cloudReachable}
          onMasterDataChanged={async () => {
            await load();
            await onMasterDataChanged();
          }}
        />
      ) : loading && !data ? (
        <div className="empty-state">Loading master data…</div>
      ) : data ? (
        <div className="pilot-manage-layout">
          <section className="pilot-manage-list">
            <div className="pilot-manage-toolbar">
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={
                  tab === "drivers"
                    ? "Search driver, haulier, phone or email…"
                    : "Search registration, type, haulier or tare…"
                }
              />

              <label>
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) =>
                    setShowArchived(event.target.checked)
                  }
                />
                Show archived
              </label>

              <button
                type="button"
                onClick={() =>
                  tab === "drivers"
                    ? beginDriver()
                    : beginVehicle()
                }
              >
                + Add {tab === "drivers" ? "Driver" : "Vehicle"}
              </button>
            </div>

            <div className="pilot-manage-table-head">
              <span>{tab === "drivers" ? "Driver" : "Vehicle"}</span>
              <span>Carrier / detail</span>
              <span>Status</span>
            </div>

            <div className="pilot-manage-rows">
              {tab === "drivers"
                ? visibleDrivers.map((driver) => (
                    <button
                      type="button"
                      key={driver.id}
                      className={
                        selectedDriverId === driver.id ? "active" : ""
                      }
                      onClick={() => beginDriver(driver)}
                    >
                      <span>
                        <strong>{driver.name}</strong>
                        <small>
                          {[driver.telephone, driver.email]
                            .filter(Boolean)
                            .join(" · ") || "No contact details"}
                        </small>
                      </span>

                      <span>
                        <strong>
                          {haulierName(driver.haulierCounterpartyId)}
                        </strong>
                        <small>
                          {driver.defaultVehicleId
                            ? data.vehicles.find(
                                (vehicle) =>
                                  vehicle.id === driver.defaultVehicleId,
                              )?.registrationNumber ??
                              "Default Vehicle unavailable"
                            : "No default Vehicle"}
                        </small>
                      </span>

                      <span>
                        <b
                          className={
                            driver.isActive
                              ? "pilot-state-active"
                              : "pilot-state-archived"
                          }
                        >
                          {driver.isActive ? "Active" : "Archived"}
                        </b>
                        <small>
                          {mobileLabel(driver.mobileAccessStatus)}
                        </small>
                      </span>
                    </button>
                  ))
                : visibleVehicles.map((vehicle) => (
                    <button
                      type="button"
                      key={vehicle.id}
                      className={
                        selectedVehicleId === vehicle.id ? "active" : ""
                      }
                      onClick={() => beginVehicle(vehicle)}
                    >
                      <span>
                        <strong>{vehicle.registrationNumber}</strong>
                        <small>
                          {vehicle.vehicleType ?? "Type not set"}
                        </small>
                      </span>

                      <span>
                        <strong>
                          {haulierName(vehicle.haulierCounterpartyId)}
                        </strong>
                        <small>
                          {vehicle.tareWeightKg
                            ? `${vehicle.tareWeightKg} kg stored tare`
                            : "No stored tare"}
                        </small>
                      </span>

                      <span>
                        <b
                          className={
                            vehicle.isActive
                              ? "pilot-state-active"
                              : "pilot-state-archived"
                          }
                        >
                          {vehicle.isActive ? "Active" : "Archived"}
                        </b>
                      </span>
                    </button>
                  ))}

              {(tab === "drivers"
                ? visibleDrivers.length
                : visibleVehicles.length) === 0 ? (
                <div className="empty-state">
                  No {tab} match this view.
                </div>
              ) : null}
            </div>
          </section>

          <section className="pilot-manage-editor">
            {tab === "drivers" ? (
              <form onSubmit={saveDriver}>
                <div className="pilot-manage-editor-heading">
                  <div>
                    <span className="eyebrow">Driver record</span>
                    <h2>
                      {driverDraft.id
                        ? selectedDriver?.name ?? "Driver"
                        : "Add Driver"}
                    </h2>
                  </div>

                  {selectedDriver ? (
                    <span
                      className={
                        selectedDriver.isActive
                          ? "pilot-state-active"
                          : "pilot-state-archived"
                      }
                    >
                      {selectedDriver.isActive ? "Active" : "Archived"}
                    </span>
                  ) : null}
                </div>

                <div className="pilot-manage-form">
                  <label className="wide">
                    <span>Name</span>
                    <input
                      value={driverDraft.name}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          name: event.target.value,
                        })
                      }
                      required
                    />
                  </label>

                  <label>
                    <span>Telephone</span>
                    <input
                      value={driverDraft.telephone}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          telephone: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label>
                    <span>Email</span>
                    <input
                      type="email"
                      value={driverDraft.email}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          email: event.target.value,
                        })
                      }
                    />
                  </label>

                  <label className="wide">
                    <span>Carrier</span>
                    <select
                      value={driverDraft.haulierCounterpartyId}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          haulierCounterpartyId: event.target.value,
                          defaultVehicleId: "",
                        })
                      }
                    >
                      <option value="">Own fleet</option>
                      {activeHauliers.map((haulier) => (
                        <option key={haulier.id} value={haulier.id}>
                          {haulier.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="wide">
                    <span>Default Vehicle</span>
                    <select
                      value={driverDraft.defaultVehicleId}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          defaultVehicleId: event.target.value,
                        })
                      }
                    >
                      <option value="">No default Vehicle</option>
                      {driverVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.registrationNumber}
                          {vehicle.vehicleType
                            ? ` · ${vehicle.vehicleType}`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="wide">
                    <span>Notes</span>
                    <textarea
                      rows={4}
                      value={driverDraft.notes}
                      onChange={(event) =>
                        setDriverDraft({
                          ...driverDraft,
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                {selectedDriver ? (
                  <div className="pilot-mobile-readonly">
                    <div>
                      <span>Mobile access</span>
                      <strong>
                        {mobileLabel(selectedDriver.mobileAccessStatus)}
                      </strong>
                    </div>
                    <small>
                      Invitation, suspension, revocation and phone
                      administration stay on Waste X Web.
                    </small>
                  </div>
                ) : null}

                <div className="pilot-manage-actions">
                  {selectedDriver ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={async () => {
                        const result = await mutate({
                          operation: selectedDriver.isActive
                            ? "driver.archive"
                            : "driver.restore",
                          id: selectedDriver.id,
                        });

                        if (result) {
                          const driver = result.data.drivers.find(
                            (item) => item.id === selectedDriver.id,
                          );
                          if (driver) beginDriver(driver);
                        }
                      }}
                    >
                      {selectedDriver.isActive
                        ? "Archive Driver"
                        : "Restore Driver"}
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="submit"
                    disabled={busy || !driverDraft.name.trim()}
                  >
                    {busy
                      ? "Saving…"
                      : driverDraft.id
                        ? "Save Driver"
                        : "Create Driver"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={saveVehicle}>
                <div className="pilot-manage-editor-heading">
                  <div>
                    <span className="eyebrow">Vehicle record</span>
                    <h2>
                      {vehicleDraft.id
                        ? selectedVehicle?.registrationNumber ?? "Vehicle"
                        : "Add Vehicle"}
                    </h2>
                  </div>

                  {selectedVehicle ? (
                    <span
                      className={
                        selectedVehicle.isActive
                          ? "pilot-state-active"
                          : "pilot-state-archived"
                      }
                    >
                      {selectedVehicle.isActive ? "Active" : "Archived"}
                    </span>
                  ) : null}
                </div>

                <div className="pilot-manage-form">
                  <label className="wide">
                    <span>Registration</span>
                    <input
                      value={vehicleDraft.registrationNumber}
                      onChange={(event) =>
                        setVehicleDraft({
                          ...vehicleDraft,
                          registrationNumber: event.target.value,
                        })
                      }
                      placeholder="AB12CDE"
                      required
                    />
                  </label>

                  <label>
                    <span>Vehicle type</span>
                    <input
                      value={vehicleDraft.vehicleType}
                      onChange={(event) =>
                        setVehicleDraft({
                          ...vehicleDraft,
                          vehicleType: event.target.value,
                        })
                      }
                      placeholder="Tipper, skip lorry…"
                    />
                  </label>

                  <label>
                    <span>Stored tare (kg)</span>
                    <input
                      type="number"
                      min="0"
                      step="0.001"
                      value={vehicleDraft.tareWeightKg}
                      onChange={(event) =>
                        setVehicleDraft({
                          ...vehicleDraft,
                          tareWeightKg: event.target.value,
                        })
                      }
                      placeholder="e.g. 12500"
                    />
                  </label>

                  <label className="wide">
                    <span>Carrier</span>
                    <select
                      value={vehicleDraft.haulierCounterpartyId}
                      onChange={(event) =>
                        setVehicleDraft({
                          ...vehicleDraft,
                          haulierCounterpartyId: event.target.value,
                        })
                      }
                    >
                      <option value="">Own fleet</option>
                      {activeHauliers.map((haulier) => (
                        <option key={haulier.id} value={haulier.id}>
                          {haulier.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="wide">
                    <span>Notes</span>
                    <textarea
                      rows={4}
                      value={vehicleDraft.notes}
                      onChange={(event) =>
                        setVehicleDraft({
                          ...vehicleDraft,
                          notes: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>

                <div className="pilot-tare-note">
                  Stored tare is kept in kilograms in the canonical Vehicle
                  record. Site operations can convert it to the Load's selected
                  weight metric.
                </div>

                <div className="pilot-manage-actions">
                  {selectedVehicle ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={busy}
                      onClick={async () => {
                        const result = await mutate({
                          operation: selectedVehicle.isActive
                            ? "vehicle.archive"
                            : "vehicle.restore",
                          id: selectedVehicle.id,
                        });

                        if (result) {
                          const vehicle = result.data.vehicles.find(
                            (item) => item.id === selectedVehicle.id,
                          );
                          if (vehicle) beginVehicle(vehicle);
                        }
                      }}
                    >
                      {selectedVehicle.isActive
                        ? "Archive Vehicle"
                        : "Restore Vehicle"}
                    </button>
                  ) : (
                    <span />
                  )}

                  <button
                    type="submit"
                    disabled={
                      busy || !vehicleDraft.registrationNumber.trim()
                    }
                  >
                    {busy
                      ? "Saving…"
                      : vehicleDraft.id
                        ? "Save Vehicle"
                        : "Create Vehicle"}
                  </button>
                </div>
              </form>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
