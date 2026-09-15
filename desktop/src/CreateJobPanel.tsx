import { invoke } from "@tauri-apps/api/core";
import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
} from "react";

type JobDirection = "incoming" | "outgoing";
type TransportMode = "own" | "external";
type PricingUnit = "tonne" | "load" | "job";

type Client = {
  id: string;
  name: string;
  accountReference: string | null;
};

type ClientSite = {
  id: string;
  counterpartyId: string;
  name: string;
  fullAddress: string | null;
  postcode: string | null;
  isDefault: boolean;
};

type Haulier = {
  id: string;
  name: string;
  carrierRegistrationNumber: string | null;
};

type Driver = {
  id: string;
  name: string;
  telephone: string | null;
  email: string | null;
  haulierCounterpartyId: string | null;
  defaultVehicleId: string | null;
};

type Vehicle = {
  id: string;
  registrationNumber: string;
  vehicleType: string | null;
  tareWeightKg: string | null;
  haulierCounterpartyId: string | null;
};

type Material = {
  id: string;
  name: string;
  ewcCodeId: string;
  ewcCode: string;
  wasteDescription: string;
  physicalForm: string;
  defaultWeightMetric: string;
  isFavourite: boolean;
};

type Facility = {
  id: string;
  counterpartyId: string;
  name: string;
  operatorName: string;
  postcode: string | null;
  fullAddress: string | null;
  authorisationNumber: string | null;
  permittedEwcCodeIds: string[];
};

type JobOptions = {
  ok: true;
  ownSite: {
    id: string;
    name: string;
    siteType: string;
  };
  primaryPermit: {
    id: string;
    permitNumber: string;
  };
  permittedEwcCodeIds: string[];
  regulatoryAcceptanceAuthorities: Array<{
    acceptedEwcCodeId: string;
    permittedEwcCode: string;
    basis: string;
    reference: string;
  }>;
  clients: Client[];
  clientSites: ClientSite[];
  hauliers: Haulier[];
  drivers: Driver[];
  vehicles: Vehicle[];
  materials: Material[];
  facilities: Facility[];
};

export type DesktopCreatedJob = {
  ok: true;
  job: {
    id: string;
    jobNumber: string;
    direction: JobDirection;
    jobDate: string;
  };
  jobLoads: Array<{
    id: string;
    loadNumber: number;
  }>;
  firstLoadId: string | null;
  syncFeedWarning: boolean;
};

type PricingState = {
  customerChargeDescription: string;
  customerChargeAmount: string;
  customerChargeUnit: PricingUnit;
  customerVatRate: string;

  materialSaleDescription: string;
  materialSaleAmount: string;
  materialSaleUnit: PricingUnit;
  materialSaleVatRate: string;

  haulageCostAmount: string;
  haulageCostUnit: PricingUnit;

  tippingCostAmount: string;
  tippingCostUnit: PricingUnit;
};

function londonToday() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function nullable(value: string) {
  const clean = value.trim();
  return clean ? clean : null;
}

