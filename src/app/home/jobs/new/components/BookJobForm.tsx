"use client";
/* WASTE_X_JOB_SPECIFIC_PRICING_V2 */

import Link from "next/link";
import { useMemo, useState } from "react";

import { createJobAction } from "../actions";
import {
  quickCreateClientAction,
  quickCreateClientSiteAction,
  quickCreateDriverAction,
  quickCreateHaulierAction,
  quickCreateMaterialAction,
  quickCreateVehicleAction,
} from "../quick-create-actions";
import { matchCommercialRate } from "../lib/matchCommercialRate";
import type { BookJobFormData, BookJobInitialValues } from "../lib/types";

type Props = {
  data: BookJobFormData;
  defaultDate: string;
  initialValues?: BookJobInitialValues;
  error?: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  invalid_job_date: "Choose a valid job date.",
  client_required: "Choose a client.",
  client_site_required: "Choose the waste origin / client site.",
  transport_mode_required: "Choose how the waste will be transported.",
  haulier_required: "Choose an external haulier or switch to own transport.",
  invalid_driver: "That driver is no longer available.",
  invalid_vehicle: "That vehicle is no longer available.",
  driver_not_for_own_transport: "That driver belongs to an external haulier, not your own fleet.",
  vehicle_not_for_own_transport: "That vehicle belongs to an external haulier, not your own fleet.",
  material_required: "Choose a material.",
  invalid_load_count: "Number of loads must be between 1 and 100.",
  receiving_site_missing: "No active primary receiving site is configured.",
  receiving_permit_missing: "No active primary permit is configured for the receiving site.",
  invalid_client: "That client is no longer available.",
  invalid_client_site: "That client site is no longer available.",
  invalid_haulier: "That haulier is no longer available.",
  driver_not_for_haulier: "The selected driver does not belong to that haulier.",
  vehicle_not_for_haulier: "The selected vehicle does not belong to that haulier.",
  invalid_material: "That material is no longer available.",
  invalid_template: "That job template is no longer available.",
  material_not_permitted_at_receiving_site:
    "That material's EWC code is not configured on the receiving-site permit.",
};

function money(amount: string, currency: string) {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return amount;

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(numeric);
}

function unitLabel(unit: "tonne" | "load" | "job") {
  return unit === "tonne" ? "tonne" : unit === "load" ? "load" : "job";
}

