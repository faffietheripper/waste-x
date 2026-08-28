/* WASTE_X_WORKSHEET_FAST_FLOW_V1 */
"use client";

import {
  FormEvent,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { createPortal } from "react-dom";

import {
  assignLoadTransportAction,
  createWorksheetDriverAction,
  createWorksheetVehicleAction,
} from "./transport-actions";

type HaulierOption = {
  id: string;
  name: string;
  carrierRegistrationNumber: string | null;
};

type DriverOption = {
  id: string;
  name: string;
  haulierCounterpartyId: string | null;
};

type VehicleOption = {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  haulierCounterpartyId: string | null;
};

const OWN_TRANSPORT = "__own__";

export default function TransportAssignmentPopover({
  load,
  hauliers,
  drivers,
  vehicles,
  returnDate,
}: {
  load: {
    id: string;
    status: string;
    haulierCounterpartyId: string | null;
    driverId: string | null;
    vehicleId: string | null;
  };
  hauliers: HaulierOption[];
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  returnDate: string;
}) {
  const initialProvider = load.haulierCounterpartyId ?? OWN_TRANSPORT;

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState(initialProvider);
  const [driverId, setDriverId] = useState(load.driverId ?? "");
  const [vehicleId, setVehicleId] = useState(load.vehicleId ?? "");
  const [localDrivers, setLocalDrivers] = useState(drivers);
  const [localVehicles, setLocalVehicles] = useState(vehicles);
  const [addingDriver, setAddingDriver] = useState(false);
  const [addingVehicle, setAddingVehicle] = useState(false);
  const [driverError, setDriverError] = useState("");
  const [vehicleError, setVehicleError] = useState("");
  const [isCreating, startCreating] = useTransition();

  const selectedHaulierId = provider === OWN_TRANSPORT ? null : provider;

  const providerDrivers = useMemo(
    () =>
      localDrivers.filter(
        (driver) => driver.haulierCounterpartyId === selectedHaulierId,
      ),
    [localDrivers, selectedHaulierId],
  );

  const providerVehicles = useMemo(
    () =>
      localVehicles.filter(
        (vehicle) => vehicle.haulierCounterpartyId === selectedHaulierId,
      ),
    [localVehicles, selectedHaulierId],
  );

  const incomplete = !load.driverId || !load.vehicleId;

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function changeProvider(value: string) {
    setProvider(value);
    setDriverId("");
    setVehicleId("");
    setAddingDriver(false);
    setAddingVehicle(false);
    setDriverError("");
    setVehicleError("");
  }

  function createDriver(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDriverError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("haulierCounterpartyId", selectedHaulierId ?? "");

    startCreating(async () => {
      const result = await createWorksheetDriverAction(formData);

      if (!result.ok) {
        setDriverError(result.error);
        return;
      }

      setLocalDrivers((current) => [...current, result.driver]);
      setDriverId(result.driver.id);
      setAddingDriver(false);
      form.reset();
    });
  }

  function createVehicle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setVehicleError("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("haulierCounterpartyId", selectedHaulierId ?? "");

    startCreating(async () => {
      const result = await createWorksheetVehicleAction(formData);

      if (!result.ok) {
        setVehicleError(result.error);
        return;
      }

      setLocalVehicles((current) => [...current, result.vehicle]);
      setVehicleId(result.vehicle.id);
      setAddingVehicle(false);
      form.reset();
    });
  }

  return (
    <div className="relative mt-2">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`text-[10px] font-semibold underline decoration-black/15 underline-offset-2 ${
          incomplete ? "text-amber-700" : "text-black/40 hover:text-orange-700"
        }`}
      >
        {incomplete ? "Set transport" : "Edit transport"}
      </button>

      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-[2px]"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setOpen(false);
              }
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Edit actual transport"
              className="max-h-[calc(100vh-3rem)] w-full max-w-[620px] overflow-y-auto rounded-[24px] border border-black/10 bg-white p-5 shadow-2xl"
              onMouseDown={(event) => event.stopPropagation()}
            >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                  Actual transport
                </p>
                <p className="mt-1 text-xs leading-5 text-black/45">
                  Change the carrier, driver or vehicle for this load only. The
                  parent Job and its other loads stay unchanged.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-1 text-sm font-semibold text-black/35 hover:bg-black/5 hover:text-black"
              >
                ×
              </button>
            </div>

            <div className="grid gap-3">
              <label>
                <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
                  Transport provider
                </span>
                <select
                  value={provider}
                  onChange={(event) => changeProvider(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-orange-400"
                >
                  <option value={OWN_TRANSPORT}>Own transport</option>
                  {hauliers.map((haulier) => (
                    <option key={haulier.id} value={haulier.id}>
                      {haulier.name}
                      {haulier.carrierRegistrationNumber
                        ? ` · ${haulier.carrierRegistrationNumber}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
                    Driver
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingDriver((current) => !current);
                      setDriverError("");
                    }}
                    className="text-[10px] font-semibold text-orange-700 hover:text-black"
                  >
                    + Add new driver
                  </button>
                </div>

                <select
                  required
                  value={driverId}
                  onChange={(event) => setDriverId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-orange-400"
                >
                  <option value="">Choose driver</option>
                  {providerDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>

                {providerDrivers.length === 0 && !addingDriver && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    No drivers saved for this transport provider yet.
                  </p>
                )}
              </div>

              {addingDriver && (
                <div className="rounded-xl border border-orange-200 bg-orange-50/60 p-3">
                  <form onSubmit={createDriver} className="grid gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-orange-700">
                      New driver · {provider === OWN_TRANSPORT ? "Own transport" : "Selected haulier"}
                    </p>
                    <input
                      name="name"
                      required
                      placeholder="Driver name"
                      className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-orange-400"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="telephone"
                        placeholder="Telephone (optional)"
                        className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none"
                      />
                      <input
                        name="email"
                        type="email"
                        placeholder="Email (optional)"
                        className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none"
                      />
                    </div>
                    {driverError && (
                      <p className="text-[10px] font-medium text-red-700">{driverError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="h-9 rounded-lg bg-black px-3 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      {isCreating ? "Adding…" : "Add & select driver"}
                    </button>
                  </form>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
                    Vehicle
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingVehicle((current) => !current);
                      setVehicleError("");
                    }}
                    className="text-[10px] font-semibold text-orange-700 hover:text-black"
                  >
                    + Add new vehicle
                  </button>
                </div>

                <select
                  required
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none focus:border-orange-400"
                >
                  <option value="">Choose vehicle</option>
                  {providerVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registrationNumber}
                      {vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}
                    </option>
                  ))}
                </select>

                {providerVehicles.length === 0 && !addingVehicle && (
                  <p className="mt-1 text-[10px] text-amber-700">
                    No vehicles saved for this transport provider yet.
                  </p>
                )}
              </div>

              {addingVehicle && (
                <div className="rounded-xl border border-black/10 bg-[#fbfaf7] p-3">
                  <form onSubmit={createVehicle} className="grid gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-black/45">
                      New vehicle · {provider === OWN_TRANSPORT ? "Own transport" : "Selected haulier"}
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        name="registrationNumber"
                        required
                        placeholder="Registration"
                        className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-xs uppercase outline-none focus:border-orange-400"
                      />
                      <input
                        name="vehicleType"
                        placeholder="Vehicle type"
                        className="h-9 rounded-lg border border-black/10 bg-white px-2.5 text-xs outline-none"
                      />
                    </div>
                    {vehicleError && (
                      <p className="text-[10px] font-medium text-red-700">{vehicleError}</p>
                    )}
                    <button
                      type="submit"
                      disabled={isCreating}
                      className="h-9 rounded-lg border border-black/10 bg-white px-3 text-xs font-semibold text-black disabled:opacity-40"
                    >
                      {isCreating ? "Adding…" : "Add & select vehicle"}
                    </button>
                  </form>
                </div>
              )}

              <form
                action={assignLoadTransportAction}
                onSubmit={() => setOpen(false)}
              >
                <input type="hidden" name="loadId" value={load.id} />
                <input type="hidden" name="returnDate" value={returnDate} />
                <input
                  type="hidden"
                  name="transportMode"
                  value={provider === OWN_TRANSPORT ? "own" : "external"}
                />
                <input
                  type="hidden"
                  name="haulierCounterpartyId"
                  value={selectedHaulierId ?? ""}
                />
                <input type="hidden" name="driverId" value={driverId} />
                <input type="hidden" name="vehicleId" value={vehicleId} />
                <button
                  type="submit"
                  disabled={!driverId || !vehicleId}
                  className="mt-1 h-10 w-full rounded-lg bg-black px-3 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Save actual transport
                </button>
              </form>
            </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