export function CreateJobPanel({
  cloudReachable,
  siteName,
  onCreated,
}: {
  cloudReachable: boolean;
  siteName: string;
  onCreated: (created: DesktopCreatedJob) => Promise<void> | void;
}) {
  const [options, setOptions] = useState<JobOptions | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  /* WASTE_X_DESKTOP_CREATE_ACTION_TOAST_V1 */
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 7000);
    return () => window.clearTimeout(timer);
  }, [message]);

  const [direction, setDirection] =
    useState<JobDirection>("incoming");
  const [jobDate, setJobDate] = useState(londonToday);
  const [plannedLoads, setPlannedLoads] = useState("1");
  const [purchaseOrder, setPurchaseOrder] = useState("");
  const [customerReference, setCustomerReference] = useState("");

  const [clientId, setClientId] = useState("");
  const [clientSiteId, setClientSiteId] = useState("");
  const [destinationSiteId, setDestinationSiteId] = useState("");

  const [materialProfileId, setMaterialProfileId] = useState("");
  const [
    additionalMaterialProfileIds,
    setAdditionalMaterialProfileIds,
  ] = useState<string[]>([]);

  const [transportMode, setTransportMode] =
    useState<TransportMode>("own");
  const [haulierId, setHaulierId] = useState("");
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const [notes, setNotes] = useState("");

  const [pricing, setPricing] = useState<PricingState>({
    customerChargeDescription: "Waste acceptance / disposal",
    customerChargeAmount: "",
    customerChargeUnit: "tonne",
    customerVatRate: "20.00",

    materialSaleDescription: "Material sale / outgoing service",
    materialSaleAmount: "",
    materialSaleUnit: "tonne",
    materialSaleVatRate: "20.00",

    haulageCostAmount: "",
    haulageCostUnit: "load",

    tippingCostAmount: "",
    tippingCostUnit: "tonne",
  });

  async function fetchOptions() {
    setLoading(true);
    setMessage(null);

    try {
      const result = await invoke<JobOptions>(
        "desktop_job_options",
      );
      setOptions(result);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchOptions();
  }, [cloudReachable]);

  const clientSites = useMemo(
    () =>
      (options?.clientSites ?? []).filter(
        (site) => site.counterpartyId === clientId,
      ),
    [options, clientId],
  );

  const ownerId =
    transportMode === "external"
      ? haulierId || "__no_haulier__"
      : null;

  const availableDrivers = useMemo(
    () =>
      (options?.drivers ?? []).filter(
        (driver) => driver.haulierCounterpartyId === ownerId,
      ),
    [options, ownerId],
  );

  const availableVehicles = useMemo(
    () =>
      (options?.vehicles ?? []).filter(
        (vehicle) => vehicle.haulierCounterpartyId === ownerId,
      ),
    [options, ownerId],
  );

  const selectedMaterial =
    options?.materials.find(
      (material) => material.id === materialProfileId,
    ) ?? null;

  const additionalMaterials = additionalMaterialProfileIds.map(
    (id) =>
      options?.materials.find((material) => material.id === id) ??
      null,
  );
  const selectedWasteItemIds = [
    materialProfileId,
    ...additionalMaterialProfileIds,
  ].filter(Boolean);
  const wasteItemsAreUnique =
    new Set(selectedWasteItemIds).size ===
    selectedWasteItemIds.length;
  const additionalWasteItemsAccepted =
    direction !== "incoming" ||
    additionalMaterialProfileIds.every((id, index) => {
      const material = additionalMaterials[index];
      return Boolean(
        id &&
          material &&
          options?.permittedEwcCodeIds.includes(
            material.ewcCodeId,
          ),
      );
    });

  const selectedFacility =
    options?.facilities.find(
      (facility) => facility.id === destinationSiteId,
    ) ?? null;

  const ownPermitMatch = Boolean(
    selectedMaterial &&
      options?.permittedEwcCodeIds.includes(
        selectedMaterial.ewcCodeId,
      ),
  );

  const destinationPermitMatch =
    direction === "incoming"
      ? true
      : Boolean(
          selectedMaterial &&
            selectedFacility &&
            selectedFacility.permittedEwcCodeIds.includes(
              selectedMaterial.ewcCodeId,
            ),
        );

  const requiredReady =
    Boolean(options) &&
    Boolean(jobDate) &&
    Number(plannedLoads) >= 1 &&
    Number(plannedLoads) <= 100 &&
    Boolean(materialProfileId) &&
    ownPermitMatch &&
    additionalWasteItemsAccepted &&
    wasteItemsAreUnique &&
    (direction === "incoming"
      ? Boolean(clientId && clientSiteId)
      : Boolean(destinationSiteId && destinationPermitMatch)) &&
    (transportMode === "own" || Boolean(haulierId));

  function changeDirection(next: JobDirection) {
    setDirection(next);
    setMessage(null);

    if (next === "incoming") {
      setDestinationSiteId("");
    } else {
      setClientId("");
      setClientSiteId("");
      setAdditionalMaterialProfileIds([]);
    }
  }

  function changeTransportMode(next: TransportMode) {
    setTransportMode(next);
    setHaulierId("");
    setDriverId("");
    setVehicleId("");
  }

  function changeHaulier(next: string) {
    setHaulierId(next);
    setDriverId("");
    setVehicleId("");
  }

  function pricingPayload(): Record<string, string> {
    if (direction === "incoming") {
      return {
        pricingSourceRateId: "",
        customerChargeDescription:
          pricing.customerChargeDescription,
        customerChargeAmount: pricing.customerChargeAmount,
        customerChargeUnit: pricing.customerChargeUnit,
        customerVatRate: pricing.customerVatRate,
        haulageCostAmount: pricing.haulageCostAmount,
        haulageCostUnit: pricing.haulageCostUnit,
        tippingCostAmount: pricing.tippingCostAmount,
        tippingCostUnit: pricing.tippingCostUnit,
      };
    }

    return {
      pricingSourceRateId: "",
      materialSaleDescription: pricing.materialSaleDescription,
      materialSaleAmount: pricing.materialSaleAmount,
      materialSaleUnit: pricing.materialSaleUnit,
      materialSaleVatRate: pricing.materialSaleVatRate,
      haulageCostAmount: pricing.haulageCostAmount,
      haulageCostUnit: pricing.haulageCostUnit,
      tippingCostAmount: pricing.tippingCostAmount,
      tippingCostUnit: pricing.tippingCostUnit,
    };
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!requiredReady) {
      setMessage(
        "Complete the required Job, route, material and transport details first.",
      );
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const created = await invoke<DesktopCreatedJob>(
        "desktop_create_job_local",
        {
          input: {
            direction,
            jobDate,
            plannedLoads: Number(plannedLoads),
            purchaseOrder: nullable(purchaseOrder),
            customerReference: nullable(customerReference),
            notes: nullable(notes),

            clientId:
              direction === "incoming"
                ? nullable(clientId)
                : null,
            clientSiteId:
              direction === "incoming"
                ? nullable(clientSiteId)
                : null,
            destinationSiteId:
              direction === "outgoing"
                ? nullable(destinationSiteId)
                : null,

            transportMode,
            haulierId:
              transportMode === "external"
                ? nullable(haulierId)
                : null,
            driverId: nullable(driverId),
            vehicleId: nullable(vehicleId),

            materialProfileId,
            materialProfileIds:
              direction === "incoming"
                ? [
                    materialProfileId,
                    ...additionalMaterialProfileIds.filter(Boolean),
                  ]
                : [materialProfileId],
            pricing: pricingPayload(),
          },
        },
      );

      if (cloudReachable) {
        try {
          await invoke("desktop_sync_job_mutations");
        } catch {
          // The Job is already encrypted locally and automatic sync will retry.
        }
      }

      await onCreated(created);
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="pilot-screen pilot-scroll-screen">
      <div className="pilot-page-heading">
        <div>
          <span className="eyebrow">Site operations</span>
          <h1>Create Job</h1>
          <p>
            Create a full incoming or outgoing Waste X Job from this
            workstation.
          </p>
        </div>

        <div className="pilot-create-site">
          <span>Workstation site</span>
          <strong>{options?.ownSite.name ?? siteName}</strong>
          {options?.primaryPermit.permitNumber ? (
            <small>
              Primary permit {options.primaryPermit.permitNumber}
            </small>
          ) : null}
        </div>
      </div>
{message ? (
        <div className="pilot-action-toast error" role="alert" aria-live="assertive">
          <div>
            <strong>Action unsuccessful</strong>
            <span>{message}</span>
          </div>
          <button type="button" onClick={() => setMessage(null)} aria-label="Dismiss message">
            ×
          </button>
        </div>
      ) : null}

      {loading && !options ? (
        <div className="empty-state">
          Loading Waste X Job options…
        </div>
      ) : null}

      {options ? (
        <form className="pilot-create-form" onSubmit={submit}>
          <section className="pilot-create-card pilot-create-direction">
            <div className="pilot-create-card-heading">
              <span className="eyebrow">1 · Movement</span>
              <h2>Direction</h2>
            </div>

            <div className="pilot-direction-switch">
              <button
                type="button"
                className={
                  direction === "incoming" ? "active" : ""
                }
                onClick={() => changeDirection("incoming")}
              >
                <strong>Incoming</strong>
                <span>Waste arriving at this site</span>
              </button>

              <button
                type="button"
                className={
                  direction === "outgoing" ? "active" : ""
                }
                onClick={() => changeDirection("outgoing")}
              >
                <strong>Outgoing</strong>
                <span>Waste leaving this site</span>
              </button>
            </div>

            <div className="pilot-create-grid three">
              <label>
                <span>Job date</span>
                <input
                  type="date"
                  value={jobDate}
                  onChange={(event) =>
                    setJobDate(event.target.value)
                  }
                  required
                />
              </label>

              <label>
                <span>Planned loads</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={plannedLoads}
                  onChange={(event) =>
                    setPlannedLoads(event.target.value)
                  }
                  required
                />
              </label>

              <div className="pilot-fixed-field">
                <span>
                  {direction === "incoming"
                    ? "Destination"
                    : "Source"}
                </span>
                <strong>{options.ownSite.name}</strong>
                <small>This Desktop site</small>
              </div>
            </div>
          </section>

          <section className="pilot-create-card">
            <div className="pilot-create-card-heading">
              <span className="eyebrow">2 · Route</span>
              <h2>
                {direction === "incoming"
                  ? "Where is the waste coming from?"
                  : "Where is the waste going?"}
              </h2>
            </div>

            {direction === "incoming" ? (
              <div className="pilot-create-grid two">
                <label>
                  <span>Source company / client</span>
                  <select
                    value={clientId}
                    onChange={(event) => {
                      setClientId(event.target.value);
                      setClientSiteId("");
                    }}
                    required
                  >
                    <option value="">
                      Choose source company
                    </option>
                    {options.clients.map((client) => (
                      <option
                        key={client.id}
                        value={client.id}
                      >
                        {client.name}
                        {client.accountReference
                          ? ` · ${client.accountReference}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  <span>Source site / project</span>
                  <select
                    value={clientSiteId}
                    onChange={(event) =>
                      setClientSiteId(event.target.value)
                    }
                    disabled={!clientId}
                    required
                  >
                    <option value="">
                      {clientId
                        ? "Choose source site"
                        : "Choose company first"}
                    </option>

                    {clientSites.map((site) => (
                      <option
                        key={site.id}
                        value={site.id}
                      >
                        {site.name}
                        {site.postcode
                          ? ` · ${site.postcode}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div className="pilot-create-grid one">
                <label>
                  <span>Third-party destination facility</span>
                  <select
                    value={destinationSiteId}
                    onChange={(event) =>
                      setDestinationSiteId(event.target.value)
                    }
                    required
                  >
                    <option value="">
                      Choose destination facility
                    </option>

                    {options.facilities.map((facility) => (
                      <option
                        key={facility.id}
                        value={facility.id}
                      >
                        {facility.name} · {facility.operatorName}
                        {facility.postcode
                          ? ` · ${facility.postcode}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}
          </section>

          <section className="pilot-create-card">
            <div className="pilot-create-card-heading">
              <span className="eyebrow">3 · Waste</span>
              <h2>Material</h2>
            </div>

            <div className="pilot-create-grid one">
              <label>
                <span>Material / waste profile</span>
                <select
                  value={materialProfileId}
                  onChange={(event) =>
                    setMaterialProfileId(event.target.value)
                  }
                  required
                >
                  <option value="">Choose material</option>

                  {options.materials.map((material) => {
                    const ownAllowed =
                      options.permittedEwcCodeIds.includes(
                        material.ewcCodeId,
                      );
                    const regulatory =
                      options.regulatoryAcceptanceAuthorities.find(
                        (item) =>
                          item.acceptedEwcCodeId ===
                          material.ewcCodeId,
                      );

                    return (
                      <option
                        key={material.id}
                        value={material.id}
                      >
                        {material.isFavourite ? "★ " : ""}
                        {material.name} · {material.ewcCode}
                        {regulatory
                          ? ` · REGULATORY AUTHORITY · ${regulatory.basis.replaceAll("_", " ")}`
                          : ownAllowed
                            ? " · EXACT PERMIT MATCH"
                            : " · NOT AUTHORISED"}
                      </option>
                    );
                  })}
                </select>
              </label>
            </div>

            {selectedMaterial ? (
              <div
                className={`pilot-material-check ${
                  ownPermitMatch &&
                  destinationPermitMatch
                    ? "good"
                    : "bad"
                }`}
              >
                <div>
                  <strong>
                    {selectedMaterial.ewcCode} ·{" "}
                    {selectedMaterial.name}
                  </strong>
                  <span>
                    {selectedMaterial.wasteDescription}
                  </span>
                </div>

                <div className="pilot-material-checks">
                  <span>
                    {ownPermitMatch ? "✓" : "✕"} This site permit
                  </span>

                  {direction === "outgoing" ? (
                    <span>
                      {destinationPermitMatch ? "✓" : "✕"} Destination
                      authorisation
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            {direction === "incoming" ? (
              <div className="pilot-material-check good">
                <div>
                  <strong>
                    Additional waste items on this same lorry
                  </strong>
                  <span>
                    One physical journey stays one Load. Each item is
                    checked independently against this receiving site.
                  </span>
                </div>

                <div className="pilot-material-checks">
                  <button
                    type="button"
                    disabled={
                      !materialProfileId ||
                      additionalMaterialProfileIds.length >= 7
                    }
                    onClick={() =>
                      setAdditionalMaterialProfileIds((current) => [
                        ...current,
                        "",
                      ])
                    }
                  >
                    + Add waste item
                  </button>
                </div>
              </div>
            ) : null}

            {direction === "incoming" &&
            additionalMaterialProfileIds.length > 0 ? (
              <div className="pilot-create-grid one">
                {additionalMaterialProfileIds.map((value, index) => {
                  const selected = additionalMaterials[index];
                  const regulatory = selected
                    ? options.regulatoryAcceptanceAuthorities.find(
                        (item) =>
                          item.acceptedEwcCodeId ===
                          selected.ewcCodeId,
                      )
                    : null;

                  return (
                    <label key={`waste-item-${index}`}>
                      <span>Waste item {index + 2}</span>
                      <div className="inline-form-row">
                        <select
                          value={value}
                          required
                          onChange={(event) =>
                            setAdditionalMaterialProfileIds((current) =>
                              current.map((row, rowIndex) =>
                                rowIndex === index
                                  ? event.target.value
                                  : row,
                              ),
                            )
                          }
                        >
                          <option value="">
                            Choose waste item {index + 2}
                          </option>
                          {options.materials.map((material) => {
                            const accepted =
                              options.permittedEwcCodeIds.includes(
                                material.ewcCodeId,
                              );
                            const itemRegulatory =
                              options.regulatoryAcceptanceAuthorities.find(
                                (item) =>
                                  item.acceptedEwcCodeId ===
                                  material.ewcCodeId,
                              );
                            const alreadySelected =
                              selectedWasteItemIds.includes(material.id) &&
                              material.id !== value;

                            return (
                              <option
                                key={material.id}
                                value={material.id}
                                disabled={alreadySelected}
                              >
                                {material.name} · {material.ewcCode}
                                {itemRegulatory
                                  ? ` · REGULATORY AUTHORITY · ${itemRegulatory.basis.replaceAll("_", " ")}`
                                  : accepted
                                    ? " · EXACT PERMIT MATCH"
                                    : " · NOT AUTHORISED"}
                              </option>
                            );
                          })}
                        </select>

                        <button
                          type="button"
                          onClick={() =>
                            setAdditionalMaterialProfileIds((current) =>
                              current.filter(
                                (_, rowIndex) => rowIndex !== index,
                              ),
                            )
                          }
                        >
                          Remove
                        </button>
                      </div>

                      {selected ? (
                        <small>
                          {selected.ewcCode} ·{" "}
                          {regulatory
                            ? "Regulatory authority"
                            : options.permittedEwcCodeIds.includes(
                                  selected.ewcCodeId,
                                )
                              ? "Exact permit match"
                              : "Not authorised"}
                        </small>
                      ) : null}
                    </label>
                  );
                })}

                {!wasteItemsAreUnique ? (
                  <small>
                    Each Waste Item must use a different Material Profile.
                  </small>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="pilot-create-card">
            <div className="pilot-create-card-heading">
              <span className="eyebrow">4 · Transport</span>
              <h2>Who is moving it?</h2>
            </div>

            <div className="pilot-transport-switch">
              <button
                type="button"
                className={
                  transportMode === "own" ? "active" : ""
                }
                onClick={() => changeTransportMode("own")}
              >
                Own transport
              </button>

              <button
                type="button"
                className={
                  transportMode === "external" ? "active" : ""
                }
                onClick={() =>
                  changeTransportMode("external")
                }
              >
                External haulier
              </button>
            </div>

            <div className="pilot-create-grid three">
              {transportMode === "external" ? (
                <label>
                  <span>Haulier</span>
                  <select
                    value={haulierId}
                    onChange={(event) =>
                      changeHaulier(event.target.value)
                    }
                    required
                  >
                    <option value="">Choose haulier</option>
                    {options.hauliers.map((haulier) => (
                      <option
                        key={haulier.id}
                        value={haulier.id}
                      >
                        {haulier.name}
                        {haulier.carrierRegistrationNumber
                          ? ` · ${haulier.carrierRegistrationNumber}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <div className="pilot-fixed-field">
                  <span>Carrier</span>
                  <strong>Own fleet</strong>
                  <small>Waste X organisation</small>
                </div>
              )}

              <label>
                <span>Driver</span>
                <select
                  value={driverId}
                  onChange={(event) =>
                    setDriverId(event.target.value)
                  }
                >
                  <option value="">Assign later</option>

                  {availableDrivers.map((driver) => (
                    <option
                      key={driver.id}
                      value={driver.id}
                    >
                      {driver.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Vehicle</span>
                <select
                  value={vehicleId}
                  onChange={(event) =>
                    setVehicleId(event.target.value)
                  }
                >
                  <option value="">Assign later</option>

                  {availableVehicles.map((vehicle) => (
                    <option
                      key={vehicle.id}
                      value={vehicle.id}
                    >
                      {vehicle.registrationNumber}
                      {vehicle.vehicleType
                        ? ` · ${vehicle.vehicleType}`
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="pilot-create-card">
            <div className="pilot-create-card-heading">
              <span className="eyebrow">5 · References</span>
              <h2>Job details</h2>
            </div>

            <div className="pilot-create-grid two">
              <label>
                <span>PO number</span>
                <input
                  value={purchaseOrder}
                  onChange={(event) =>
                    setPurchaseOrder(event.target.value)
                  }
                  placeholder="Optional"
                />
              </label>

              <label>
                <span>Customer / Job reference</span>
                <input
                  value={customerReference}
                  onChange={(event) =>
                    setCustomerReference(event.target.value)
                  }
                  placeholder="Optional"
                />
              </label>

              <label className="wide">
                <span>Operational notes</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) =>
                    setNotes(event.target.value)
                  }
                  placeholder="Optional"
                />
              </label>
            </div>
          </section>

          <details className="pilot-create-card pilot-commercial">
            <summary>
              <span>
                <small className="eyebrow">
                  6 · Commercial
                </small>
                <strong>Job-specific pricing</strong>
              </span>
              <span>Optional</span>
            </summary>

            <p>
              Enter the actual commercial terms agreed for this Job.
              Stored Rate Library suggestions remain optional and can
              still be managed on Web.
            </p>

            {direction === "incoming" ? (
              <div className="pilot-create-grid four">
                <label>
                  <span>Customer charge description</span>
                  <input
                    value={
                      pricing.customerChargeDescription
                    }
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        customerChargeDescription:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Customer price £</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pricing.customerChargeAmount}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        customerChargeAmount:
                          event.target.value,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Unit</span>
                  <select
                    value={pricing.customerChargeUnit}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        customerChargeUnit:
                          event.target.value as PricingUnit,
                      })
                    }
                  >
                    <option value="tonne">Per tonne</option>
                    <option value="load">Per load</option>
                    <option value="job">Per Job</option>
                  </select>
                </label>

                <label>
                  <span>VAT %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pricing.customerVatRate}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        customerVatRate:
                          event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            ) : (
              <div className="pilot-create-grid four">
                <label>
                  <span>Revenue / material sale description</span>
                  <input
                    value={
                      pricing.materialSaleDescription
                    }
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        materialSaleDescription:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Revenue £</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={pricing.materialSaleAmount}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        materialSaleAmount:
                          event.target.value,
                      })
                    }
                    placeholder="Optional"
                  />
                </label>

                <label>
                  <span>Unit</span>
                  <select
                    value={pricing.materialSaleUnit}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        materialSaleUnit:
                          event.target.value as PricingUnit,
                      })
                    }
                  >
                    <option value="tonne">Per tonne</option>
                    <option value="load">Per load</option>
                    <option value="job">Per Job</option>
                  </select>
                </label>

                <label>
                  <span>VAT %</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={pricing.materialSaleVatRate}
                    onChange={(event) =>
                      setPricing({
                        ...pricing,
                        materialSaleVatRate:
                          event.target.value,
                      })
                    }
                  />
                </label>
              </div>
            )}

            <div className="pilot-create-grid four compact">
              <label>
                <span>Haulage cost £</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing.haulageCostAmount}
                  onChange={(event) =>
                    setPricing({
                      ...pricing,
                      haulageCostAmount:
                        event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </label>

              <label>
                <span>Haulage unit</span>
                <select
                  value={pricing.haulageCostUnit}
                  onChange={(event) =>
                    setPricing({
                      ...pricing,
                      haulageCostUnit:
                        event.target.value as PricingUnit,
                    })
                  }
                >
                  <option value="tonne">Per tonne</option>
                  <option value="load">Per load</option>
                  <option value="job">Per Job</option>
                </select>
              </label>

              <label>
                <span>
                  {direction === "incoming"
                    ? "Tipping / receiving cost £"
                    : "Tipping / facility cost £"}
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricing.tippingCostAmount}
                  onChange={(event) =>
                    setPricing({
                      ...pricing,
                      tippingCostAmount:
                        event.target.value,
                    })
                  }
                  placeholder="Optional"
                />
              </label>

              <label>
                <span>Tipping unit</span>
                <select
                  value={pricing.tippingCostUnit}
                  onChange={(event) =>
                    setPricing({
                      ...pricing,
                      tippingCostUnit:
                        event.target.value as PricingUnit,
                    })
                  }
                >
                  <option value="tonne">Per tonne</option>
                  <option value="load">Per load</option>
                  <option value="job">Per Job</option>
                </select>
              </label>
            </div>
          </details>

          <div className="pilot-create-submit">
            <div>
              <strong>
                {direction === "incoming"
                  ? "Incoming Job"
                  : "Outgoing Job"}
              </strong>

              <span>
                Saves the Job and {Number(plannedLoads) || 0} planned{" "}
                {Number(plannedLoads) === 1 ? "Load" : "Loads"} to encrypted
                local storage first. Cloud sync follows automatically.
              </span>
            </div>

            <button
              type="submit"
              disabled={busy || !requiredReady}
            >
              {busy
                ? "Creating Job…"
                : cloudReachable
                  ? "Create Job"
                  : "Create Job offline"}
            </button>
          </div>
        </form>
      ) : null}
    </section>
  );
}
