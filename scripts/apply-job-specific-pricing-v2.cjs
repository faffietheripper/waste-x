/*
  Waste X — Job-specific pricing v2

  Run from the CURRENT repo root after copying the bundle's new/replacement
  files into place:

    node scripts/apply-job-specific-pricing-v2.cjs

  The patch is based on the current main branch reviewed on 2026-08-27.
  It refuses to silently continue when a known block cannot be found.
*/

const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const SENTINEL = "WASTE_X_JOB_SPECIFIC_PRICING_V2";

function file(rel) {
  return path.join(ROOT, rel);
}

function read(rel) {
  const full = file(rel);

  if (!fs.existsSync(full)) {
    throw new Error(`Missing expected file: ${rel}`);
  }

  return fs.readFileSync(full, "utf8");
}

function write(rel, text) {
  fs.writeFileSync(file(rel), text);
  console.log(`✓ ${rel}`);
}

function already(text) {
  return text.includes(SENTINEL);
}

function mark(text) {
  if (already(text)) return text;

  const firstNewline = text.indexOf("\n");

  if (firstNewline === -1) {
    return `/* ${SENTINEL} */\n${text}`;
  }

  return (
    text.slice(0, firstNewline + 1) +
    `/* ${SENTINEL} */\n` +
    text.slice(firstNewline + 1)
  );
}

function replaceOnce(text, oldValue, newValue, label) {
  if (text.includes(newValue)) return text;

  const index = text.indexOf(oldValue);

  if (index === -1) {
    throw new Error(
      `Could not patch ${label}. Expected block not found.`,
    );
  }

  return (
    text.slice(0, index) +
    newValue +
    text.slice(index + oldValue.length)
  );
}

function insertBefore(text, marker, addition, label) {
  if (text.includes(addition.trim())) return text;

  const index = text.indexOf(marker);

  if (index === -1) {
    throw new Error(
      `Could not patch ${label}. Marker not found.`,
    );
  }

  return (
    text.slice(0, index) +
    addition +
    text.slice(index)
  );
}

function insertAfter(text, marker, addition, label) {
  if (text.includes(addition.trim())) return text;

  const index = text.indexOf(marker);

  if (index === -1) {
    throw new Error(
      `Could not patch ${label}. Marker not found.`,
    );
  }

  const end = index + marker.length;

  return (
    text.slice(0, end) +
    addition +
    text.slice(end)
  );
}

function replaceSection(
  text,
  startMarker,
  endMarker,
  replacement,
  label,
) {
  const start = text.indexOf(startMarker);

  if (start === -1) {
    throw new Error(
      `Could not patch ${label}. Start marker missing.`,
    );
  }

  const end = text.indexOf(
    endMarker,
    start + startMarker.length,
  );

  if (end === -1) {
    throw new Error(
      `Could not patch ${label}. End marker missing.`,
    );
  }

  return (
    text.slice(0, start) +
    replacement +
    text.slice(end)
  );
}

function insertImportAfterSchema(
  text,
  importText,
) {
  if (text.includes(importText)) {
    return text;
  }

  const marker =
    `} from "@/db/schema";`;

  const index = text.indexOf(marker);

  if (index === -1) {
    throw new Error(
      "Could not find @/db/schema import.",
    );
  }

  const end = index + marker.length;

  return (
    text.slice(0, end) +
    `\n${importText}` +
    text.slice(end)
  );
}

