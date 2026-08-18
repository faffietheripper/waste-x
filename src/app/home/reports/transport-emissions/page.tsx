import Link from "next/link";
import {
  and,
  desc,
  eq,
} from "drizzle-orm";

import { database } from "@/db/database";
import { jobLoads } from "@/db/schema";

import { getTransportCarbonFactor } from "@/modules/carbon/core/calculateTransportEmissions";
import { requireSoloPermission } from "@/modules/solo-permissions/core/requireSoloPermission";

import { saveTransportEmissionsAction } from "./actions";

type SearchParams = {
  success?: string | string[];
  error?: string | string[];
  loadId?: string | string[];
};

function firstParam(
  value: string | string[] | undefined,
) {
  return Array.isArray(value)
    ? value[0] ?? ""
    : value ?? "";
}

function number(
  value: string | null | undefined,
) {
  const parsed = Number(value ?? "0");

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function loadTonnes(params: {
  amount: string | null;
  metric: string;
}) {
  const amount =
    number(params.amount);

  if (params.metric === "Kilograms") {
    return amount / 1000;
  }

  if (params.metric === "Grams") {
    return amount / 1_000_000;
  }

  return amount;
}

function formatNumber(
  value: number,
  maximumFractionDigits = 2,
) {
  return new Intl.NumberFormat("en-GB", {
    maximumFractionDigits,
  }).format(value);
}

function kgCo2e(value: number) {
  if (value >= 1000) {
    return `${formatNumber(
      value / 1000,
      3,
    )} tCO₂e`;
  }

  return `${formatNumber(
    value,
    1,
  )} kg CO₂e`;
}

function date(
  value: Date | null | undefined,
) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
  }).format(value);
}

function sourceLabel(
  value: string | null,
) {
  if (value === "measured") {
    return "Measured / known";
  }

  if (value === "customer_provided") {
    return "Customer provided";
  }

  if (value === "estimated") {
    return "Estimated";
  }

  return "Not set";
}

function errorMessage(
  value: string,
) {
  const messages: Record<string, string> = {
    load_required:
      "A Job Load was not supplied.",
    load_not_found:
      "Waste X could not find that Job Load in your organisation.",
    load_not_completed:
      "Transport emissions can only be snapshotted once the load is completed.",
    distance_required:
      "Enter a movement distance greater than zero.",
    invalid_distance_unit:
      "Choose kilometres or miles.",
    invalid_distance_source:
      "Choose how the distance was obtained.",
    net_weight_required:
      "A positive net load weight is required before transport CO₂e can be calculated.",
    invalid_weight_metric:
      "The Job Load has an unsupported weight unit.",
  };

  return (
    messages[value] ??
    "Waste X could not calculate transport emissions for that load."
  );
}

