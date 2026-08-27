import Link from "next/link";
import {
  and,
  desc,
  eq,
  inArray,
} from "drizzle-orm";

import { transportRouteSnapshots } from "@/db/carbon-schema";
import { database } from "@/db/database";
import { jobLoads, sites } from "@/db/schema";
import { getTransportCarbonFactor } from "@/modules/carbon/core/calculateTransportEmissions";
import { deriveTransportRouteContext } from "@/modules/carbon/core/transportRouteContext";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import AutoTransportEmissionsHydrator from "./AutoTransportEmissionsHydrator";
import TransportEmissionsSearch from "./TransportEmissionsSearch";
import {
  recalculateTransportEmissionsAction,
  refreshAutomaticTransportEmissionsAction,
  saveTransportRoutePostcodesAction,
} from "./actions";

type SearchParams = {
  success?: string | string[];
  error?: string | string[];
  loadId?: string | string[];
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function number(value: string | null | undefined) {
  const parsed = Number(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function loadTonnes(amount: string | null, metric: string) {
  const value = number(amount);
  if (metric === "Kilograms") return value / 1000;
  if (metric === "Grams") return value / 1_000_000;
  return value;
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits: digits,
  }).format(value);
}

function kgCo2e(value: number) {
  if (value >= 1000) return `${formatNumber(value / 1000, 3)} tCO₂e`;
  return `${formatNumber(value, 1)} kg CO₂e`;
}

function date(value: Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(value);
}

function errorMessage(value: string) {
  const messages: Record<string, string> = {
    load_required: "A Job Load was not supplied.",
    load_not_found: "Waste X could not find that Job Load.",
    load_not_completed: "Only completed Loads are included in this report.",
    origin_postcode_required: "Enter the origin postcode.",
    destination_postcode_required: "Enter the destination postcode.",
    route_calculation_failed:
      "The postcodes were saved, but Waste X could not calculate the road route yet. Retry the row in a moment.",
    net_weight_required: "A positive net weight is required before CO₂e can be calculated.",
    invalid_weight_metric: "The Load has an unsupported weight unit.",
  };

  return messages[value] ?? "Transport emissions could not be updated.";
}

function successMessage(value: string) {
  const messages: Record<string, string> = {
    route_saved: "Postcodes saved and transport emissions calculated automatically.",
    recalculated: "Road distance and transport emissions recalculated.",
    auto_refreshed: "Automatic transport-emissions calculations refreshed.",
    calculated: "Transport emissions snapshot saved.",
  };
  return messages[value] ?? "Transport emissions updated.";
}

export default async function TransportEmissionsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireSoloPermission("reports:view");
  const canOperate = access.permissions.has("worksheet:operate");

  const defaultOwnSite = await database.query.sites.findFirst({
    where: and(
      eq(sites.organisationId, access.organisationId),
      eq(sites.isDefault, true),
    ),
    columns: {
      id: true,
      name: true,
      postcode: true,
    },
  });

  const loads = await database.query.jobLoads.findMany({
    where: and(
      eq(jobLoads.organisationId, access.organisationId),
      eq(jobLoads.status, "completed"),
    ),
    with: {
      job: true,
      client: true,
      clientSite: true,
      ownSite: true,
      thirdPartyDestinationSite: true,
      vehicle: true,
      haulier: true,
      driver: true,
    },
    orderBy: [desc(jobLoads.completedAt), desc(jobLoads.updatedAt)],
    limit: 500,
  });

  const loadIds = loads.map((load) => load.id);
  const snapshots = loadIds.length
    ? await database.query.transportRouteSnapshots.findMany({
        where: and(
          eq(transportRouteSnapshots.organisationId, access.organisationId),
          inArray(transportRouteSnapshots.jobLoadId, loadIds),
        ),
      })
    : [];
  const snapshotMap = new Map(snapshots.map((row) => [row.jobLoadId, row]));

  const rows = loads.map((load) => {
    const snapshot = snapshotMap.get(load.id);
    const route = deriveTransportRouteContext({
      direction: load.direction,
      clientSite: load.clientSite,
      ownSite: load.ownSite,
      thirdPartyDestinationSite: load.thirdPartyDestinationSite,
      defaultOwnSite,
      originPostcodeOverride: snapshot?.originPostcode,
      destinationPostcodeOverride: snapshot?.destinationPostcode,
      originOverrideEnabled: snapshot?.originPostcodeOverride ?? false,
      destinationOverrideEnabled:
        snapshot?.destinationPostcodeOverride ?? false,
    });

    const tonnes = loadTonnes(load.netWeight, load.weightMetric);
    const distanceKm = number(load.transportDistanceKm);
    const co2eKg = number(load.transportCo2eKg);
    const hasCarbonSnapshot = Boolean(load.transportCarbonCalculatedAt);
    const hasPostcodes = Boolean(route.origin.postcode && route.destination.postcode);

    const routeMatchesSnapshot =
      snapshot?.originPostcode === route.origin.postcode &&
      snapshot?.destinationPostcode === route.destination.postcode;

    const calculated =
      hasCarbonSnapshot &&
      routeMatchesSnapshot &&
      snapshot?.status === "calculated";

    const needsCalculation =
      tonnes > 0 && hasPostcodes && !calculated;

    return {
      load,
      snapshot,
      route,
      tonnes,
      distanceKm,
      co2eKg,
      calculated,
      hasPostcodes,
      needsCalculation,
    };
  });

  const calculatedRows = rows.filter((row) => row.calculated);
  const totalTonnes = calculatedRows.reduce((sum, row) => sum + row.tonnes, 0);
  const totalKm = calculatedRows.reduce((sum, row) => sum + row.distanceKm, 0);
  const totalCo2eKg = calculatedRows.reduce((sum, row) => sum + row.co2eKg, 0);
  const missingPostcodeRows = rows.filter((row) => !row.hasPostcodes);
  const pendingRows = rows.filter((row) => row.needsCalculation);
  const intensity = totalTonnes > 0 ? totalCo2eKg / totalTonnes : 0;
  const factor = getTransportCarbonFactor();

  const success = firstParam(searchParams.success);
  const error = firstParam(searchParams.error);

  const autoSignature = `${pendingRows.length}:${rows[0]?.load.updatedAt ? rows[0].load.updatedAt.getTime() : 0}`;

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-14 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <AutoTransportEmissionsHydrator
        pendingCount={pendingRows.length}
        signature={autoSignature}
      />

      <div className="mx-auto max-w-[1500px] space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Reports · Sustainability
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Transport Emissions
              </h1>
              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">
                Waste X automatically uses the source and destination postcodes,
                calculates a one-way road route, then applies the Load&apos;s actual
                tonnes to the transport CO₂e calculation.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <form action={refreshAutomaticTransportEmissionsAction}>
                <button className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black hover:bg-orange-400">
                  Refresh automatic calculations
                </button>
              </form>
              <Link
                href="/home/reports"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white"
              >
                ← Reports
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[24px] border border-blue-200 bg-blue-50 px-5 py-4 text-sm leading-6 text-blue-900">
          <strong>Automatic route:</strong> incoming = customer/source site → your
          receiving site. Outgoing = your receiving site → third-party destination.
          Distance is a road-route estimate between postcode centroids, not an
          odometer or exact gate-to-gate measurement.
        </section>

        {(success || error) && (
          <section
            className={`rounded-2xl border px-5 py-4 text-sm font-medium ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error ? errorMessage(error) : successMessage(success)}
          </section>
        )}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric label="Completed Loads" value={String(rows.length)} helper="Latest 500" />
          <Metric
            label="Automatically calculated"
            value={`${calculatedRows.length}/${rows.length}`}
            helper={`${pendingRows.length} ready to auto-calculate`}
          />
          <Metric
            label="Missing postcodes"
            value={String(missingPostcodeRows.length)}
            helper="Editable directly in the table"
            warning={missingPostcodeRows.length > 0}
          />
          <Metric
            label="Movement distance"
            value={`${formatNumber(totalKm, 0)} km`}
            helper="One-way road routes"
          />
          <Metric
            label="Estimated transport CO₂e"
            value={kgCo2e(totalCo2eKg)}
            helper={`${formatNumber(intensity, 2)} kg CO₂e / tonne`}
            highlighted
          />
        </section>

        <section className="overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-black/10 p-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Automatic load register
              </p>
              <h2 className="mt-1 text-xl font-semibold">Transport emissions table</h2>
              <p className="mt-1 text-xs text-black/45">
                {factor.kgCo2ePerTonneKm} kg CO₂e/tkm · {factor.source} · {factor.year}
              </p>
            </div>

            <TransportEmissionsSearch total={rows.length} />
          </div>

          {rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-black/45">
              No completed Job Loads yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1250px] border-collapse text-left">
                <thead className="bg-[#fbfaf7]">
                  <tr className="border-b border-black/10 text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
                    <th className="px-4 py-3">Job / Load</th>
                    <th className="px-4 py-3">Route</th>
                    <th className="px-4 py-3">Transport</th>
                    <th className="px-4 py-3">Waste</th>
                    <th className="px-4 py-3">Distance</th>
                    <th className="px-4 py-3">CO₂e</th>
                    <th className="px-4 py-3">Status / Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const { load, route, snapshot } = row;
                    const status = !row.hasPostcodes
                      ? "needs_postcode"
                      : row.calculated
                        ? "calculated"
                        : snapshot?.status === "route_failed"
                          ? "route_failed"
                          : "calculating";

                    const searchText = [
                      load.job?.jobNumber,
                      `load ${load.loadNumber}`,
                      load.direction,
                      load.client?.name,
                      load.haulier?.name,
                      load.vehicle?.registrationNumber,
                      load.driver?.name,
                      route.origin.name,
                      route.origin.postcode,
                      route.destination.name,
                      route.destination.postcode,
                      status,
                    ]
                      .filter(Boolean)
                      .join(" ");

                    return (
                      <tr
                        key={load.id}
                        id={`load-${load.id}`}
                        data-transport-emissions-row="true"
                        data-search={searchText}
                        className="scroll-mt-28 border-b border-black/5 align-top last:border-b-0 hover:bg-orange-50/25"
                      >
                        <td className="px-4 py-4">
                          <Link
                            href={`/home/jobs/${load.jobId}`}
                            className="text-sm font-semibold hover:text-orange-700"
                          >
                            {load.job?.jobNumber ?? load.jobId}
                          </Link>
                          <p className="mt-1 text-xs text-black/45">
                            Load {load.loadNumber} · {load.direction.toUpperCase()}
                          </p>
                          <p className="mt-1 text-[10px] text-black/35">
                            Completed {date(load.completedAt)}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="max-w-[260px] truncate text-xs font-semibold">
                            {route.origin.name}
                          </p>
                          <p className={`mt-1 text-xs ${route.origin.postcode ? "text-black/45" : "font-semibold text-amber-700"}`}>
                            {route.origin.postcode || "Origin postcode missing"}
                          </p>
                          <p className="my-1 text-[10px] text-black/25">↓</p>
                          <p className="max-w-[260px] truncate text-xs font-semibold">
                            {route.destination.name}
                          </p>
                          <p className={`mt-1 text-xs ${route.destination.postcode ? "text-black/45" : "font-semibold text-amber-700"}`}>
                            {route.destination.postcode || "Destination postcode missing"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-xs font-semibold">
                            {load.haulier?.name ?? "Own / haulier not recorded"}
                          </p>
                          <p className="mt-1 text-xs text-black/45">
                            {load.vehicle?.registrationNumber ?? "Vehicle not recorded"}
                          </p>
                          <p className="mt-1 text-[10px] text-black/35">
                            {load.driver?.name ?? "Driver not recorded"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold">
                            {formatNumber(row.tonnes, 3)} t
                          </p>
                          <p className="mt-1 max-w-[190px] truncate text-xs text-black/40">
                            {load.ewcCodeSnapshot ?? "EWC not recorded"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold">
                            {row.calculated ? `${formatNumber(row.distanceKm, 1)} km` : "—"}
                          </p>
                          <p className="mt-1 max-w-[170px] text-[10px] leading-4 text-black/35">
                            {snapshot?.routeProvider ?? "Postcode road route"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          <p className="text-sm font-semibold">
                            {row.calculated ? kgCo2e(row.co2eKg) : "—"}
                          </p>
                          <p className="mt-1 text-[10px] text-black/35">
                            {row.calculated ? "tonne-km estimate" : "Waiting for route"}
                          </p>
                        </td>

                        <td className="px-4 py-4">
                          {status === "calculated" ? (
                            <div>
                              <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-emerald-700">
                                Automatic ✓
                              </span>
                              <form action={recalculateTransportEmissionsAction} className="mt-2">
                                <input type="hidden" name="loadId" value={load.id} />
                                <button className="text-[10px] font-semibold text-black/40 underline underline-offset-2 hover:text-orange-700">
                                  Recalculate route
                                </button>
                              </form>
                            </div>
                          ) : status === "calculating" ? (
                            <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-blue-700">
                              Auto calculating…
                            </span>
                          ) : (
                            <details className="relative">
                              <summary className="cursor-pointer list-none">
                                <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-800">
                                  {status === "route_failed" ? "Route needs review" : "Postcode needed"}
                                </span>
                                <p className="mt-2 text-[10px] font-semibold text-orange-700 underline underline-offset-2">
                                  Review route
                                </p>
                              </summary>

                              <div className="mt-3 w-[330px] rounded-2xl border border-black/10 bg-white p-4 shadow-xl">
                                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                                  Fix route postcodes
                                </p>
                                <p className="mt-1 text-xs leading-5 text-black/45">
                                  Saving a postcode updates the linked site where possible,
                                  so future Jobs calculate automatically too.
                                </p>

                                {snapshot?.lastError && (
                                  <p className="mt-3 rounded-xl bg-amber-50 p-3 text-[10px] leading-4 text-amber-800">
                                    {snapshot.lastError}
                                  </p>
                                )}

                                {canOperate ? (
                                  <form action={saveTransportRoutePostcodesAction} className="mt-3 grid gap-3">
                                    <input type="hidden" name="loadId" value={load.id} />

                                    <label>
                                      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                        Origin postcode
                                      </span>
                                      <input
                                        name="originPostcode"
                                        required
                                        defaultValue={route.origin.postcode}
                                        placeholder="e.g. NR14 6EX"
                                        className="h-10 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-xs uppercase outline-none focus:border-orange-400"
                                      />
                                    </label>

                                    <label>
                                      <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                        Destination postcode
                                      </span>
                                      <input
                                        name="destinationPostcode"
                                        required
                                        defaultValue={route.destination.postcode}
                                        placeholder="e.g. IP14 1AB"
                                        className="h-10 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-xs uppercase outline-none focus:border-orange-400"
                                      />
                                    </label>

                                    <button className="h-10 rounded-xl bg-black px-3 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                                      Save & calculate automatically
                                    </button>
                                  </form>
                                ) : (
                                  <p className="mt-3 text-xs text-black/45">
                                    You can view this issue, but your role cannot edit operational site postcodes.
                                  </p>
                                )}
                              </div>
                            </details>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function Metric({
  label,
  value,
  helper,
  highlighted = false,
  warning = false,
}: {
  label: string;
  value: string;
  helper: string;
  highlighted?: boolean;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border p-5 shadow-sm ${
        highlighted
          ? "border-orange-200 bg-orange-50"
          : warning
            ? "border-amber-200 bg-amber-50"
            : "border-black/10 bg-white"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-[10px] leading-4 text-black/40">{helper}</p>
    </div>
  );
}
