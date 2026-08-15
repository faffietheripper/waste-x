"use client";

import { useMemo, useState, type ReactNode } from "react";

import { createOutgoingJobAction } from "../actions";

type Facility = {
  id: string;
  name: string;
  operatorName: string;
  postcode: string | null;
  authorisationNumber: string | null;
  permittedEwcCodeIds: string[];
};

type Material = {
  id: string;
  name: string;
  ewcCodeId: string;
  ewcCode: string;
  description: string;
};

type Haulier = {
  id: string;
  name: string;
};

type Driver = {
  id: string;
  name: string;
  haulierCounterpartyId: string | null;
};

type Vehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  haulierCounterpartyId: string | null;
};

export default function OutgoingBookingForm({
  ownSiteName,
  today,
  facilities,
  materials,
  hauliers,
  drivers,
  vehicles,
}: {
  ownSiteName: string;
  today: string;
  facilities: Facility[];
  materials: Material[];
  hauliers: Haulier[];
  drivers: Driver[];
  vehicles: Vehicle[];
}) {
  const [facilityId, setFacilityId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [transportMode, setTransportMode] = useState<"own" | "external">("own");
  const [haulierId, setHaulierId] = useState("");

  const facility = facilities.find((item) => item.id === facilityId) ?? null;
  const material = materials.find((item) => item.id === materialId) ?? null;

  const materialAllowed = Boolean(
    facility && material && facility.permittedEwcCodeIds.includes(material.ewcCodeId),
  );

  const availableDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          driver.haulierCounterpartyId ===
          (transportMode === "external" ? haulierId || "__none__" : null),
      ),
    [drivers, transportMode, haulierId],
  );

  const availableVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          vehicle.haulierCounterpartyId ===
          (transportMode === "external" ? haulierId || "__none__" : null),
      ),
    [vehicles, transportMode, haulierId],
  );

  return (
    <form action={createOutgoingJobAction} className="space-y-6">
      <section className="grid gap-5 rounded-[28px] border border-black/10 bg-white p-6 shadow-sm xl:grid-cols-2">
        <Field label="Movement date">
          <input
            type="date"
            name="jobDate"
            defaultValue={today}
            required
            className="input"
          />
        </Field>

        <Field label="Origin">
          <div className="flex h-12 items-center rounded-2xl border border-black/10 bg-[#f7f3ed] px-4 text-sm font-semibold text-black/60">
            {ownSiteName}
          </div>
        </Field>

        <Field label="Third-party facility">
          <select
            name="destinationSiteId"
            value={facilityId}
            onChange={(event) => setFacilityId(event.target.value)}
            required
            className="input"
          >
            <option value="">Choose external destination</option>
            {facilities.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.operatorName}
                {item.postcode ? ` · ${item.postcode}` : ""}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Material / waste profile">
          <select
            name="materialProfileId"
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            required
            className="input"
          >
            <option value="">Choose material</option>
            {materials.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {item.ewcCode}
              </option>
            ))}
          </select>
        </Field>

        <div className="xl:col-span-2">
          {facility && material ? (
            <div
              className={`rounded-2xl border px-4 py-3 text-sm font-medium ${
                materialAllowed
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {materialAllowed
                ? `✓ ${material.ewcCode} is configured on this facility's active authorisation.`
                : `✕ ${material.ewcCode} is not configured on this facility's active authorisation. Choose another destination or material.`}
            </div>
          ) : (
            <div className="rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black/40">
              Choose a destination and material to check external facility compatibility.
            </div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
          Transport
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className={`cursor-pointer rounded-2xl border p-4 ${transportMode === "own" ? "border-orange-400 bg-orange-50" : "border-black/10"}`}>
            <input
              type="radio"
              name="transportMode"
              value="own"
              checked={transportMode === "own"}
              onChange={() => {
                setTransportMode("own");
                setHaulierId("");
              }}
              className="mr-2 accent-orange-500"
            />
            <span className="text-sm font-semibold text-black">Own transport</span>
            <p className="mt-1 pl-6 text-xs text-black/40">Use your own driver / vehicle, or assign them later.</p>
          </label>

          <label className={`cursor-pointer rounded-2xl border p-4 ${transportMode === "external" ? "border-orange-400 bg-orange-50" : "border-black/10"}`}>
            <input
              type="radio"
              name="transportMode"
              value="external"
              checked={transportMode === "external"}
              onChange={() => setTransportMode("external")}
              className="mr-2 accent-orange-500"
            />
            <span className="text-sm font-semibold text-black">External haulier</span>
            <p className="mt-1 pl-6 text-xs text-black/40">Use a saved waste carrier.</p>
          </label>
        </div>

        <div className="mt-5 grid gap-5 xl:grid-cols-3">
          {transportMode === "external" && (
            <Field label="Haulier">
              <select
                name="haulierId"
                value={haulierId}
                onChange={(event) => setHaulierId(event.target.value)}
                required
                className="input"
              >
                <option value="">Choose haulier</option>
                {hauliers.map((haulier) => (
                  <option key={haulier.id} value={haulier.id}>{haulier.name}</option>
                ))}
              </select>
            </Field>
          )}

          <Field label="Driver">
            <select name="driverId" className="input" defaultValue="">
              <option value="">Assign later</option>
              {availableDrivers.map((driver) => (
                <option key={driver.id} value={driver.id}>{driver.name}</option>
              ))}
            </select>
          </Field>

          <Field label="Vehicle">
            <select name="vehicleId" className="input" defaultValue="">
              <option value="">Assign later</option>
              {availableVehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registrationNumber}{vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>

      <section className="grid gap-5 rounded-[28px] border border-black/10 bg-white p-6 shadow-sm xl:grid-cols-3">
        <Field label="Number of loads">
          <input type="number" min="1" max="100" name="plannedLoads" defaultValue="1" required className="input" />
        </Field>
        <Field label="PO number">
          <input name="purchaseOrder" className="input" placeholder="Optional" />
        </Field>
        <Field label="Reference">
          <input name="customerReference" className="input" placeholder="Optional" />
        </Field>
        <div className="xl:col-span-3">
          <Field label="Notes">
            <textarea name="notes" rows={3} className="input min-h-24 py-3" placeholder="Optional operational notes" />
          </Field>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] bg-black p-5 text-white">
        <div>
          <p className="text-xs font-semibold text-orange-400">Ready for Daily Worksheet</p>
          <p className="mt-1 text-xs text-white/45">
            Booking creates the outgoing Job and its planned Load rows. Actual weight and dispatch are recorded on the worksheet.
          </p>
        </div>
        <button
          type="submit"
          disabled={Boolean(facility && material && !materialAllowed)}
          className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/35"
        >
          Book outgoing movement
        </button>
      </div>

      <style jsx>{`
        .input {
          margin-top: 0.5rem;
          height: 3rem;
          width: 100%;
          border-radius: 1rem;
          border: 1px solid rgb(0 0 0 / 0.1);
          background: white;
          padding-left: 1rem;
          padding-right: 1rem;
          font-size: 0.875rem;
          outline: none;
        }
        .input:focus {
          border-color: rgb(251 146 60);
        }
      `}</style>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">{label}</span>
      {children}
    </label>
  );
}
