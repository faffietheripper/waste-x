// src/app/home/rates/_components/RateForm.tsx

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  createRateAction,
  updateRateAction,
} from "../actions";

type RateType =
  | "customer_charge"
  | "haulage_cost"
  | "tipping_cost"
  | "material_sale"
  | "other";

type RateUnit = "tonne" | "load" | "job";

type PartyOption = {
  id: string;
  name: string;
};

type SiteOption = {
  id: string;
  counterpartyId: string;
  name: string;
  postcode: string | null;
};

type MaterialOption = {
  id: string;
  name: string;
  ewcCode: string;
};

type OwnSiteOption = {
  id: string;
  name: string;
};

type InitialRate = {
  id: string;
  rateType: RateType;
  unit: RateUnit;
  amount: string;
  counterpartyId: string | null;
  counterpartySiteId: string | null;
  ownSiteId: string | null;
  materialProfileId: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  notes: string;
};

export type RateFormProps = {
  mode: "create" | "edit";
  clients: PartyOption[];
  clientSites: SiteOption[];
  hauliers: PartyOption[];
  externalFacilities: SiteOption[];
  allCounterparties: PartyOption[];
  materials: MaterialOption[];
  ownSites: OwnSiteOption[];
  initial?: InitialRate;
};

const RATE_TYPE_OPTIONS: Array<{
  value: RateType;
  label: string;
  description: string;
}> = [
  {
    value: "customer_charge",
    label: "Customer charge",
    description: "What you charge a client for handling or receiving waste.",
  },
  {
    value: "haulage_cost",
    label: "Haulage cost",
    description: "What a haulier normally costs you for transport.",
  },
  {
    value: "tipping_cost",
    label: "External facility / tipping cost",
    description: "What another facility charges you to receive the waste.",
  },
  {
    value: "material_sale",
    label: "Material sale",
    description: "A sale value for material leaving your operation.",
  },
  {
    value: "other",
    label: "Other",
    description: "A reusable commercial rate that does not fit the main categories.",
  },
];

function formatEwc(code: string) {
  if (code.length !== 6) {
    return code;
  }

  return `${code.slice(0, 2)} ${code.slice(2, 4)} ${code.slice(4, 6)}`;
}