export default function BookJobForm({ data, defaultDate, initialValues, error }: Props) {
  const [clients, setClients] = useState(data.clients);
  const [clientSiteOptions, setClientSiteOptions] = useState(data.clientSites);
  const [hauliers, setHauliers] = useState(data.hauliers);
  const [drivers, setDrivers] = useState(data.drivers);
  const [vehicles, setVehicles] = useState(data.vehicles);
  const [materials, setMaterials] = useState(data.materials);
  const [quickCreateKind, setQuickCreateKind] = useState<
    "client" | "clientSite" | "haulier" | "driver" | "vehicle" | "material" | null
  >(null);
  const [quickCreateError, setQuickCreateError] = useState("");
  const [quickCreateSaving, setQuickCreateSaving] = useState(false);

  const ownDrivers = drivers.filter(
    (driver) => driver.haulierCounterpartyId === null,
  );
  const ownVehicles = vehicles.filter(
    (vehicle) => vehicle.haulierCounterpartyId === null,
  );

  const sortedMaterials = useMemo(
    () =>
      [...materials].sort((a, b) => {
        if (a.isFavourite !== b.isFavourite) return a.isFavourite ? -1 : 1;
        return a.name.localeCompare(b.name);
      }),
    [materials],
  );

  const initialClientId =
    initialValues?.clientId &&
    clients.some((client) => client.id === initialValues.clientId)
      ? initialValues.clientId
      : "";

  const initialClientDefaultSite =
    clientSiteOptions.find(
      (site) =>
        site.id === initialValues?.clientSiteId &&
        site.counterpartyId === initialClientId,
    ) ??
    clientSiteOptions.find(
      (site) => site.counterpartyId === initialClientId && site.isDefault,
    ) ??
    clientSiteOptions.find((site) => site.counterpartyId === initialClientId);

  const requestedTransportMode = initialValues?.transportMode ?? "";
  const initialHaulierId =
    requestedTransportMode === "external" &&
    initialValues?.haulierId &&
    hauliers.some((haulier) => haulier.id === initialValues.haulierId)
      ? initialValues.haulierId
      : "";

  const initialDriverPool =
    requestedTransportMode === "own"
      ? ownDrivers
      : drivers.filter(
          (driver) => driver.haulierCounterpartyId === initialHaulierId,
        );

  const initialVehiclePool =
    requestedTransportMode === "own"
      ? ownVehicles
      : vehicles.filter(
          (vehicle) => vehicle.haulierCounterpartyId === initialHaulierId,
        );

  const initialDriver =
    initialValues?.driverId
      ? initialDriverPool.find((driver) => driver.id === initialValues.driverId)
      : undefined;

  const initialVehicle =
    initialValues?.vehicleId
      ? initialVehiclePool.find((vehicle) => vehicle.id === initialValues.vehicleId)
      : undefined;

  const initialMaterialProfileId =
    initialValues?.materialProfileId &&
    sortedMaterials.some((material) => material.id === initialValues.materialProfileId)
      ? initialValues.materialProfileId
      : "";

  const [jobDate, setJobDate] = useState(initialValues?.jobDate ?? defaultDate);
  const [clientId, setClientId] = useState(initialClientId);
  const [clientSiteId, setClientSiteId] = useState(initialClientDefaultSite?.id ?? "");
  const [transportMode, setTransportMode] = useState<
    "" | "own" | "external"
  >(requestedTransportMode);
  const [haulierId, setHaulierId] = useState(initialHaulierId);
  const [driverId, setDriverId] = useState(initialDriver?.id ?? "");
  const [vehicleId, setVehicleId] = useState(initialVehicle?.id ?? "");
  const [materialProfileId, setMaterialProfileId] = useState(initialMaterialProfileId);
  const [customerChargeDescription, setCustomerChargeDescription] =
    useState("Waste acceptance / disposal");
  const [customerChargeAmount, setCustomerChargeAmount] = useState("");
  const [customerChargeUnit, setCustomerChargeUnit] =
    useState<"tonne" | "load" | "job">("tonne");
  const [customerVatRate, setCustomerVatRate] = useState("20.00");

  const [haulageCostAmount, setHaulageCostAmount] = useState("");
  const [haulageCostUnit, setHaulageCostUnit] =
    useState<"tonne" | "load" | "job">("load");

  const [tippingCostAmount, setTippingCostAmount] = useState("");
  const [tippingCostUnit, setTippingCostUnit] =
    useState<"tonne" | "load" | "job">("tonne");

  const [pricingSourceRateId, setPricingSourceRateId] = useState("");

  const clientSites = clientSiteOptions.filter(
    (site) => site.counterpartyId === clientId,
  );

  const availableDrivers =
    transportMode === "own"
      ? ownDrivers
      : drivers.filter(
          (driver) => driver.haulierCounterpartyId === haulierId,
        );

  const availableVehicles =
    transportMode === "own"
      ? ownVehicles
      : vehicles.filter(
          (vehicle) => vehicle.haulierCounterpartyId === haulierId,
        );

  const selectedMaterial = materials.find(
    (material) => material.id === materialProfileId,
  );

  const selectedClient = clients.find((client) => client.id === clientId);
  const selectedClientSite = clientSiteOptions.find((site) => site.id === clientSiteId);
  const selectedHaulier = hauliers.find((haulier) => haulier.id === haulierId);
  const selectedDriver = drivers.find((driver) => driver.id === driverId);
  const selectedVehicle = vehicles.find((vehicle) => vehicle.id === vehicleId);

  const permittedEwcIds = useMemo(
    () => new Set(data.permittedEwcCodeIds),
    [data.permittedEwcCodeIds],
  );

  const materialIsPermitted = selectedMaterial
    ? permittedEwcIds.has(selectedMaterial.ewcCodeId)
    : false;

  const rateDate = /^\d{4}-\d{2}-\d{2}$/.test(jobDate)
    ? new Date(`${jobDate}T12:00:00.000Z`)
    : new Date();

  const customerRate = matchCommercialRate(data.rates, {
    rateType: "customer_charge",
    counterpartyId: clientId || null,
    counterpartySiteId: clientSiteId || null,
    ownSiteId: data.receivingSite.id,
    materialProfileId: materialProfileId || null,
    at: rateDate,
  });

  const haulageRate =
    transportMode === "external" && haulierId
      ? matchCommercialRate(data.rates, {
          rateType: "haulage_cost",
          counterpartyId: haulierId,
          counterpartySiteId: null,
          ownSiteId: data.receivingSite.id,
          materialProfileId: materialProfileId || null,
          at: rateDate,
        })
      : null;

  function useStoredPricingSuggestions() {
    if (customerRate) {
      setCustomerChargeAmount(customerRate.amount);
      setCustomerChargeUnit(customerRate.unit);
      setPricingSourceRateId(customerRate.id);
    }

    if (haulageRate) {
      setHaulageCostAmount(haulageRate.amount);
      setHaulageCostUnit(haulageRate.unit);
    }
  }

  function clearJobPricing() {
    setCustomerChargeAmount("");
    setHaulageCostAmount("");
    setTippingCostAmount("");
    setPricingSourceRateId("");
  }

  function changeClient(nextClientId: string) {
    setClientId(nextClientId);

    const nextSites = clientSiteOptions.filter(
      (site) => site.counterpartyId === nextClientId,
    );
    const nextDefault = nextSites.find((site) => site.isDefault) ?? nextSites[0];
    setClientSiteId(nextDefault?.id ?? "");
  }

  function changeTransportMode(nextMode: "own" | "external") {
    setTransportMode(nextMode);
    setHaulierId("");
    setDriverId("");
    setVehicleId("");
  }

  function changeHaulier(nextHaulierId: string) {
    setHaulierId(nextHaulierId);
    setDriverId("");
    setVehicleId("");
  }

  function changeDriver(nextDriverId: string) {
    setDriverId(nextDriverId);

    const nextDriver = drivers.find((driver) => driver.id === nextDriverId);
    if (!nextDriver?.defaultVehicleId) return;

    const defaultVehicle = availableVehicles.find(
      (vehicle) => vehicle.id === nextDriver.defaultVehicleId,
    );

    if (defaultVehicle) setVehicleId(defaultVehicle.id);
  }

  function openQuickCreate(
    kind: "client" | "clientSite" | "haulier" | "driver" | "vehicle" | "material",
  ) {
    setQuickCreateError("");
    setQuickCreateKind(kind);
  }

  async function handleQuickCreateSubmit(formData: FormData) {
    if (!quickCreateKind) return;

    setQuickCreateSaving(true);
    setQuickCreateError("");

    try {
      if (quickCreateKind === "client") {
        const result = await quickCreateClientAction(formData);
        if (!result.ok) {
          setQuickCreateError(result.error);
          return;
        }

        setClients((current) => [...current, result.data.client]);
        setClientId(result.data.client.id);

        if (result.data.site) {
          setClientSiteOptions((current) => [...current, result.data.site!]);
          setClientSiteId(result.data.site.id);
        } else {
          setClientSiteId("");
        }

        setQuickCreateKind(null);
        return;
      }

      if (quickCreateKind === "clientSite") {
        const result = await quickCreateClientSiteAction(formData);
        if (!result.ok) {
          setQuickCreateError(result.error);
          return;
        }

        setClientSiteOptions((current) => [...current, result.data]);
        setClientSiteId(result.data.id);
        setQuickCreateKind(null);
        return;
      }

      if (quickCreateKind === "haulier") {
        const result = await quickCreateHaulierAction(formData);
        if (!result.ok) {
          setQuickCreateError(result.error);
          return;
        }

        setHauliers((current) => [...current, result.data]);
        setTransportMode("external");
        setHaulierId(result.data.id);
        setDriverId("");
        setVehicleId("");
        setQuickCreateKind(null);
        return;
      }

      if (quickCreateKind === "driver") {
        const result = await quickCreateDriverAction(formData);
        if (!result.ok) {
          setQuickCreateError(result.error);
          return;
        }

        setDrivers((current) => [...current, result.data]);
        setDriverId(result.data.id);
        setQuickCreateKind(null);
        return;
      }

      if (quickCreateKind === "vehicle") {
        const result = await quickCreateVehicleAction(formData);
        if (!result.ok) {
          setQuickCreateError(result.error);
          return;
        }

        setVehicles((current) => [...current, result.data]);
        setVehicleId(result.data.id);
        setQuickCreateKind(null);
        return;
      }

      const result = await quickCreateMaterialAction(formData);
      if (!result.ok) {
        setQuickCreateError(result.error);
        return;
      }

      setMaterials((current) => [...current, result.data]);
      setMaterialProfileId(result.data.id);
      setQuickCreateKind(null);
    } finally {
      setQuickCreateSaving(false);
    }
  }

  const canSubmit =
    Boolean(jobDate) &&
    Boolean(clientId) &&
    Boolean(clientSiteId) &&
    (transportMode === "own" ||
      (transportMode === "external" && Boolean(haulierId))) &&
    Boolean(materialProfileId) &&
    materialIsPermitted;

  const bookingChecks = [
    {
      label: "Job date",
      ok: Boolean(jobDate),
    },
    {
      label: "Client",
      ok: Boolean(clientId),
    },
    {
      label: "Waste origin",
      ok: Boolean(clientSiteId),
    },
    {
      label: "Transport arrangement",
      ok:
        transportMode === "own" ||
        (transportMode === "external" && Boolean(haulierId)),
    },
    {
      label: "Material",
      ok: Boolean(materialProfileId),
    },
    {
      label: "Receiving permit match",
      ok: Boolean(materialProfileId) && materialIsPermitted,
    },
  ];

  const missingBookingChecks = bookingChecks.filter((check) => !check.ok);

  return (
    <>
      <form action={createJobAction} className="space-y-6">
      <input type="hidden" name="source" value={initialValues?.source ?? "manual"} />
      <input
        type="hidden"
        name="sourceTemplateId"
        value={initialValues?.sourceTemplateId ?? ""}
      />

      {initialValues?.sourceLabel && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-900">
          <span className="font-semibold">Prefilled from:</span>{" "}
          {initialValues.sourceLabel}. Review the booking before saving.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">
          {ERROR_MESSAGES[error] ?? "The job could not be booked. Check the form and try again."}
        </div>
      )}

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="space-y-6">
          <Card title="Job details" eyebrow="1 · Plan the work">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Job date" required>
                <input
                  type="date"
                  name="jobDate"
                  value={jobDate}
                  onChange={(event) => setJobDate(event.target.value)}
                  required
                  className={inputClass}
                />
              </Field>

              <Field label="Number of loads" required>
                <input
                  type="number"
                  name="plannedLoads"
                  min={1}
                  max={100}
                  defaultValue={initialValues?.plannedLoads ?? 1}
                  required
                  className={inputClass}
                />
              </Field>

              <Field label="PO number">
                <input
                  name="purchaseOrder"
                  defaultValue={initialValues?.purchaseOrder ?? ""}
                  placeholder="Optional purchase order"
                  className={inputClass}
                />
              </Field>

              <Field label="Customer reference">
                <input
                  name="customerReference"
                  defaultValue={initialValues?.customerReference ?? ""}
                  placeholder="Site/job/reference number"
                  className={inputClass}
                />
              </Field>
            </div>
          </Card>

          <Card title="Client & waste origin" eyebrow="2 · Where the waste comes from">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Client" required>
                <select
                  name="clientId"
                  value={clientId}
                  onChange={(event) => changeClient(event.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Choose client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.accountReference ? ` · ${client.accountReference}` : ""}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Client site / waste origin" required>
                <select
                  name="clientSiteId"
                  value={clientSiteId}
                  onChange={(event) => setClientSiteId(event.target.value)}
                  required
                  className={inputClass}
                >
                  <option value="">Choose origin</option>
                  {clientSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}{site.postcode ? ` · ${site.postcode}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <QuickActionButton onClick={() => openQuickCreate("client")}>
                + New client
              </QuickActionButton>

              {clientId && (
                <QuickActionButton onClick={() => openQuickCreate("clientSite")}>
                  + New client site
                </QuickActionButton>
              )}

              {clientId && (
                <QuickLink href={`/home/clients/${clientId}`}>
                  Manage client
                </QuickLink>
              )}
            </div>
          </Card>

          <Card title="Transport" eyebrow="3 · Who is moving it">
            <input type="hidden" name="transportMode" value={transportMode} />

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() => changeTransportMode("own")}
                className={`rounded-2xl border p-4 text-left transition ${
                  transportMode === "own"
                    ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                    : "border-black/10 bg-[#faf8f4] hover:border-orange-300"
                }`}
              >
                <p className="text-sm font-semibold text-black">Own transport</p>
                <p className="mt-1 text-xs leading-5 text-black/45">
                  Your organisation handles the movement. No external haulier is required.
                </p>
              </button>

              <button
                type="button"
                onClick={() => changeTransportMode("external")}
                className={`rounded-2xl border p-4 text-left transition ${
                  transportMode === "external"
                    ? "border-orange-400 bg-orange-50 ring-2 ring-orange-100"
                    : "border-black/10 bg-[#faf8f4] hover:border-orange-300"
                }`}
              >
                <p className="text-sm font-semibold text-black">External haulier</p>
                <p className="mt-1 text-xs leading-5 text-black/45">
                  Choose another registered carrier that will transport the waste.
                </p>
              </button>
            </div>

            {!transportMode && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                Choose a transport arrangement. Waste X will not assume own transport or
                silently select a haulier for a new booking.
              </div>
            )}

            {transportMode === "external" && (
              <div className="mt-4">
                <Field label="Haulier" required>
                  <select
                    name="haulierId"
                    value={haulierId}
                    onChange={(event) => changeHaulier(event.target.value)}
                    required
                    className={inputClass}
                  >
                    <option value="">Choose haulier</option>
                    {hauliers.map((haulier) => (
                      <option key={haulier.id} value={haulier.id}>
                        {haulier.name}
                      </option>
                    ))}
                  </select>
                </Field>

                {hauliers.length === 0 && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                    No external hauliers are configured yet. Switch to own transport or
                    add a haulier first.
                  </div>
                )}
              </div>
            )}

            {transportMode === "own" && (
              <input type="hidden" name="haulierId" value="" />
            )}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Driver">
                <select
                  name="driverId"
                  value={driverId}
                  onChange={(event) => changeDriver(event.target.value)}
                  disabled={!transportMode}
                  className={inputClass}
                >
                  <option value="">
                    {transportMode ? "Assign later" : "Choose transport first"}
                  </option>
                  {availableDrivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Vehicle">
                <select
                  name="vehicleId"
                  value={vehicleId}
                  onChange={(event) => setVehicleId(event.target.value)}
                  disabled={!transportMode}
                  className={inputClass}
                >
                  <option value="">
                    {transportMode ? "Assign later" : "Choose transport first"}
                  </option>
                  {availableVehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.registrationNumber}
                      {vehicle.vehicleType ? ` · ${vehicle.vehicleType}` : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <p className="mt-3 text-xs leading-5 text-black/45">
              Driver and vehicle are optional at booking time. They can be assigned when
              the actual load is dispatched or received.
            </p>

            {transportMode === "external" &&
              selectedHaulier &&
              !selectedHaulier.carrierRegistrationNumber && (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                  This haulier does not currently have a carrier registration number saved.
                  You can still plan the job, but the carrier details must be resolved before
                  the DWT receipt is submitted.
                </div>
              )}

            {transportMode === "own" &&
              ownDrivers.length === 0 &&
              ownVehicles.length === 0 && (
                <div className="mt-4 rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-xs leading-5 text-black/55">
                  No own drivers or vehicles are saved yet. That does not block the booking;
                  assign the actual transport later.
                </div>
              )}

            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              {transportMode === "external" && (
                <QuickActionButton onClick={() => openQuickCreate("haulier")}>
                  + New haulier
                </QuickActionButton>
              )}

              {transportMode && (
                <>
                  <QuickActionButton onClick={() => openQuickCreate("driver")}>
                    + New driver
                  </QuickActionButton>

                  <QuickActionButton onClick={() => openQuickCreate("vehicle")}>
                    + New vehicle
                  </QuickActionButton>
                </>
              )}

              <QuickLink href="/home/transport">Manage transport</QuickLink>
            </div>
          </Card>

          <Card title="Waste material" eyebrow="4 · What is being moved">
            <Field label="Material profile" required>
              <select
                name="materialProfileId"
                value={materialProfileId}
                onChange={(event) => setMaterialProfileId(event.target.value)}
                required
                className={inputClass}
              >
                <option value="">Choose material</option>
                {sortedMaterials.map((material) => {
                  const permitted = permittedEwcIds.has(material.ewcCodeId);

                  return (
                    <option key={material.id} value={material.id}>
                      {material.isFavourite ? "★ " : ""}
                      {material.name} · {material.ewcCode}
                      {permitted ? "" : " · NOT ON RECEIVING PERMIT"}
                    </option>
                  );
                })}
              </select>
            </Field>

            {selectedMaterial && (
              <div
                className={`mt-4 rounded-2xl border px-4 py-4 text-sm ${
                  materialIsPermitted
                    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
                    : "border-red-200 bg-red-50 text-red-900"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">
                      {selectedMaterial.ewcCode} · {selectedMaterial.name}
                    </p>
                    <p className="mt-1 text-xs opacity-75">
                      {selectedMaterial.wasteDescription}
                    </p>
                  </div>

                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold shadow-sm">
                    {materialIsPermitted ? "✓ Permit match" : "✕ Not permitted here"}
                  </span>
                </div>
              </div>
            )}

            <div className="mt-4 flex flex-wrap gap-3 text-xs">
              <QuickActionButton onClick={() => openQuickCreate("material")}>
                + New material
              </QuickActionButton>
              <QuickLink href="/home/materials">Manage material profiles</QuickLink>
            </div>
          </Card>

          <Card title="Job-specific pricing" eyebrow="5 · Commercial">
            <input
              type="hidden"
              name="pricingSourceRateId"
              value={pricingSourceRateId}
            />

            <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-700">
                This Job is the pricing authority
              </p>
              <p className="mt-2 text-sm leading-6 text-orange-950/70">
                Enter what was agreed for this Job. The next Job can have a completely
                different price. The Rate Library is optional and only supplies suggestions.
              </p>
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-[1.35fr_0.55fr_0.55fr_0.45fr]">
              <Field label="Customer charge description">
                <input
                  name="customerChargeDescription"
                  value={customerChargeDescription}
                  onChange={(event) =>
                    setCustomerChargeDescription(event.target.value)
                  }
                  className={inputClass}
                />
              </Field>

              <Field label="Customer price £">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  name="customerChargeAmount"
                  value={customerChargeAmount}
                  onChange={(event) => {
                    setCustomerChargeAmount(event.target.value);
                    setPricingSourceRateId("");
                  }}
                  placeholder="e.g. 52.00"
                  className={inputClass}
                />
              </Field>

              <Field label="Unit">
                <select
                  name="customerChargeUnit"
                  value={customerChargeUnit}
                  onChange={(event) =>
                    setCustomerChargeUnit(
                      event.target.value as "tonne" | "load" | "job",
                    )
                  }
                  className={inputClass}
                >
                  <option value="tonne">Per tonne</option>
                  <option value="load">Per load</option>
                  <option value="job">Per Job</option>
                </select>
              </Field>

              <Field label="VAT %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  name="customerVatRate"
                  value={customerVatRate}
                  onChange={(event) => setCustomerVatRate(event.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="grid grid-cols-[1fr_135px] gap-3 rounded-2xl border border-black/10 bg-[#faf8f4] p-4">
                <Field label="Haulage cost £">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="haulageCostAmount"
                    value={haulageCostAmount}
                    onChange={(event) => setHaulageCostAmount(event.target.value)}
                    placeholder={
                      transportMode === "own"
                        ? "Optional internal/direct cost"
                        : "Optional"
                    }
                    className={inputClass}
                  />
                </Field>

                <Field label="Unit">
                  <select
                    name="haulageCostUnit"
                    value={haulageCostUnit}
                    onChange={(event) =>
                      setHaulageCostUnit(
                        event.target.value as "tonne" | "load" | "job",
                      )
                    }
                    className={inputClass}
                  >
                    <option value="tonne">/ tonne</option>
                    <option value="load">/ load</option>
                    <option value="job">/ Job</option>
                  </select>
                </Field>
              </div>

              <div className="grid grid-cols-[1fr_135px] gap-3 rounded-2xl border border-black/10 bg-[#faf8f4] p-4">
                <Field label="Other / tipping cost £">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    name="tippingCostAmount"
                    value={tippingCostAmount}
                    onChange={(event) => setTippingCostAmount(event.target.value)}
                    placeholder="Optional direct cost"
                    className={inputClass}
                  />
                </Field>

                <Field label="Unit">
                  <select
                    name="tippingCostUnit"
                    value={tippingCostUnit}
                    onChange={(event) =>
                      setTippingCostUnit(
                        event.target.value as "tonne" | "load" | "job",
                      )
                    }
                    className={inputClass}
                  >
                    <option value="tonne">/ tonne</option>
                    <option value="load">/ load</option>
                    <option value="job">/ Job</option>
                  </select>
                </Field>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-black/10 bg-white p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
                    Optional Rate Library suggestions
                  </p>
                  <p className="mt-1 text-xs leading-5 text-black/45">
                    Nothing is applied automatically. Use a suggestion, then edit it if
                    this Job was agreed differently.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useStoredPricingSuggestions}
                    disabled={!customerRate && !haulageRate}
                    className="rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30"
                  >
                    Use available suggestions
                  </button>

                  <button
                    type="button"
                    onClick={clearJobPricing}
                    className="rounded-xl border border-black/10 px-4 py-2.5 text-xs font-semibold text-black/55"
                  >
                    Clear pricing
                  </button>

                  <QuickLink href="/home/rates">
                    Rate Library / history
                  </QuickLink>
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <RatePreview
                  label="Suggested customer charge"
                  rate={customerRate}
                  empty="No matching stored suggestion"
                />
                <RatePreview
                  label="Suggested haulage cost"
                  rate={haulageRate}
                  empty={
                    !transportMode
                      ? "Choose transport first"
                      : transportMode === "own"
                        ? "No external-haulier suggestion needed"
                        : "No matching stored suggestion"
                  }
                />
              </div>
            </div>

            <p className="mt-4 text-xs leading-5 text-black/45">
              Pricing is optional at booking, but when entered it is saved as
              Job-specific commercial terms. Waste X also mirrors the core values onto
              planned Loads for compatibility with existing operational exports.
            </p>
          </Card>

          <Card title="Notes" eyebrow="6 · Optional">
            <textarea
              name="notes"
              rows={4}
              defaultValue={initialValues?.notes ?? ""}
              placeholder="Access instructions, booking notes, restrictions..."
              className={`${inputClass} min-h-28 py-3`}
            />
          </Card>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-36 xl:self-start">
          <section className="overflow-hidden rounded-[2rem] bg-black text-white shadow-xl">
            <div className="border-b border-white/10 px-6 py-5">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-400">
                Booking preview
              </p>
              <h2 className="mt-2 text-xl font-semibold">Incoming job</h2>
            </div>

            <div className="space-y-5 px-6 py-6">
              <PreviewRow label="Client" value={selectedClient?.name ?? "Not selected"} />
              <PreviewRow label="Origin" value={selectedClientSite?.name ?? "Not selected"} />
              <PreviewRow label="Material" value={selectedMaterial ? `${selectedMaterial.name} · ${selectedMaterial.ewcCode}` : "Not selected"} />
              <PreviewRow
                label="Transport"
                value={
                  !transportMode
                    ? "Not selected"
                    : transportMode === "own"
                      ? "Own transport"
                      : selectedHaulier?.name ?? "External haulier not selected"
                }
              />
              <PreviewRow label="Driver" value={selectedDriver?.name ?? "Assign later"} />
              <PreviewRow
                label="Vehicle"
                value={selectedVehicle?.registrationNumber ?? "Assign later"}
              />
            </div>
          </section>

          <section className="rounded-[2rem] border border-orange-200 bg-orange-50 p-6">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-700">
              Destination · automatic
            </p>
            <h3 className="mt-2 text-lg font-semibold text-black">
              {data.receivingSite.name}
            </h3>
            <p className="mt-2 text-sm leading-6 text-black/55">
              {[data.receivingSite.fullAddress, data.receivingSite.postcode]
                .filter(Boolean)
                .join(" · ") || "Receiving-site address"}
            </p>
            <div className="mt-4 rounded-xl bg-white px-3 py-2 text-xs font-medium text-black/65">
              Permit {data.primaryPermit.permitNumber}
            </div>
            <p className="mt-3 text-xs leading-5 text-black/45">
              Solo mode has one primary receiving site, so staff do not need to choose
              the destination on every incoming booking.
            </p>
          </section>

          <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-black/40">
              What Save does
            </p>
            <div className="mt-4 space-y-3 text-sm text-black/65">
              <p>1. Creates the booked Job.</p>
              <p>2. Creates the planned Load records.</p>
              <p>3. Saves this Job's commercial terms and mirrors core values onto each planned Load.</p>
              <p>4. Keeps DWT creation for the actual receipt stage.</p>
            </div>
          </section>

          <section
            className={`rounded-[2rem] border p-6 shadow-sm ${
              canSubmit
                ? "border-emerald-200 bg-emerald-50"
                : "border-black/10 bg-white"
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p
                  className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    canSubmit ? "text-emerald-700" : "text-black/35"
                  }`}
                >
                  Final booking check
                </p>
                <h3 className="mt-2 text-lg font-semibold text-black">
                  {canSubmit
                    ? "Ready to book"
                    : `${missingBookingChecks.length} item${
                        missingBookingChecks.length === 1 ? "" : "s"
                      } to resolve`}
                </h3>
              </div>

              <span
                className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  canSubmit
                    ? "bg-emerald-600 text-white"
                    : "bg-black/5 text-black/45"
                }`}
              >
                {canSubmit ? "Ready" : "Check"}
              </span>
            </div>

            <div className="mt-4 grid gap-2">
              {bookingChecks.map((check) => (
                <BookingCheck key={check.label} label={check.label} ok={check.ok} />
              ))}
            </div>

            <div className="mt-4 border-t border-black/5 pt-4 text-xs leading-5 text-black/45">
              Driver, vehicle and Job pricing remain optional at booking time. Stored
              Rate Library values are suggestions only and are never applied silently.
            </div>
          </section>

          {!materialIsPermitted && selectedMaterial && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800">
              This booking cannot be saved to your receiving site until the selected EWC
              is authorised on the active permit. Choose another material or review the
              permit setup.
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-orange-500 px-5 py-4 text-sm font-bold text-black shadow-lg transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/35 disabled:shadow-none"
          >
            Book Job
          </button>

          <Link
            href="/home/jobs"
            className="block text-center text-xs font-semibold text-black/45 transition hover:text-black"
          >
            Cancel and return to Jobs
          </Link>
        </aside>
      </section>
      </form>

      {quickCreateKind && (
        <QuickCreateModal
          kind={quickCreateKind}
          clientId={clientId}
          clientName={selectedClient?.name ?? null}
          transportMode={transportMode}
          haulierId={haulierId}
          haulierName={selectedHaulier?.name ?? null}
          permittedEwcCodes={data.permittedEwcCodes}
          error={quickCreateError}
          saving={quickCreateSaving}
          onClose={() => {
            if (!quickCreateSaving) {
              setQuickCreateError("");
              setQuickCreateKind(null);
            }
          }}
          onSubmit={handleQuickCreateSubmit}
        />
      )}
    </>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100";

function Card({
  title,
  eyebrow,
  children,
}: {
  title: string;
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.25em] text-orange-600">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-black">{title}</h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold text-black/60">
        {label}
        {required ? <span className="ml-1 text-orange-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function QuickLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-full border border-black/10 bg-[#faf8f4] px-3 py-1.5 font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
    >
      {children}
    </Link>
  );
}

function QuickActionButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 font-semibold text-orange-700 transition hover:border-orange-400 hover:bg-orange-100"
    >
      {children}
    </button>
  );
}

type QuickCreateKind =
  | "client"
  | "clientSite"
  | "haulier"
  | "driver"
  | "vehicle"
  | "material";

function QuickCreateModal({
  kind,
  clientId,
  clientName,
  transportMode,
  haulierId,
  haulierName,
  permittedEwcCodes,
  error,
  saving,
  onClose,
  onSubmit,
}: {
  kind: QuickCreateKind;
  clientId: string;
  clientName: string | null;
  transportMode: "" | "own" | "external";
  haulierId: string;
  haulierName: string | null;
  permittedEwcCodes: BookJobFormData["permittedEwcCodes"];
  error: string;
  saving: boolean;
  onClose: () => void;
  onSubmit: (formData: FormData) => Promise<void>;
}) {
  const firstEwc = permittedEwcCodes[0];
  const [materialEwcId, setMaterialEwcId] = useState(firstEwc?.id ?? "");
  const [materialHazardous, setMaterialHazardous] = useState(
    firstEwc?.isHazardous === true,
  );

  const selectedMaterialEwc = permittedEwcCodes.find(
    (item) => item.id === materialEwcId,
  );

  const titles: Record<QuickCreateKind, { eyebrow: string; title: string; description: string }> = {
    client: {
      eyebrow: "Quick create · Client",
      title: "Add a client without leaving the booking",
      description:
        "Create the customer and, if you already know it, their first waste-origin site. The new record is selected immediately.",
    },
    clientSite: {
      eyebrow: "Quick create · Origin",
      title: "Add a client site",
      description:
        "Add a new project or waste-origin site for the client currently selected on this booking.",
    },
    haulier: {
      eyebrow: "Quick create · Transport",
      title: "Add an external haulier",
      description:
        "Save the carrier now and return straight to the booking. Driver and vehicle can still be assigned later.",
    },
    driver: {
      eyebrow: "Quick create · Transport",
      title: "Add a driver",
      description:
        transportMode === "own"
          ? "This driver will be saved as part of your own transport operation."
          : transportMode === "external"
            ? `This driver will be linked to ${haulierName ?? "the selected external haulier"}.`
            : "Choose own transport or an external haulier on the booking first.",
    },
    vehicle: {
      eyebrow: "Quick create · Transport",
      title: "Add a vehicle",
      description:
        transportMode === "own"
          ? "This vehicle will be saved as part of your own fleet."
          : transportMode === "external"
            ? `This vehicle will be linked to ${haulierName ?? "the selected external haulier"}.`
            : "Choose own transport or an external haulier on the booking first.",
    },
    material: {
      eyebrow: "Quick create · Material",
      title: "Add a material profile",
      description:
        "This fast path only offers EWC codes accepted by the current receiving permit so the material can be used on this incoming booking immediately.",
    },
  };

  const copy = titles[kind];
  const transportOwnerMissing =
    (kind === "driver" || kind === "vehicle") &&
    (!transportMode || (transportMode === "external" && !haulierId));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || transportOwnerMissing) return;
    await onSubmit(new FormData(event.currentTarget));
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 px-4 py-8 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/10 bg-[#f7f3ed] shadow-2xl">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-6 border-b border-black/10 bg-[#f7f3ed]/95 px-6 py-5 backdrop-blur">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              {copy.eyebrow}
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-black">
              {copy.title}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-black/50">
              {copy.description}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-black/10 bg-white text-lg text-black/45 transition hover:border-orange-300 hover:text-orange-700 disabled:opacity-40"
            aria-label="Close quick create"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="space-y-5 p-6">
          {error && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          )}

          {transportOwnerMissing && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Choose or create the external haulier first, then add its {kind}.
            </div>
          )}

          {kind === "client" && (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Client name" required>
                  <input name="name" required autoFocus className={inputClass} />
                </Field>

                <Field label="Account reference">
                  <input name="accountReference" className={inputClass} />
                </Field>

                <Field label="Email">
                  <input type="email" name="email" className={inputClass} />
                </Field>

                <Field label="Telephone">
                  <input name="telephone" className={inputClass} />
                </Field>
              </div>

              <div className="rounded-2xl border border-black/10 bg-white p-4">
                <p className="text-xs font-semibold text-black">
                  First waste-origin site <span className="font-normal text-black/40">· optional</span>
                </p>
                <p className="mt-1 text-xs leading-5 text-black/40">
                  Adding this now means the new client is immediately ready for this booking.
                </p>

                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <Field label="Site / project name">
                    <input name="siteName" className={inputClass} />
                  </Field>
                  <Field label="Postcode">
                    <input name="sitePostcode" className={inputClass} />
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Full address">
                      <input name="siteAddress" className={inputClass} />
                    </Field>
                  </div>
                </div>
              </div>
            </>
          )}

          {kind === "clientSite" && (
            <>
              <input type="hidden" name="clientId" value={clientId} />

              <div className="rounded-2xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
                Client: <span className="font-semibold">{clientName ?? "Selected client"}</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Site / project name" required>
                  <input name="name" required autoFocus className={inputClass} />
                </Field>
                <Field label="Postcode">
                  <input name="postcode" className={inputClass} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Full address">
                    <input name="fullAddress" className={inputClass} />
                  </Field>
                </div>
                <Field label="Site contact">
                  <input name="contactName" className={inputClass} />
                </Field>
                <Field label="Contact telephone">
                  <input name="contactTelephone" className={inputClass} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Contact email">
                    <input type="email" name="contactEmail" className={inputClass} />
                  </Field>
                </div>
              </div>
            </>
          )}

          {kind === "haulier" && (
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Haulier name" required>
                <input name="name" required autoFocus className={inputClass} />
              </Field>
              <Field label="Carrier registration number">
                <input
                  name="carrierRegistrationNumber"
                  placeholder="CBDU..."
                  className={inputClass}
                />
              </Field>
              <Field label="Email">
                <input type="email" name="email" className={inputClass} />
              </Field>
              <Field label="Telephone">
                <input name="telephone" className={inputClass} />
              </Field>
              <p className="md:col-span-2 text-xs leading-5 text-black/45">
                You can plan the job without a registration number, but carrier details must be complete before the relevant DWT receipt is submitted.
              </p>
            </div>
          )}

          {kind === "driver" && (
            <>
              <input type="hidden" name="ownerMode" value={transportMode} />
              <input
                type="hidden"
                name="haulierCounterpartyId"
                value={transportMode === "external" ? haulierId : ""}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Driver name" required>
                  <input name="name" required autoFocus className={inputClass} />
                </Field>
                <Field label="Telephone">
                  <input name="telephone" className={inputClass} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Email">
                    <input type="email" name="email" className={inputClass} />
                  </Field>
                </div>
              </div>
            </>
          )}

          {kind === "vehicle" && (
            <>
              <input type="hidden" name="ownerMode" value={transportMode} />
              <input
                type="hidden"
                name="haulierCounterpartyId"
                value={transportMode === "external" ? haulierId : ""}
              />

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Registration number" required>
                  <input
                    name="registrationNumber"
                    required
                    autoFocus
                    placeholder="AB12 CDE"
                    className={inputClass}
                  />
                </Field>
                <Field label="Vehicle type">
                  <input
                    name="vehicleType"
                    placeholder="Tipper, skip lorry, artic..."
                    className={inputClass}
                  />
                </Field>
              </div>
            </>
          )}

          {kind === "material" && (
            <>
              {permittedEwcCodes.length === 0 ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  No permitted EWC codes are configured on the receiving permit. Add them before creating a material from this booking.
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Material profile name" required>
                    <input name="name" required autoFocus className={inputClass} />
                  </Field>

                  <Field label="EWC code" required>
                    <select
                      name="ewcCodeId"
                      value={materialEwcId}
                      onChange={(event) => {
                        const nextId = event.target.value;
                        setMaterialEwcId(nextId);
                        const nextEwc = permittedEwcCodes.find((item) => item.id === nextId);
                        setMaterialHazardous(nextEwc?.isHazardous === true);
                      }}
                      required
                      className={inputClass}
                    >
                      {permittedEwcCodes.map((ewc) => (
                        <option key={ewc.id} value={ewc.id}>
                          {ewc.code} · {ewc.description}
                        </option>
                      ))}
                    </select>
                  </Field>

                  <div className="md:col-span-2">
                    <Field label="Detailed waste description" required>
                      <input
                        name="wasteDescription"
                        required
                        placeholder={selectedMaterialEwc?.description ?? "Describe the waste"}
                        className={inputClass}
                      />
                    </Field>
                  </div>

                  <Field label="Physical form" required>
                    <select name="physicalForm" defaultValue="Solid" className={inputClass}>
                      <option value="Solid">Solid</option>
                      <option value="Mixed">Mixed</option>
                      <option value="Powder">Powder</option>
                      <option value="Sludge">Sludge</option>
                      <option value="Liquid">Liquid</option>
                      <option value="Gas">Gas</option>
                    </select>
                  </Field>

                  <Field label="Default weight unit" required>
                    <select name="defaultWeightMetric" defaultValue="Tonnes" className={inputClass}>
                      <option value="Tonnes">Tonnes</option>
                      <option value="Kilograms">Kilograms</option>
                      <option value="Grams">Grams</option>
                    </select>
                  </Field>

                  <Field label="Default number of containers" required>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      name="defaultNumberOfContainers"
                      defaultValue={1}
                      required
                      className={inputClass}
                    />
                  </Field>

                  <Field label="Default container type" required>
                    <input
                      name="defaultContainerType"
                      defaultValue="Bulk"
                      required
                      className={inputClass}
                    />
                  </Field>

                  <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/65">
                    <input
                      type="checkbox"
                      name="containsHazardous"
                      checked={materialHazardous}
                      onChange={(event) => setMaterialHazardous(event.target.checked)}
                      className="mt-0.5 size-4 accent-orange-500"
                    />
                    <span>
                      <span className="font-semibold text-black">Contains hazardous waste</span>
                      <span className="mt-1 block text-xs leading-5 text-black/45">
                        The EWC catalogue can prefill this hint, but the operator remains responsible for the actual waste classification.
                      </span>
                    </span>
                  </label>

                  <label className="flex items-start gap-3 rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/65">
                    <input
                      type="checkbox"
                      name="containsPops"
                      className="mt-0.5 size-4 accent-orange-500"
                    />
                    <span>
                      <span className="font-semibold text-black">Contains POPs</span>
                      <span className="mt-1 block text-xs leading-5 text-black/45">
                        POPs are separate from hazardous classification and should only be selected when applicable.
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </>
          )}

          <div className="flex flex-col-reverse gap-3 border-t border-black/10 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-black/55 transition hover:border-orange-300 hover:text-orange-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                saving ||
                transportOwnerMissing ||
                (kind === "material" && permittedEwcCodes.length === 0)
              }
              className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-bold text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:bg-black/15 disabled:text-black/35"
            >
              {saving ? "Saving..." : "Save & use"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function BookingCheck({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-white/70 px-3 py-2.5">
      <span className="text-xs font-medium text-black/60">{label}</span>
      <span
        className={`rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
          ok
            ? "bg-emerald-100 text-emerald-700"
            : "bg-amber-100 text-amber-800"
        }`}
      >
        {ok ? "OK" : "Needed"}
      </span>
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-white/85">{value}</p>
    </div>
  );
}

function RatePreview({
  label,
  rate,
  empty,
}: {
  label: string;
  rate: BookJobFormData["rates"][number] | null;
  empty: string;
}) {
  return (
    <div className="rounded-2xl border border-black/10 bg-[#faf8f4] p-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-black/35">
        {label}
      </p>
      {rate ? (
        <p className="mt-2 text-base font-semibold text-black">
          {money(rate.amount, rate.currency)} / {unitLabel(rate.unit)}
        </p>
      ) : (
        <p className="mt-2 text-sm text-black/40">{empty}</p>
      )}
    </div>
  );
}