export default async function TransportEmissionsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access =
    await requireSoloPermission(
      "reports:view",
    );

  const canOperate =
    access.permissions.has(
      "worksheet:operate",
    );

  const loads =
    await database.query.jobLoads.findMany({
      where: and(
        eq(
          jobLoads.organisationId,
          access.organisationId,
        ),
        eq(
          jobLoads.status,
          "completed",
        ),
      ),

      with: {
        job: true,
        client: true,
        vehicle: true,
        haulier: true,
      },

      orderBy: [
        desc(jobLoads.completedAt),
        desc(jobLoads.updatedAt),
      ],

      limit: 250,
    });

  const rows = loads.map((load) => {
    const tonnes =
      loadTonnes({
        amount:
          load.netWeight,
        metric:
          load.weightMetric,
      });

    const distanceKm =
      number(
        load.transportDistanceKm,
      );

    const co2eKg =
      number(
        load.transportCo2eKg,
      );

    return {
      load,
      tonnes,
      distanceKm,
      co2eKg,
      calculated:
        distanceKm > 0 &&
        co2eKg > 0 &&
        Boolean(
          load.transportCarbonCalculatedAt,
        ),
    };
  });

  const calculatedRows =
    rows.filter(
      (row) => row.calculated,
    );

  const totalTonnes =
    calculatedRows.reduce(
      (sum, row) =>
        sum + row.tonnes,
      0,
    );

  const totalKm =
    calculatedRows.reduce(
      (sum, row) =>
        sum + row.distanceKm,
      0,
    );

  const totalCo2eKg =
    calculatedRows.reduce(
      (sum, row) =>
        sum + row.co2eKg,
      0,
    );

  const intensity =
    totalTonnes > 0
      ? totalCo2eKg /
        totalTonnes
      : 0;

  const missingDistance =
    rows.filter(
      (row) =>
        row.tonnes > 0 &&
        !row.calculated,
    ).length;

  const clientMap =
    new Map<
      string,
      {
        name: string;
        loads: number;
        tonnes: number;
        km: number;
        co2eKg: number;
      }
    >();

  const vehicleMap =
    new Map<
      string,
      {
        label: string;
        loads: number;
        tonnes: number;
        km: number;
        co2eKg: number;
      }
    >();

  for (const row of calculatedRows) {
    const clientKey =
      row.load.client?.id ??
      "unknown";

    const client =
      clientMap.get(clientKey) ?? {
        name:
          row.load.client?.name ??
          "Client not recorded",
        loads: 0,
        tonnes: 0,
        km: 0,
        co2eKg: 0,
      };

    client.loads += 1;
    client.tonnes += row.tonnes;
    client.km += row.distanceKm;
    client.co2eKg += row.co2eKg;

    clientMap.set(
      clientKey,
      client,
    );

    const vehicleKey =
      row.load.vehicle?.id ??
      "unassigned";

    const vehicle =
      vehicleMap.get(vehicleKey) ?? {
        label:
          row.load.vehicle
            ?.registrationNumber ??
          "Vehicle not recorded",
        loads: 0,
        tonnes: 0,
        km: 0,
        co2eKg: 0,
      };

    vehicle.loads += 1;
    vehicle.tonnes += row.tonnes;
    vehicle.km += row.distanceKm;
    vehicle.co2eKg += row.co2eKg;

    vehicleMap.set(
      vehicleKey,
      vehicle,
    );
  }

  const clientRows =
    Array.from(
      clientMap.values(),
    )
      .sort(
        (a, b) =>
          b.co2eKg - a.co2eKg,
      )
      .slice(0, 8);

  const vehicleRows =
    Array.from(
      vehicleMap.values(),
    )
      .sort(
        (a, b) =>
          b.co2eKg - a.co2eKg,
      )
      .slice(0, 8);

  const factor =
    getTransportCarbonFactor();

  const success =
    firstParam(
      searchParams.success,
    );

  const error =
    firstParam(
      searchParams.error,
    );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-12 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <div className="mx-auto max-w-7xl space-y-6">

        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />

          <div className="relative z-10 flex flex-col gap-7 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Sustainability · Transport
              </p>

              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                Transport Emissions
              </h1>

              <p className="mt-3 max-w-4xl text-sm leading-6 text-white/55">
                Estimate the transport CO₂e allocated to each factual Job Load from
                the waste tonnes moved and the one-way movement distance.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href="/home/reports"
                className="rounded-2xl bg-white px-5 py-3 text-sm font-semibold text-black"
              >
                ← Reports
              </Link>

              <Link
                href="/home/worksheet"
                className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white"
              >
                Daily Worksheet
              </Link>
            </div>
          </div>
        </section>

        <section className="rounded-[28px] border border-blue-200 bg-blue-50 p-5 text-blue-900">
          <p className="text-sm font-semibold">
            What this number means
          </p>

          <p className="mt-2 max-w-5xl text-sm leading-6 text-blue-800/80">
            Estimated transport CO₂e = tonnes moved × movement distance in km ×
            the snapshotted freight factor. This is a transport-emissions estimate,
            not Waste X claiming to calculate the organisation&apos;s complete carbon
            footprint.
          </p>
        </section>

        {(success || error) ? (
          <section
            className={`rounded-2xl border px-5 py-4 text-sm font-medium ${
              error
                ? "border-red-200 bg-red-50 text-red-700"
                : "border-emerald-200 bg-emerald-50 text-emerald-700"
            }`}
          >
            {error
              ? errorMessage(error)
              : "Transport emissions snapshot saved."}
          </section>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Metric
            label="Loads calculated"
            value={`${calculatedRows.length}/${rows.length}`}
            helper="Latest 250 completed loads"
          />

          <Metric
            label="Waste covered"
            value={`${formatNumber(totalTonnes, 1)} t`}
            helper="Net tonnes with an emissions snapshot"
          />

          <Metric
            label="Movement distance"
            value={`${formatNumber(totalKm, 0)} km`}
            helper="One-way load movements"
          />

          <Metric
            label="Estimated transport CO₂e"
            value={kgCo2e(totalCo2eKg)}
            helper="Current calculated load snapshots"
            highlighted
          />

          <Metric
            label="CO₂e intensity"
            value={`${formatNumber(intensity, 2)} kg/t`}
            helper={`${missingDistance} load(s) still missing distance`}
          />
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <BreakdownCard
            eyebrow="Customer reporting"
            title="By client"
            rows={clientRows.map((row) => ({
              label: row.name,
              detail: `${row.loads} load(s) · ${formatNumber(row.tonnes, 1)} t · ${formatNumber(row.km, 0)} km`,
              value: kgCo2e(row.co2eKg),
            }))}
          />

          <BreakdownCard
            eyebrow="Transport intelligence"
            title="By vehicle"
            rows={vehicleRows.map((row) => ({
              label: row.label,
              detail: `${row.loads} load(s) · ${formatNumber(row.tonnes, 1)} t · ${formatNumber(row.km, 0)} km`,
              value: kgCo2e(row.co2eKg),
            }))}
          />
        </section>

        <section className="rounded-[30px] border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-5 border-b border-black/10 pb-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                Calculation queue
              </p>

              <h2 className="mt-2 text-2xl font-semibold">
                Completed Job Loads
              </h2>

              <p className="mt-2 max-w-3xl text-sm leading-6 text-black/45">
                Enter the actual/known movement distance where available. If the
                distance is approximate, mark it as estimated so customer reporting
                remains transparent.
              </p>
            </div>

            <div className="max-w-xl rounded-2xl border border-black/10 bg-[#fbfaf7] p-4 text-xs leading-5 text-black/50">
              <strong>Current factor:</strong>{" "}
              {factor.kgCo2ePerTonneKm} kg CO₂e/tkm · {factor.source} ·{" "}
              {factor.year}
              {!factor.isConfiguredOverride
                ? " · baseline fallback"
                : ""}
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-black/45">
              No completed Job Loads yet.
            </div>
          ) : (
            <div className="mt-5 space-y-4">
              {rows.map(({ load, tonnes, distanceKm, co2eKg, calculated }) => {
                const hasWeight =
                  tonnes > 0;

                return (
                  <article
                    key={load.id}
                    className={`rounded-3xl border p-5 ${
                      calculated
                        ? "border-emerald-200 bg-emerald-50/40"
                        : "border-black/10 bg-[#fbfaf7]"
                    }`}
                  >
                    <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/home/jobs/${load.jobId}`}
                            className="font-semibold hover:text-orange-700"
                          >
                            {load.job.jobNumber} · Load {load.loadNumber}
                          </Link>

                          <span
                            className={`rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.12em] ${
                              calculated
                                ? "border-emerald-200 bg-white text-emerald-700"
                                : "border-orange-200 bg-orange-50 text-orange-700"
                            }`}
                          >
                            {calculated
                              ? "CO₂e calculated"
                              : "Distance required"}
                          </span>
                        </div>

                        <p className="mt-2 text-sm text-black/50">
                          {load.client?.name ?? "Client not recorded"} ·{" "}
                          {load.haulier?.name ?? "Own transport"} ·{" "}
                          {load.vehicle?.registrationNumber ?? "Vehicle not recorded"}
                        </p>

                        <div className="mt-4 grid gap-3 sm:grid-cols-4">
                          <MiniStat
                            label="Completed"
                            value={date(load.completedAt)}
                          />
                          <MiniStat
                            label="Net waste"
                            value={
                              hasWeight
                                ? `${formatNumber(tonnes, 3)} t`
                                : "Missing"
                            }
                          />
                          <MiniStat
                            label="Distance"
                            value={
                              calculated
                                ? `${formatNumber(distanceKm, 1)} km`
                                : "Not set"
                            }
                          />
                          <MiniStat
                            label="Estimated CO₂e"
                            value={
                              calculated
                                ? kgCo2e(co2eKg)
                                : "Not calculated"
                            }
                          />
                        </div>

                        {calculated ? (
                          <div className="mt-3 flex flex-wrap gap-2 text-[10px] text-black/45">
                            <Pill>
                              {sourceLabel(load.transportDistanceSource)}
                            </Pill>
                            <Pill>
                              {load.transportCarbonFactorKgPerTonneKm} kg CO₂e/tkm
                            </Pill>
                            <Pill>
                              Factor {load.transportCarbonFactorYear ?? "—"}
                            </Pill>
                            <Pill>
                              {load.transportCarbonFactorSource ?? "Source not recorded"}
                            </Pill>
                          </div>
                        ) : null}
                      </div>

                      <div>
                        {!canOperate ? (
                          <div className="rounded-2xl border border-black/10 bg-white p-4 text-sm text-black/45">
                            You can view transport emissions, but an Operations user
                            must enter or update movement distance.
                          </div>
                        ) : !hasWeight ? (
                          <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
                            Record a positive net load weight in the Daily Worksheet
                            before calculating transport emissions.
                          </div>
                        ) : (
                          <form
                            action={saveTransportEmissionsAction}
                            className="rounded-2xl border border-black/10 bg-white p-4"
                          >
                            <input
                              type="hidden"
                              name="loadId"
                              value={load.id}
                            />

                            <p className="text-xs font-semibold text-black/60">
                              {calculated
                                ? "Update movement distance"
                                : "Add movement distance"}
                            </p>

                            <div className="mt-3 grid grid-cols-[1fr_110px] gap-2">
                              <input
                                type="number"
                                name="distance"
                                min="0.001"
                                step="0.001"
                                required
                                defaultValue={
                                  calculated
                                    ? load.transportDistanceKm ?? ""
                                    : ""
                                }
                                placeholder="Distance"
                                className="h-11 rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-orange-400"
                              />

                              <select
                                name="distanceUnit"
                                defaultValue="km"
                                className="h-11 rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-orange-400"
                              >
                                <option value="km">km</option>
                                <option value="miles">miles</option>
                              </select>
                            </div>

                            <select
                              name="distanceSource"
                              defaultValue={
                                load.transportDistanceSource ??
                                "measured"
                              }
                              className="mt-2 h-11 w-full rounded-xl border border-black/10 px-3 text-sm outline-none focus:border-orange-400"
                            >
                              <option value="measured">
                                Measured / known
                              </option>
                              <option value="customer_provided">
                                Customer provided
                              </option>
                              <option value="estimated">
                                Estimated
                              </option>
                            </select>

                            <p className="mt-2 text-[10px] leading-4 text-black/35">
                              Enter the one-way movement distance from origin to
                              destination. Miles are converted to km internally.
                            </p>

                            <button
                              type="submit"
                              className="mt-3 w-full rounded-xl bg-black px-4 py-2.5 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black"
                            >
                              {calculated
                                ? "Recalculate snapshot"
                                : "Calculate transport CO₂e"}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-[28px] border border-orange-200 bg-orange-50 p-6 text-orange-950">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-700">
            Reporting boundary
          </p>

          <p className="mt-3 max-w-5xl text-sm leading-6 text-orange-900/70">
            Waste X snapshots the distance, factor, factor year, method and result
            against the factual Job Load. Updating the configured factor later will
            not silently rewrite old calculations. This feature is designed for
            operational/customer transport-emissions evidence, not formal assurance
            of a complete corporate greenhouse-gas inventory.
          </p>
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
}: {
  label: string;
  value: string;
  helper: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border p-5 shadow-sm ${
        highlighted
          ? "border-orange-200 bg-orange-50"
          : "border-black/10 bg-white"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-black/35">
        {label}
      </p>
      <p className="mt-3 text-2xl font-semibold tracking-tight">
        {value}
      </p>
      <p className="mt-1 text-xs text-black/40">
        {helper}
      </p>
    </div>
  );
}

function MiniStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white px-3 py-2.5">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/30">
        {label}
      </p>
      <p className="mt-1 truncate text-xs font-semibold text-black/65">
        {value}
      </p>
    </div>
  );
}

function Pill({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <span className="rounded-full border border-black/10 bg-white px-2.5 py-1">
      {children}
    </span>
  );
}

function BreakdownCard({
  eyebrow,
  title,
  rows,
}: {
  eyebrow: string;
  title: string;
  rows: Array<{
    label: string;
    detail: string;
    value: string;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 p-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-600">
          {eyebrow}
        </p>
        <h2 className="mt-1 text-xl font-semibold">
          {title}
        </h2>
      </div>

      {rows.length === 0 ? (
        <div className="p-8 text-center text-sm text-black/40">
          Add movement distances to build this breakdown.
        </div>
      ) : (
        <div className="divide-y divide-black/5">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex items-center justify-between gap-5 px-5 py-4"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">
                  {row.label}
                </p>
                <p className="mt-1 truncate text-xs text-black/40">
                  {row.detail}
                </p>
              </div>
              <p className="shrink-0 text-sm font-semibold">
                {row.value}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