export default function RateForm({
  mode,
  clients,
  clientSites,
  hauliers,
  externalFacilities,
  allCounterparties,
  materials,
  ownSites,
  initial,
}: RateFormProps) {
  const [rateType, setRateType] = useState<RateType>(
    initial?.rateType ?? "customer_charge",
  );

  const [clientId, setClientId] = useState(
    initial?.rateType === "customer_charge"
      ? initial.counterpartyId ?? ""
      : "",
  );

  const [clientSiteId, setClientSiteId] = useState(
    initial?.rateType === "customer_charge"
      ? initial.counterpartySiteId ?? ""
      : "",
  );

  const visibleClientSites = useMemo(
    () => clientSites.filter((site) => site.counterpartyId === clientId),
    [clientId, clientSites],
  );

  const action = mode === "create" ? createRateAction : updateRateAction;

  const typeInfo = RATE_TYPE_OPTIONS.find((item) => item.value === rateType)!;

  return (
    <form action={action} className="space-y-7">
      {mode === "edit" && initial && (
        <input type="hidden" name="rateId" value={initial.id} />
      )}

      <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
        <Eyebrow>Rate</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">What is this rate?</h2>
        <p className="mt-2 text-sm leading-6 text-black/45">
          Store the commercial rule once. Book a Job will later match the most
          relevant active rate instead of asking staff to retype prices.
        </p>

        <div className="mt-7 grid gap-5 md:grid-cols-3">
          <label className="md:col-span-2">
            <Label>Rate type</Label>
            <select
              name="rateType"
              value={rateType}
              onChange={(event) => setRateType(event.target.value as RateType)}
              className={inputClass}
            >
              {RATE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs leading-5 text-black/35">
              {typeInfo.description}
            </p>
          </label>

          <label>
            <Label>Charge unit</Label>
            <select
              name="unit"
              defaultValue={initial?.unit ?? "tonne"}
              className={inputClass}
            >
              <option value="tonne">Per tonne</option>
              <option value="load">Per load</option>
              <option value="job">Per job</option>
            </select>
          </label>

          <label>
            <Label>Amount</Label>
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-black/40">
                £
              </span>
              <input
                name="amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={initial?.amount ?? ""}
                placeholder="0.00"
                required
                className={`${inputClass} pl-8`}
              />
            </div>
          </label>

          <div>
            <Label>Currency</Label>
            <div className="flex h-12 items-center rounded-2xl border border-black/10 bg-[#f2efe9] px-4 text-sm font-semibold text-black/45">
              GBP
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
        <Eyebrow>Scope</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">When should Waste X use it?</h2>
        <p className="mt-2 text-sm leading-6 text-black/45">
          More specific rates can sit alongside broader defaults. Waste X will
          use these fields later when matching a booked job.
        </p>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          {rateType === "customer_charge" && (
            <>
              <label>
                <Label>Client *</Label>
                <select
                  name="counterpartyId"
                  value={clientId}
                  onChange={(event) => {
                    setClientId(event.target.value);
                    setClientSiteId("");
                  }}
                  required
                  className={inputClass}
                >
                  <option value="">Choose client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <Label>Client site</Label>
                <select
                  name="counterpartySiteId"
                  value={clientSiteId}
                  onChange={(event) => setClientSiteId(event.target.value)}
                  disabled={!clientId}
                  className={inputClass}
                >
                  <option value="">All client sites</option>
                  {visibleClientSites.map((site) => (
                    <option key={site.id} value={site.id}>
                      {site.name}
                      {site.postcode ? ` · ${site.postcode}` : ""}
                    </option>
                  ))}
                </select>
              </label>
            </>
          )}

          {rateType === "haulage_cost" && (
            <label>
              <Label>Haulier *</Label>
              <select
                name="counterpartyId"
                defaultValue={
                  initial?.rateType === "haulage_cost"
                    ? initial.counterpartyId ?? ""
                    : ""
                }
                required
                className={inputClass}
              >
                <option value="">Choose haulier...</option>
                {hauliers.map((haulier) => (
                  <option key={haulier.id} value={haulier.id}>
                    {haulier.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {rateType === "tipping_cost" && (
            <label className="md:col-span-2">
              <Label>External facility *</Label>
              <select
                name="counterpartySiteId"
                defaultValue={
                  initial?.rateType === "tipping_cost"
                    ? initial.counterpartySiteId ?? ""
                    : ""
                }
                required
                className={inputClass}
              >
                <option value="">Choose external facility...</option>
                {externalFacilities.map((facility) => (
                  <option key={facility.id} value={facility.id}>
                    {facility.name}
                    {facility.postcode ? ` · ${facility.postcode}` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}

          {(rateType === "material_sale" || rateType === "other") && (
            <label>
              <Label>Counterparty</Label>
              <select
                name="counterpartyId"
                defaultValue={
                  initial &&
                  (initial.rateType === "material_sale" ||
                    initial.rateType === "other")
                    ? initial.counterpartyId ?? ""
                    : ""
                }
                className={inputClass}
              >
                <option value="">Any / not specified</option>
                {allCounterparties.map((party) => (
                  <option key={party.id} value={party.id}>
                    {party.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label>
            <Label>
              Material{rateType === "material_sale" ? " *" : ""}
            </Label>
            <select
              name="materialProfileId"
              defaultValue={initial?.materialProfileId ?? ""}
              required={rateType === "material_sale"}
              className={inputClass}
            >
              <option value="">
                {rateType === "material_sale" ? "Choose material..." : "All materials"}
              </option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name} · {formatEwc(material.ewcCode)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <Label>Your receiving site</Label>
            <select
              name="ownSiteId"
              defaultValue={initial?.ownSiteId ?? ""}
              className={inputClass}
            >
              <option value="">All own sites</option>
              {ownSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
        <Eyebrow>Validity</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">Effective period</h2>
        <p className="mt-2 text-sm leading-6 text-black/45">
          Leave either date blank for an open-ended rate. Waste X prevents two
          active rates with the exact same scope and overlapping dates.
        </p>

        <div className="mt-7 grid gap-5 md:grid-cols-2">
          <label>
            <Label>Effective from</Label>
            <input
              name="effectiveFrom"
              type="date"
              defaultValue={initial?.effectiveFrom ?? ""}
              className={inputClass}
            />
          </label>

          <label>
            <Label>Effective to</Label>
            <input
              name="effectiveTo"
              type="date"
              defaultValue={initial?.effectiveTo ?? ""}
              className={inputClass}
            />
          </label>
        </div>
      </section>

      <section className="rounded-[2rem] border border-black/10 bg-white p-7 shadow-sm">
        <Eyebrow>Internal</Eyebrow>
        <h2 className="mt-2 text-xl font-semibold">Notes</h2>

        <textarea
          name="notes"
          rows={4}
          defaultValue={initial?.notes ?? ""}
          placeholder="Optional pricing notes, quote reference, agreed terms..."
          className="mt-6 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 py-3 text-sm outline-none placeholder:text-black/25 focus:border-orange-400 focus:ring-2 focus:ring-orange-100"
        />
      </section>

      <div className="flex justify-end gap-3">
        <Link
          href={mode === "edit" && initial ? `/home/rates/${initial.id}` : "/home/rates"}
          className="rounded-2xl border border-black/10 bg-white px-6 py-3 text-sm font-semibold text-black/55"
        >
          Cancel
        </Link>

        <button
          type="submit"
          className="rounded-2xl bg-orange-500 px-7 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          {mode === "create" ? "Create Rate" : "Save Changes"}
        </button>
      </div>
    </form>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-black/10 bg-[#faf8f4] px-4 text-sm text-black outline-none transition focus:border-orange-400 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50";

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">
      {children}
    </p>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.15em] text-black/40">
      {children}
    </span>
  );
}