/* ==================================================================
   1. INCOMING BOOK JOB UI
================================================================== */
{
  const rel =
    "src/app/home/jobs/new/components/BookJobForm.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `  const [rateMode, setRateMode] = useState<"auto" | "none">("auto");`,
      `  const [customerChargeDescription, setCustomerChargeDescription] =
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

  const [pricingSourceRateId, setPricingSourceRateId] = useState("");`,
      "incoming pricing state",
    );

    text = replaceOnce(
      text,
      `  const customerRate =
    rateMode === "auto"
      ? matchCommercialRate(data.rates, {
          rateType: "customer_charge",
          counterpartyId: clientId || null,
          counterpartySiteId: clientSiteId || null,
          ownSiteId: data.receivingSite.id,
          materialProfileId: materialProfileId || null,
          at: rateDate,
        })
      : null;

  const haulageRate =
    rateMode === "auto" && transportMode === "external" && haulierId
      ? matchCommercialRate(data.rates, {
          rateType: "haulage_cost",
          counterpartyId: haulierId,
          counterpartySiteId: null,
          ownSiteId: data.receivingSite.id,
          materialProfileId: materialProfileId || null,
          at: rateDate,
        })
      : null;`,
      `  const customerRate = matchCommercialRate(data.rates, {
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
  }`,
      "incoming suggestion matching",
    );

    const oldCommercial = `          <Card title="Commercial" eyebrow="5 · Pricing">
            <Field label="Stored rates">
              <select
                name="rateMode"
                value={rateMode}
                onChange={(event) =>
                  setRateMode(event.target.value === "none" ? "none" : "auto")
                }
                className={inputClass}
              >
                <option value="auto">Automatically match the best stored rates</option>
                <option value="none">Book without stored rates</option>
              </select>
            </Field>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <RatePreview
                label="Customer charge"
                rate={customerRate}
                empty="No matching customer rate"
              />
              <RatePreview
                label="Haulage cost"
                rate={haulageRate}
                empty={
                  !transportMode
                    ? "Choose transport first"
                    : transportMode === "own"
                      ? "Own transport · no external haulage cost"
                      : "No matching haulage rate"
                }
              />
            </div>

            <p className="mt-3 text-xs leading-5 text-black/45">
              Rates are optional. Waste X snapshots the matched commercial values onto
              each planned load so later price-book changes do not rewrite old work.
            </p>
          </Card>`;

    const newCommercial = `          <Card title="Job-specific pricing" eyebrow="5 · Commercial">
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
          </Card>`;

    text = replaceOnce(
      text,
      oldCommercial,
      newCommercial,
      "incoming commercial card",
    );

    text = replaceOnce(
      text,
      `              <p>3. Snapshots material + commercial defaults onto each load.</p>`,
      `              <p>3. Saves this Job's commercial terms and mirrors core values onto each planned Load.</p>`,
      "incoming save explanation",
    );

    text = replaceOnce(
      text,
      `              Driver, vehicle and stored pricing remain optional at booking time. They do
              not block the job from being planned.`,
      `              Driver, vehicle and Job pricing remain optional at booking time. Stored
              Rate Library values are suggestions only and are never applied silently.`,
      "incoming final booking note",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   2. INCOMING CREATE ACTION
================================================================== */
{
  const rel =
    "src/app/home/jobs/new/actions.ts";
  let text = read(rel);

  if (!already(text)) {
    text = insertImportAfterSchema(
      text,
      `import { jobCommercialLines } from "@/db/commercial-schema";
import {
  bookingCommercialLines,
  parseIncomingBookingPricing,
} from "@/modules/commercial/bookingPricing";`,
    );

    text = text.replace(
      `import { matchCommercialRate } from "./lib/matchCommercialRate";
import type { BookJobRate } from "./lib/types";

`,
      "",
    );

    text = replaceSection(
      text,
      `async function getCurrentRates(`,
      `export async function createJobAction`,
      "",
      "remove booking-time authoritative rate matcher",
    );

    text = replaceOnce(
      text,
      `  const notes = optionalString(formData.get("notes"));
  const useStoredRate = cleanString(formData.get("rateMode")) !== "none";`,
      `  const notes = optionalString(formData.get("notes"));

  const pricingResult = parseIncomingBookingPricing(formData);
  if (!pricingResult.ok) bookingError(pricingResult.error);
  const pricing = pricingResult.data;`,
      "incoming pricing parse",
    );

    text = replaceSection(
      text,
      `  const activeRates = useStoredRate`,
      `  const jobNumber = await generateJobNumber`,
      `  const sourceRate =
    pricing.sourceRateId
      ? await database.query.rates.findFirst({
          where: and(
            eq(rates.id, pricing.sourceRateId),
            eq(rates.organisationId, organisationId),
            eq(rates.isActive, true),
          ),
          columns: {
            id: true,
          },
        })
      : null;

`,
      "incoming old rate matching block",
    );

    text = replaceOnce(
      text,
      `      rateId: customerRate?.id ?? null,`,
      `      /*
        Legacy/reference pointer only. The actual commercial truth is stored in
        bb_job_commercial_line below.
      */
      rateId: sourceRate?.id ?? null,`,
      "incoming job legacy rate pointer",
    );

    text = replaceOnce(
      text,
      `      customerChargeAmount: customerRate?.amount ?? null,
      customerChargeUnit: customerRate?.unit ?? null,
      haulageCostAmount: haulageRate?.amount ?? null,
      haulageCostUnit: haulageRate?.unit ?? null,
      tippingCostAmount: null,
      tippingCostUnit: null,
      currency: customerRate?.currency ?? haulageRate?.currency ?? "GBP",`,
      `      customerChargeAmount: pricing.primaryRevenue?.amount ?? null,
      customerChargeUnit: pricing.primaryRevenue?.unit ?? null,
      haulageCostAmount: pricing.haulageCost?.amount ?? null,
      haulageCostUnit: pricing.haulageCost?.unit ?? null,
      tippingCostAmount: pricing.tippingCost?.amount ?? null,
      tippingCostUnit: pricing.tippingCost?.unit ?? null,
      currency: "GBP",`,
      "incoming load commercial snapshots",
    );

    text = insertAfter(
      text,
      `    await tx.insert(jobLoads).values(loadRows);`,
      `

    const commercialLines = bookingCommercialLines(pricing);

    if (commercialLines.length > 0) {
      await tx.insert(jobCommercialLines).values(
        commercialLines.map((line) => ({
          organisationId,
          jobId,
          kind: line.kind,
          category: line.category,
          description: line.description,
          amount: line.amount,
          unit: line.unit,
          currency: "GBP",
          vatRate: line.vatRate,
          sortOrder: line.sortOrder,
          isActive: true,
          createdByUserId: userId,
          createdAt: new Date(),
          updatedAt: new Date(),
        })),
      );
    }`,
      "incoming commercial line insert",
    );

    text = insertBefore(
      text,
      `  redirect(\`/home/jobs/\${jobId}?success=booked\`);`,
      `  revalidatePath("/home/commercial");
  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");

`,
      "incoming commercial revalidation",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   3. OUTGOING BOOKING PAGE — RATE SUGGESTION DATA
================================================================== */
{
  const rel =
    "src/app/home/movements/outgoing/new/page.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `        columns: {
          id: true,
          name: true,
          postcode: true,
        },`,
      `        columns: {
          id: true,
          counterpartyId: true,
          name: true,
          postcode: true,
        },`,
      "outgoing facility counterparty id",
    );

    text = insertBefore(
      text,
      `  const error = firstParam(searchParams?.error);`,
      `  const rateRows = await database.query.rates.findMany({
    where: (rate, { and: rateAnd, eq: rateEq }) =>
      rateAnd(
        rateEq(rate.organisationId, organisationId),
        rateEq(rate.isActive, true),
      ),
    columns: {
      id: true,
      rateType: true,
      unit: true,
      amount: true,
      currency: true,
      counterpartyId: true,
      counterpartySiteId: true,
      ownSiteId: true,
      materialProfileId: true,
      effectiveFrom: true,
      effectiveTo: true,
    },
  });

`,
      "outgoing stored suggestion loader",
    );

    text = replaceOnce(
      text,
      `        id: site.id,
        name: site.name,`,
      `        id: site.id,
        counterpartyId: site.counterpartyId,
        name: site.name,`,
      "outgoing facility map",
    );

    text = replaceOnce(
      text,
      `          <OutgoingBookingForm
            ownSiteName={ownSite.name}
            today={todayInLondon()}
            facilities={facilities}
            materials={materials}
            hauliers={haulierRows}
            drivers={driverRows}
            vehicles={vehicleRows}
          />`,
      `          <OutgoingBookingForm
            ownSiteId={ownSite.id}
            ownSiteName={ownSite.name}
            today={todayInLondon()}
            facilities={facilities}
            materials={materials}
            hauliers={haulierRows}
            drivers={driverRows}
            vehicles={vehicleRows}
            rates={rateRows.map((rate) => ({
              ...rate,
              effectiveFrom: rate.effectiveFrom?.toISOString() ?? null,
              effectiveTo: rate.effectiveTo?.toISOString() ?? null,
            }))}
          />`,
      "outgoing form props",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   4. OUTGOING BOOKING FORM
================================================================== */
{
  const rel =
    "src/app/home/movements/outgoing/new/_components/OutgoingBookingForm.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = insertAfter(
      text,
      `import { createOutgoingJobAction } from "../actions";`,
      `
import { matchCommercialRate } from "@/app/home/jobs/new/lib/matchCommercialRate";
import type { BookJobRate } from "@/app/home/jobs/new/lib/types";`,
      "outgoing pricing imports",
    );

    text = replaceOnce(
      text,
      `type Facility = {
  id: string;
  name: string;`,
      `type Facility = {
  id: string;
  counterpartyId: string;
  name: string;`,
      "outgoing facility type",
    );

    text = replaceOnce(
      text,
      `export default function OutgoingBookingForm({
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
}) {`,
      `export default function OutgoingBookingForm({
  ownSiteId,
  ownSiteName,
  today,
  facilities,
  materials,
  hauliers,
  drivers,
  vehicles,
  rates,
}: {
  ownSiteId: string;
  ownSiteName: string;
  today: string;
  facilities: Facility[];
  materials: Material[];
  hauliers: Haulier[];
  drivers: Driver[];
  vehicles: Vehicle[];
  rates: BookJobRate[];
}) {`,
      "outgoing form signature",
    );

    text = replaceOnce(
      text,
      `  const [facilityId, setFacilityId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [transportMode, setTransportMode] = useState<"own" | "external">("own");
  const [haulierId, setHaulierId] = useState("");`,
      `  const [jobDate, setJobDate] = useState(today);
  const [facilityId, setFacilityId] = useState("");
  const [materialId, setMaterialId] = useState("");
  const [transportMode, setTransportMode] = useState<"own" | "external">("own");
  const [haulierId, setHaulierId] = useState("");

  const [materialSaleDescription, setMaterialSaleDescription] =
    useState("Material sale / outgoing service");
  const [materialSaleAmount, setMaterialSaleAmount] = useState("");
  const [materialSaleUnit, setMaterialSaleUnit] =
    useState<"tonne" | "load" | "job">("tonne");
  const [materialSaleVatRate, setMaterialSaleVatRate] = useState("20.00");

  const [haulageCostAmount, setHaulageCostAmount] = useState("");
  const [haulageCostUnit, setHaulageCostUnit] =
    useState<"tonne" | "load" | "job">("load");

  const [tippingCostAmount, setTippingCostAmount] = useState("");
  const [tippingCostUnit, setTippingCostUnit] =
    useState<"tonne" | "load" | "job">("tonne");

  const [pricingSourceRateId, setPricingSourceRateId] = useState("");`,
      "outgoing pricing state",
    );

    text = insertAfter(
      text,
      `  const material = materials.find((item) => item.id === materialId) ?? null;`,
      `

  const rateDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(jobDate)
    ? new Date(\`\${jobDate}T12:00:00.000Z\`)
    : new Date();

  const materialSaleRate =
    facility && material
      ? matchCommercialRate(rates, {
          rateType: "material_sale",
          counterpartyId: facility.counterpartyId,
          counterpartySiteId: facility.id,
          ownSiteId,
          materialProfileId: material.id,
          at: rateDate,
        })
      : null;

  const tippingRate =
    facility && material
      ? matchCommercialRate(rates, {
          rateType: "tipping_cost",
          counterpartyId: facility.counterpartyId,
          counterpartySiteId: facility.id,
          ownSiteId,
          materialProfileId: material.id,
          at: rateDate,
        })
      : null;

  const haulageRate =
    transportMode === "external" && haulierId && material
      ? matchCommercialRate(rates, {
          rateType: "haulage_cost",
          counterpartyId: haulierId,
          counterpartySiteId: null,
          ownSiteId,
          materialProfileId: material.id,
          at: rateDate,
        })
      : null;

  function useStoredPricingSuggestions() {
    if (materialSaleRate) {
      setMaterialSaleAmount(materialSaleRate.amount);
      setMaterialSaleUnit(materialSaleRate.unit);
      setPricingSourceRateId(materialSaleRate.id);
    }

    if (haulageRate) {
      setHaulageCostAmount(haulageRate.amount);
      setHaulageCostUnit(haulageRate.unit);
    }

    if (tippingRate) {
      setTippingCostAmount(tippingRate.amount);
      setTippingCostUnit(tippingRate.unit);
    }
  }

  function clearJobPricing() {
    setMaterialSaleAmount("");
    setHaulageCostAmount("");
    setTippingCostAmount("");
    setPricingSourceRateId("");
  }`,
      "outgoing pricing suggestions",
    );

    text = replaceOnce(
      text,
      `          <input
            type="date"
            name="jobDate"
            defaultValue={today}
            required
            className="input"
          />`,
      `          <input
            type="date"
            name="jobDate"
            value={jobDate}
            onChange={(event) => setJobDate(event.target.value)}
            required
            className="input"
          />`,
      "outgoing job date state",
    );

    const marker = `      <section className="grid gap-5 rounded-[28px] border border-black/10 bg-white p-6 shadow-sm xl:grid-cols-3">`;

    const pricingSection = `      <section className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
        <input
          type="hidden"
          name="pricingSourceRateId"
          value={pricingSourceRateId}
        />

        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
          Commercial · Job-specific
        </p>
        <h2 className="mt-2 text-xl font-semibold text-black">
          Set the commercial terms for this outgoing Job
        </h2>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
          Enter the actual Job price/costs here. A stored Rate Library value is
          only an optional suggestion and is never applied automatically.
        </p>

        <div className="mt-5 grid gap-4 md:grid-cols-[1.35fr_0.55fr_0.55fr_0.45fr]">
          <Field label="Revenue / material sale description">
            <input
              name="materialSaleDescription"
              value={materialSaleDescription}
              onChange={(event) =>
                setMaterialSaleDescription(event.target.value)
              }
              className="input"
            />
          </Field>

          <Field label="Revenue £">
            <input
              type="number"
              min="0"
              step="0.01"
              name="materialSaleAmount"
              value={materialSaleAmount}
              onChange={(event) => {
                setMaterialSaleAmount(event.target.value);
                setPricingSourceRateId("");
              }}
              placeholder="Optional"
              className="input"
            />
          </Field>

          <Field label="Unit">
            <select
              name="materialSaleUnit"
              value={materialSaleUnit}
              onChange={(event) =>
                setMaterialSaleUnit(
                  event.target.value as "tonne" | "load" | "job",
                )
              }
              className="input"
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
              name="materialSaleVatRate"
              value={materialSaleVatRate}
              onChange={(event) =>
                setMaterialSaleVatRate(event.target.value)
              }
              className="input"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="grid grid-cols-[1fr_135px] gap-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
            <Field label="Haulage cost £">
              <input
                type="number"
                min="0"
                step="0.01"
                name="haulageCostAmount"
                value={haulageCostAmount}
                onChange={(event) =>
                  setHaulageCostAmount(event.target.value)
                }
                placeholder="Optional"
                className="input"
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
                className="input"
              >
                <option value="tonne">/ tonne</option>
                <option value="load">/ load</option>
                <option value="job">/ Job</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-[1fr_135px] gap-3 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
            <Field label="Tipping / facility cost £">
              <input
                type="number"
                min="0"
                step="0.01"
                name="tippingCostAmount"
                value={tippingCostAmount}
                onChange={(event) =>
                  setTippingCostAmount(event.target.value)
                }
                placeholder="Optional"
                className="input"
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
                className="input"
              >
                <option value="tonne">/ tonne</option>
                <option value="load">/ load</option>
                <option value="job">/ Job</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="mt-5 rounded-2xl border border-black/10 bg-[#fbfaf7] p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
                Optional Rate Library suggestions
              </p>
              <p className="mt-1 text-xs text-black/45">
                Apply a suggestion only when it matches what was actually agreed.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={useStoredPricingSuggestions}
                disabled={!materialSaleRate && !haulageRate && !tippingRate}
                className="rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/30"
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
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Suggestion
              label="Material sale"
              rate={materialSaleRate}
            />
            <Suggestion
              label="Haulage cost"
              rate={haulageRate}
            />
            <Suggestion
              label="Facility / tipping cost"
              rate={tippingRate}
            />
          </div>
        </div>
      </section>

`;

    text = insertBefore(
      text,
      marker,
      pricingSection,
      "outgoing commercial section",
    );

    text = insertBefore(
      text,
      `function Field({ label, children }: { label: string; children: ReactNode }) {`,
      `function Suggestion({
  label,
  rate,
}: {
  label: string;
  rate: BookJobRate | null;
}) {
  return (
    <div className="rounded-xl border border-black/10 bg-white p-3">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">
        {label}
      </p>
      <p className="mt-2 text-xs font-semibold text-black/65">
        {rate
          ? \`\${new Intl.NumberFormat("en-GB", {
              style: "currency",
              currency: rate.currency,
            }).format(Number(rate.amount))} / \${rate.unit}\`
          : "No matching stored suggestion"}
      </p>
    </div>
  );
}

`,
      "outgoing suggestion component",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   5. OUTGOING CREATE ACTION
================================================================== */
{
  const rel =
    "src/app/home/movements/outgoing/new/actions.ts";
  let text = read(rel);

  if (!already(text)) {
    text = insertImportAfterSchema(
      text,
      `import { jobCommercialLines } from "@/db/commercial-schema";
import {
  bookingCommercialLines,
  parseOutgoingBookingPricing,
} from "@/modules/commercial/bookingPricing";`,
    );

    /*
      rates is required only to validate that the optional suggestion pointer
      belongs to this organisation. Add it to the core schema import.
    */
    text = replaceOnce(
      text,
      `  permitEwcCodes,
  sitePermits,`,
      `  permitEwcCodes,
  rates,
  sitePermits,`,
      "outgoing rates import",
    );

    text = replaceOnce(
      text,
      `  const notes = optionalString(formData.get("notes"));

  if (!jobDate) fail("invalid_job_date");`,
      `  const notes = optionalString(formData.get("notes"));

  const pricingResult = parseOutgoingBookingPricing(formData);
  if (!pricingResult.ok) fail(pricingResult.error);
  const pricing = pricingResult.data;

  if (!jobDate) fail("invalid_job_date");`,
      "outgoing pricing parse",
    );

    text = insertBefore(
      text,
      `  const jobId = crypto.randomUUID();`,
      `  const sourceRate =
    pricing.sourceRateId
      ? await database.query.rates.findFirst({
          where: and(
            eq(rates.id, pricing.sourceRateId),
            eq(rates.organisationId, organisationId),
            eq(rates.isActive, true),
          ),
          columns: {
            id: true,
          },
        })
      : null;

`,
      "outgoing source rate validation",
    );

    text = replaceOnce(
      text,
      `      rateId: null,`,
      `      /*
        Optional legacy/reference pointer only. Job commercial lines below are
        the actual agreed terms.
      */
      rateId: sourceRate?.id ?? null,`,
      "outgoing rate pointer",
    );

    text = replaceOnce(
      text,
      `        purchaseOrder,
        customerReference,
        currency: "GBP",`,
      `        purchaseOrder,
        customerReference,
        /*
          Compatibility snapshots. The authoritative pricing is the Job-level
          commercial lines inserted below.
        */
        customerChargeAmount: pricing.primaryRevenue?.amount ?? null,
        customerChargeUnit: pricing.primaryRevenue?.unit ?? null,
        haulageCostAmount: pricing.haulageCost?.amount ?? null,
        haulageCostUnit: pricing.haulageCost?.unit ?? null,
        tippingCostAmount: pricing.tippingCost?.amount ?? null,
        tippingCostUnit: pricing.tippingCost?.unit ?? null,
        currency: "GBP",`,
      "outgoing load pricing snapshots",
    );

    text = insertAfter(
      text,
      `    await tx.insert(jobLoads).values(
      Array.from({ length: plannedLoads }, (_, index) => ({`,
      ``,
      "noop",
    );

    const afterLoads = `    );
  });

  revalidatePath("/home/jobs");`;

    const commercialInsert = `    );

    const commercialLines = bookingCommercialLines(pricing);

    if (commercialLines.length > 0) {
      await tx.insert(jobCommercialLines).values(
        commercialLines.map((line) => ({
          organisationId,
          jobId,
          kind: line.kind,
          category: line.category,
          description: line.description,
          amount: line.amount,
          unit: line.unit,
          currency: "GBP",
          vatRate: line.vatRate,
          sortOrder: line.sortOrder,
          isActive: true,
          createdByUserId: userId,
          createdAt: now,
          updatedAt: now,
        })),
      );
    }
  });

  revalidatePath("/home/jobs");`;

    text = replaceOnce(
      text,
      afterLoads,
      commercialInsert,
      "outgoing commercial insert",
    );

    text = insertBefore(
      text,
      `  const date = jobDate.toISOString().slice(0, 10);`,
      `  revalidatePath("/home/commercial");
  revalidatePath("/home/accounts");
  revalidatePath("/home/reports");

`,
      "outgoing commercial revalidation",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   6. COMMERCIAL EDITOR/ACTIONS — OUTGOING AWARE
================================================================== */
{
  const rel =
    "src/app/home/commercial/actions.ts";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `  const customerDescription =
    cleanString(formData.get("customerChargeDescription")) ||
    "Waste acceptance / disposal";`,
      `  const revenueCategory: JobCommercialCategory =
    job.direction === "outgoing"
      ? "material_sale"
      : "customer_charge";

  const customerDescription =
    cleanString(formData.get("customerChargeDescription")) ||
    (job.direction === "outgoing"
      ? "Material sale / outgoing service"
      : "Waste acceptance / disposal");`,
      "commercial revenue category",
    );

    text = replaceOnce(
      text,
      `  const coreCategories: JobCommercialCategory[] = [
    "customer_charge",
    "haulage_cost",
    "tipping_cost",
  ];`,
      `  const coreCategories: JobCommercialCategory[] = [
    "customer_charge",
    "material_sale",
    "haulage_cost",
    "tipping_cost",
  ];`,
      "commercial core categories",
    );

    text = replaceOnce(
      text,
      `        category: "customer_charge",`,
      `        category: revenueCategory,`,
      "commercial primary revenue line",
    );

    /*
      This occurrence exists inside useLegacyPriceSuggestionAction. The first
      customer_charge occurrence was replaced above by revenueCategory; replace
      the next block with its own direction-aware category.
    */
    text = replaceOnce(
      text,
      `  const now = new Date();

  await database.transaction(async (tx) => {
    await tx
      .update(jobCommercialLines)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(jobCommercialLines.organisationId, access.organisationId),
          eq(jobCommercialLines.jobId, jobId),
          eq(jobCommercialLines.category, "customer_charge"),
          eq(jobCommercialLines.isActive, true),
        ),
      );`,
      `  const now = new Date();
  const legacyRevenueCategory: JobCommercialCategory =
    job.direction === "outgoing"
      ? "material_sale"
      : "customer_charge";

  await database.transaction(async (tx) => {
    await tx
      .update(jobCommercialLines)
      .set({ isActive: false, updatedAt: now })
      .where(
        and(
          eq(jobCommercialLines.organisationId, access.organisationId),
          eq(jobCommercialLines.jobId, jobId),
          inArray(jobCommercialLines.category, ["customer_charge", "material_sale"]),
          eq(jobCommercialLines.isActive, true),
        ),
      );`,
      "legacy suggestion category cleanup",
    );

    text = replaceOnce(
      text,
      `      category: "customer_charge",
      description: "Waste acceptance / disposal",`,
      `      category: legacyRevenueCategory,
      description:
        job.direction === "outgoing"
          ? "Material sale / outgoing service"
          : "Waste acceptance / disposal",`,
      "legacy suggestion revenue category",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

{
  const rel =
    "src/app/home/commercial/page.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `  const invoiceReady = unbilledCompletedJobs
    .map(mapCommercialJob)
    .filter(
      ({ summary, activeInvoice }) =>
        summary.hasRevenue &&
        !summary.missingQuantity &&
        !activeInvoice,
    );`,
      `  const invoiceReady = unbilledCompletedJobs
    .map(mapCommercialJob)
    .filter(
      ({ job, summary, activeInvoice }) =>
        Boolean(job.clientCounterpartyId) &&
        summary.hasRevenue &&
        !summary.missingQuantity &&
        !activeInvoice,
    );`,
      "commercial invoice-ready customer guard",
    );

    text = replaceOnce(
      text,
      `              const customerLine = lines.find((line) => line.category === "customer_charge");
              const haulageCostLine = lines.find((line) => line.category === "haulage_cost");`,
      `              const revenueCategory =
                job.direction === "outgoing"
                  ? "material_sale"
                  : "customer_charge";
              const revenueLine = lines.find(
                (line) => line.category === revenueCategory,
              );
              const haulageCostLine = lines.find((line) => line.category === "haulage_cost");`,
      "commercial page revenue line selection",
    );

    text = text.replaceAll(
      `customerLine?.`,
      `revenueLine?.`,
    );

    text = replaceOnce(
      text,
      `                                defaultValue={revenueLine?.description ?? "Waste acceptance / disposal"}`,
      `                                defaultValue={
                                  revenueLine?.description ??
                                  (job.direction === "outgoing"
                                    ? "Material sale / outgoing service"
                                    : "Waste acceptance / disposal")
                                }`,
      "commercial revenue description",
    );

    text = replaceOnce(
      text,
      `<Field label="Customer description">`,
      `<Field
                              label={
                                job.direction === "outgoing"
                                  ? "Revenue / material sale description"
                                  : "Customer description"
                              }
                            >`,
      "commercial editor description label",
    );

    text = replaceOnce(
      text,
      `<Field label="Customer price £">`,
      `<Field
                              label={
                                job.direction === "outgoing"
                                  ? "Revenue £"
                                  : "Customer price £"
                              }
                            >`,
      "commercial editor price label",
    );

    text = text.replaceAll(
      `![\"customer_charge\", \"haulage_cost\", \"tipping_cost\"].includes(line.category)`,
      `![\"customer_charge\", \"material_sale\", \"haulage_cost\", \"tipping_cost\"].includes(line.category)`,
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   7. JOB DETAIL — SHOW JOB PRICING, DIRECTION-AWARE ROUTE
================================================================== */
{
  const rel =
    "src/app/home/jobs/[jobId]/page.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = insertAfter(
      text,
      `import { auth } from "@/auth";`,
      `
import { jobCommercialLines } from "@/db/commercial-schema";`,
      "job detail commercial import",
    );

    text = insertAfter(
      text,
      `import { createTemplateFromJobAction } from "../templates/actions";`,
      `
import { calculateJobCommercials } from "@/modules/commercial/jobCommercials";`,
      "job detail commercial calculator import",
    );

    text = replaceOnce(
      text,
      `      notes: jobs.notes,
      clientName: counterparties.name,`,
      `      notes: jobs.notes,
      thirdPartyDestinationSiteId: jobs.thirdPartyDestinationSiteId,
      clientName: counterparties.name,`,
      "job detail destination id",
    );

    text = insertBefore(
      text,
      `  return (
    <main`,
      `  const commercialLines =
    await database.query.jobCommercialLines.findMany({
      where: and(
        eq(jobCommercialLines.organisationId, currentUser.organisationId),
        eq(jobCommercialLines.jobId, job.id),
        eq(jobCommercialLines.isActive, true),
      ),
      orderBy: (line, { asc: lineAsc }) => [
        lineAsc(line.sortOrder),
        lineAsc(line.createdAt),
      ],
    });

  const commercialSummary = calculateJobCommercials({
    lines: commercialLines,
    loads,
  });

  const outgoingDestination =
    job.direction === "outgoing" &&
    job.thirdPartyDestinationSiteId
      ? await database.query.counterpartySites.findFirst({
          where: and(
            eq(
              counterpartySites.id,
              job.thirdPartyDestinationSiteId,
            ),
            eq(
              counterpartySites.organisationId,
              currentUser.organisationId,
            ),
          ),
          columns: {
            name: true,
            postcode: true,
          },
          with: {
            counterparty: {
              columns: {
                name: true,
              },
            },
          },
        })
      : null;

  const originLabel =
    job.direction === "outgoing"
      ? job.receivingSiteName ?? "Own site"
      : [job.clientSiteName, job.clientSitePostcode]
          .filter(Boolean)
          .join(" · ") || "—";

  const destinationLabel =
    job.direction === "outgoing"
      ? [
          outgoingDestination?.name,
          outgoingDestination?.postcode,
        ]
          .filter(Boolean)
          .join(" · ") || "—"
      : job.receivingSiteName ?? "—";

`,
      "job detail commercial/query setup",
    );

    text = replaceOnce(
      text,
      `<Info label="Origin" value={[job.clientSiteName, job.clientSitePostcode].filter(Boolean).join(" · ") || "—"} />
          <Info label="Destination" value={job.receivingSiteName ?? "—"} />`,
      `<Info label="Origin" value={originLabel} />
          <Info label="Destination" value={destinationLabel} />`,
      "job detail direction-aware locations",
    );

    const loadsMarker = `        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-orange-600">
                Planned movements`;

    const commercialCard = `        <section className="rounded-[2rem] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-orange-600">
                Job-specific commercial terms
              </p>
              <h2 className="mt-2 text-2xl font-semibold text-black">
                This Job's price
              </h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                These terms belong to {job.jobNumber} only. A Rate Library value
                may have been used as a suggestion, but the Job lines below are
                the commercial authority and can be changed before invoicing.
              </p>
            </div>

            <Link
              href={\`/home/commercial#job-\${job.id}\`}
              className="inline-flex shrink-0 rounded-2xl bg-black px-5 py-3 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Set / edit Job pricing
            </Link>
          </div>

          {commercialLines.length === 0 ? (
            <div className="mt-5 rounded-2xl border border-dashed border-black/15 bg-[#faf8f4] p-5 text-sm text-black/45">
              No Job-specific commercial terms have been set yet. This does not
              block operations; add them here or from Commercial & Invoicing.
            </div>
          ) : (
            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {commercialLines.map((line) => (
                <div
                  key={line.id}
                  className="rounded-2xl border border-black/10 bg-[#faf8f4] p-4"
                >
                  <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">
                    {line.kind === "revenue" ? "Revenue" : "Direct cost"} ·{" "}
                    {line.category.replaceAll("_", " ")}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {line.description}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-black">
                    {money(line.amount, line.currency)} / {line.unit}
                  </p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Info
              label="Completed loads"
              value={String(commercialSummary.completedLoads)}
              compact
            />
            <Info
              label="Actual tonnes"
              value={String(commercialSummary.tonnes)}
              compact
            />
            <Info
              label="Revenue"
              value={money(
                commercialSummary.revenue.toFixed(2),
                "GBP",
              )}
              compact
            />
            <Info
              label="Margin"
              value={money(
                commercialSummary.margin.toFixed(2),
                "GBP",
              )}
              compact
            />
          </div>
        </section>

`;

    text = insertBefore(
      text,
      loadsMarker,
      commercialCard,
      "job detail commercial card",
    );

    text = replaceOnce(
      text,
      `<th className="px-3 py-3 font-semibold">Customer rate</th>`,
      `<th className="px-3 py-3 font-semibold">Revenue snapshot</th>`,
      "job detail load revenue label",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   8. RATE LIBRARY COPY — SUGGESTION, NOT AUTHORITY
================================================================== */
{
  const rel =
    "src/app/home/rates/page.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `<h1 className="mt-3 text-4xl font-semibold tracking-tight">Rates</h1>`,
      `<h1 className="mt-3 text-4xl font-semibold tracking-tight">Rate Library</h1>`,
      "rate library heading",
    );

    text = replaceOnce(
      text,
      `                Store customer charges, haulage costs, external facility costs
                and sale rates once. Jobs can reuse the right commercial rule
                instead of staff typing prices from memory.`,
      `                Keep useful customer, haulage, facility and material-sale prices
                as history and booking suggestions. Every Job can still have its own
                custom commercial terms, and the Job always wins.`,
      "rate library description",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   9. ACCOUNTS COPY — CURRENT DATA, LEGACY BILLING MARKER
================================================================== */
{
  const rel =
    "src/app/home/accounts/page.tsx";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `                Turn completed operational work into invoice-ready information
                without trying to turn Waste X into an accounting package.`,
      `                Review completed operational value using each Job's commercial
                terms. Native Waste X customer invoices live in Commercial & Invoicing;
                this page remains useful for exports and legacy billing-reference workflows.`,
      "accounts description",
    );

    text = insertBefore(
      text,
      `              <Link
                href={\`/home/accounts/export/csv?from=\${query.from}&to=\${query.to}\`}`,
      `              <Link
                href="/home/commercial"
                className="rounded-2xl border border-orange-400/50 bg-orange-500/10 px-5 py-3 text-sm font-semibold text-orange-300 transition hover:bg-orange-500 hover:text-black"
              >
                Commercial & Invoicing
              </Link>
`,
      "accounts commercial link",
    );

    text = replaceOnce(
      text,
      `                Revenue is calculated from customer-charge snapshots on completed loads. Direct cost currently means recorded haulage and tipping cost only.`,
      `                Revenue and direct cost now come from Job-specific commercial
                lines first. Legacy Load snapshots are used only as a compatibility
                fallback for older Jobs that have not yet been confirmed at Job level.`,
      "accounts numbers explanation",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

/* ==================================================================
   10. JOB TEMPLATES — DO NOT CARRY PRICE AUTHORITY
================================================================== */
{
  const rel =
    "src/app/home/jobs/templates/actions.ts";
  let text = read(rel);

  if (!already(text)) {
    text = replaceOnce(
      text,
      `    rateId: sourceJob.rateId,`,
      `    /*
      Templates reuse operational setup, not commercial authority. The next
      Job opens with its own pricing fields and may optionally use the Rate
      Library as a suggestion.
    */
    rateId: null,`,
      "template rate reset",
    );

    text = mark(text);
    write(rel, text);
  } else {
    console.log(`↷ ${rel} already patched`);
  }
}

console.log("");
console.log("Waste X Job-specific pricing v2 applied.");
console.log("");
console.log("Next:");
console.log("  npm run build");
console.log("  node scripts/verify-job-specific-pricing-v2.cjs");
console.log("");
console.log("No database migration is required: bb_job_commercial_line already exists.");