import Link from "next/link";
import type { ReactNode } from "react";

import {
  backfillQuarterReturnSnapshotsAction,
  resolveReturnGeographiesAction,
  resolveSingleReturnGeographyAction,
  saveLoadReturnOverrideAction,
  saveJobReturnProfileAction,
  saveMaterialReturnProfileAction,
  saveReturnAreaOverrideAction,
  saveReturnSettingsAction,
} from "./actions";
import { requireAdminValueAccess } from "@/modules/admin-value/core/requireAdminValueAccess";
import {
  getEnglandEaSubmissionWindow,
  parseQuarterSearchParams,
} from "@/modules/admin-value/core/quarterPeriods";
import { getQuarterlyWasteReturnData } from "@/modules/admin-value/data-access/getQuarterlyWasteReturnData";

type SearchParams = {
  year?: string | string[];
  quarter?: string | string[];
  siteId?: string | string[];
  view?: string | string[];
  success?: string | string[];
  error?: string | string[];
  resolved?: string | string[];
  count?: string | string[];
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function tonnes(value: number) {
  return `${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  }).format(value)} t`;
}

function bool(value: boolean) {
  return value ? "Yes" : "No";
}

function dateTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function hiddenContext(params: {
  year: number;
  quarter: number;
  siteId: string | null;
  view: string;
}) {
  return (
    <>
      <input type="hidden" name="year" value={params.year} />
      <input type="hidden" name="quarter" value={params.quarter} />
      <input type="hidden" name="siteId" value={params.siteId ?? ""} />
      <input type="hidden" name="view" value={params.view} />
    </>
  );
}

const successMessages: Record<string, string> = {
  settings_saved: "Quarterly-return defaults saved.",
  load_return_override_saved: "Load return override saved.",
  geography_resolved: "Postcode geography resolved.",
  material_saved: "Material return classification saved.",
  job_return_profile_saved: "Job return classification saved.",
  geography_override_saved: "Return geography override saved.",
  geographies_resolved: "Postcode geography resolution completed.",
  snapshots_backfilled: "Historic return snapshots refreshed for this quarter.",
};

const errorMessages: Record<string, string> = {
  no_postcodes_to_resolve: "There are no site postcodes available to resolve.",
  postcode_service_unavailable:
    "The postcode geography service is unavailable. Nothing was overwritten; try again later.",
  invalid_geography_override: "Complete the local-authority override fields.",
  material_required: "Choose a material before saving its return classification.",
  job_required: "Choose a Job before saving its return classification.",
  load_required: "Choose a Load before saving its return override.",
  load_not_found: "That Load could not be found.",
  geography_postcode_required: "A postcode is required before geography can be resolved.",
  geography_not_found: "That postcode could not be matched to a local authority.",
};

export default async function QuarterlyReturnsPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireAdminValueAccess();
  const period = parseQuarterSearchParams(searchParams);
  const requestedSiteId = first(searchParams.siteId) || null;
  const requestedView = first(searchParams.view);
  const view = ["incoming", "outgoing", "exceptions", "setup", "summary", "audit"].includes(
    requestedView,
  )
    ? requestedView
    : "incoming";

  const data = await getQuarterlyWasteReturnData({
    organisationId: access.organisationId,
    period,
    requestedSiteId,
  });

  const baseQuery = new URLSearchParams({
    year: String(period.year),
    quarter: String(period.quarter),
  });
  if (data.selectedSiteId) baseQuery.set("siteId", data.selectedSiteId);

  const eaWindow =
    data.selectedSite?.regulator === "EA"
      ? getEnglandEaSubmissionWindow(period)
      : null;

  const success = first(searchParams.success);
  const error = first(searchParams.error);
  const resolvedCount = first(searchParams.resolved);
  const snapshotCount = first(searchParams.count);

  const context = {
    year: period.year,
    quarter: period.quarter,
    siteId: data.selectedSiteId,
    view,
  };

  /*
    Show one exception card per affected Load rather than one card per issue.
    The raw issue list is still kept for export/audit.
  */
  const exceptionGroups = Array.from(
    data.exceptions.reduce((map, item) => {
      const existing = map.get(item.jobLoadId);

      if (existing) {
        existing.issues.push(item.issue);
      } else {
        map.set(item.jobLoadId, {
          ...item,
          issues: [item.issue],
        });
      }

      return map;
    }, new Map<string, (typeof data.exceptions)[number] & { issues: string[] }>()),
  ).map(([, item]) => item);

  const validReturnLoadCount = data.detailRows.length;
  const hasPartialReturn =
    exceptionGroups.length > 0 && validReturnLoadCount > 0;

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw] pt-[14vh] text-black">
      <div className="px-10 py-10">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-8 text-white shadow-sm">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10 flex flex-col justify-between gap-7 xl:flex-row xl:items-end">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Compliance admin · EA v{data.settings.formVersion}
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight">
                Quarterly Returns
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
                Waste X now prepares the regulator-facing Incoming and Outgoing
                rows from factual Loads. Source and destination local authorities
                are resolved from site postcodes and snapshotted with the Load so
                quarter-end reporting does not become another data-entry exercise.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={`/home/returns/export/csv?${baseQuery.toString()}`}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Existing prep CSV
              </Link>
              <Link
                href={`/home/returns/export/excel?${baseQuery.toString()}`}
                className="rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white hover:text-black"
              >
                Existing prep Excel
              </Link>
              <Link
                href={`/home/returns/export/ea-ready?${baseQuery.toString()}`}
                className="rounded-2xl bg-orange-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                {data.exceptions.length > 0
                  ? "Download return workbook · valid rows"
                  : "Download return workbook"}
              </Link>
            </div>
          </div>
        </section>

        {(success || error) && (
          <div
            className={`mt-5 rounded-2xl border px-5 py-4 text-sm font-medium ${
              error
                ? "border-red-200 bg-red-50 text-red-800"
                : "border-emerald-200 bg-emerald-50 text-emerald-800"
            }`}
          >
            {error
              ? errorMessages[error] ?? `Operation failed: ${error}`
              : `${successMessages[success] ?? "Updated."}${
                  resolvedCount ? ` ${resolvedCount} site geographies resolved.` : ""
                }${snapshotCount ? ` ${snapshotCount} Load snapshots created.` : ""}`}
          </div>
        )}

        <section className="mt-6 rounded-[28px] border border-black/10 bg-white p-5 shadow-sm">
          <form
            method="get"
            className="grid gap-4 md:grid-cols-3 xl:grid-cols-[1fr_1fr_2fr_auto] xl:items-end"
          >
            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">Year</span>
              <select
                name="year"
                defaultValue={String(period.year)}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                {Array.from({ length: 7 }, (_, index) => period.year - 3 + index).map(
                  (year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">Quarter</span>
              <select
                name="quarter"
                defaultValue={String(period.quarter)}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                <option value="1">Q1 · Jan–Mar</option>
                <option value="2">Q2 · Apr–Jun</option>
                <option value="3">Q3 · Jul–Sep</option>
                <option value="4">Q4 · Oct–Dec</option>
              </select>
            </label>

            <label>
              <span className="mb-2 block text-xs font-semibold text-black/50">
                Permitted site
              </span>
              <select
                name="siteId"
                defaultValue={data.selectedSiteId ?? ""}
                className="h-12 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 text-sm outline-none focus:border-orange-400"
              >
                {data.sites.length === 0 && (
                  <option value="">No receiving site configured</option>
                )}
                {data.sites.map((site) => (
                  <option key={site.id} value={site.id}>
                    {site.name}
                    {site.primaryPermitNumber
                      ? ` · ${site.primaryPermitNumber}`
                      : " · no active permit"}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="submit"
              className="h-12 rounded-2xl bg-black px-6 text-sm font-semibold text-white transition hover:bg-orange-500 hover:text-black"
            >
              Prepare return
            </button>
          </form>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Metric label="Period" value={period.label} helper={period.periodLabel} />
          <Metric
            label="Incoming"
            value={tonnes(data.totals.receivedTonnes)}
            helper={`${data.incomingRows.length} regulator row${data.incomingRows.length === 1 ? "" : "s"}`}
          />
          <Metric
            label="Outgoing"
            value={tonnes(data.totals.removedTonnes)}
            helper={`${data.outgoingRows.length} regulator row${data.outgoingRows.length === 1 ? "" : "s"}`}
          />
          <Metric
            label="Affected Loads"
            value={String(exceptionGroups.length)}
            helper={`${data.exceptions.length} issue${data.exceptions.length === 1 ? "" : "s"} · valid Loads still export`}
            warning={exceptionGroups.length > 0}
          />
          <Metric
            label="Geography"
            value={String(data.setup.unresolvedGeographyCount)}
            helper="unresolved sites"
            warning={data.setup.unresolvedGeographyCount > 0}
          />
          <Metric
            label="Defaults"
            value="Active"
            helper="Municipal No · Degradable No · No facility · None"
          />
        </section>

        <section className="mt-6 flex flex-wrap items-center gap-2 rounded-[20px] border border-black/10 bg-white p-2 shadow-sm">
          {[
            ["incoming", `Incoming ${data.incomingRows.length}`],
            ["outgoing", `Outgoing ${data.outgoingRows.length}`],
            ["exceptions", `Exceptions ${exceptionGroups.length}`],
            ["setup", "Return setup"],
            ["summary", "EWC summary"],
            ["audit", `Audit detail ${data.detailRows.length}`],
          ].map(([key, label]) => {
            const query = new URLSearchParams(baseQuery);
            query.set("view", key);
            return (
              <Link
                key={key}
                href={`/home/returns?${query.toString()}`}
                className={`rounded-xl px-4 py-2.5 text-xs font-semibold transition ${
                  view === key
                    ? "bg-black text-white"
                    : "text-black/45 hover:bg-black/5 hover:text-black"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </section>

        {view === "incoming" && (
          <ReturnTableShell
            eyebrow="EA return · waste received"
            title="Incoming"
            description="Grouped by the same fields shown on the EA waste-tonnage return: Origin, EWC, disposal/recovery code, municipal source, degradable, state, other activity and pre-treatment."
          >
            {data.incomingRows.length === 0 ? (
              <EmptyRows />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1350px] text-left text-sm">
                  <thead className="bg-[#d7f2c7] text-[10px] uppercase tracking-[0.12em] text-black/60">
                    <tr>
                      <th className="px-4 py-3">Origin</th>
                      <th className="px-4 py-3">EWC Code</th>
                      <th className="px-4 py-3">Disposal / Recovery</th>
                      <th className="px-4 py-3">Municipal Source?</th>
                      <th className="px-4 py-3">Degradable?</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">From Another Activity</th>
                      <th className="px-4 py-3 text-right">Amount in Tonnes</th>
                      <th className="px-4 py-3">Pre-treatment</th>
                      <th className="px-4 py-3 text-right">Loads</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.incomingRows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-4 font-semibold">{row.origin}</td>
                        <td className="max-w-sm px-4 py-4">
                          <p className="font-semibold">{row.ewcCode}</p>
                          <p className="mt-1 text-xs text-black/45">
                            {row.wasteDescription || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4 font-semibold">
                          {row.disposalRecoveryCode}
                        </td>
                        <td className="px-4 py-4">{bool(row.municipalSource)}</td>
                        <td className="px-4 py-4">{bool(row.degradable)}</td>
                        <td className="px-4 py-4">{row.state}</td>
                        <td className="px-4 py-4">{row.fromAnotherActivity}</td>
                        <td className="px-4 py-4 text-right font-semibold">
                          {row.tonnes.toFixed(3)}
                        </td>
                        <td className="px-4 py-4">{row.preTreatment}</td>
                        <td className="px-4 py-4 text-right text-black/45">
                          {row.loadCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReturnTableShell>
        )}

        {view === "outgoing" && (
          <ReturnTableShell
            eyebrow="EA return · waste removed"
            title="Outgoing"
            description="Grouped by Destination local authority, EWC, municipal source, physical state and disposal/recovery code."
          >
            {data.outgoingRows.length === 0 ? (
              <EmptyRows />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1050px] text-left text-sm">
                  <thead className="bg-[#d7f2c7] text-[10px] uppercase tracking-[0.12em] text-black/60">
                    <tr>
                      <th className="px-4 py-3">Destination</th>
                      <th className="px-4 py-3">EWC Code</th>
                      <th className="px-4 py-3">Municipal Source?</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Disposal / Recovery</th>
                      <th className="px-4 py-3 text-right">Amount in Tonnes</th>
                      <th className="px-4 py-3 text-right">Loads</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.outgoingRows.map((row) => (
                      <tr key={row.key}>
                        <td className="px-4 py-4 font-semibold">{row.destination}</td>
                        <td className="max-w-sm px-4 py-4">
                          <p className="font-semibold">{row.ewcCode}</p>
                          <p className="mt-1 text-xs text-black/45">
                            {row.wasteDescription || "—"}
                          </p>
                        </td>
                        <td className="px-4 py-4">{bool(row.municipalSource)}</td>
                        <td className="px-4 py-4">{row.state}</td>
                        <td className="px-4 py-4 font-semibold">
                          {row.disposalRecoveryCode}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold">
                          {row.tonnes.toFixed(3)}
                        </td>
                        <td className="px-4 py-4 text-right text-black/45">
                          {row.loadCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReturnTableShell>
        )}

        {view === "exceptions" && (
          <section className="mt-6 overflow-hidden rounded-[30px] border border-amber-200 bg-white shadow-sm">
            <div className="border-b border-amber-100 bg-amber-50 p-6 text-amber-950">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-700">
                Review only the affected Loads
              </p>
              <h2 className="mt-2 text-2xl font-semibold">Return data exceptions</h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-900/70">
                Exceptions no longer stop the rest of the quarter from exporting.
                Valid Loads continue into Incoming / Outgoing and the workbook.
                Only the affected Loads below are excluded until corrected.
              </p>
            </div>

            {exceptionGroups.length === 0 ? (
              <div className="p-10 text-center text-sm text-emerald-700">
                No excluded Loads for this site and quarter.
              </div>
            ) : (
              <div className="divide-y divide-black/5">
                {exceptionGroups.map((item) => (
                  <details key={item.jobLoadId} className="p-5">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold">
                              {item.jobNumber} · Load {item.loadNumber}
                            </p>
                            <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-amber-800">
                              {item.issues.length} issue{item.issues.length === 1 ? "" : "s"}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-black/45">
                            {item.direction === "received" ? "Incoming" : "Outgoing"}
                            {item.materialName ? ` · ${item.materialName}` : ""}
                          </p>
                        </div>

                        <span className="text-xs font-semibold text-orange-700">
                          Review / fix
                        </span>
                      </div>
                    </summary>

                    <div className="mt-4 grid gap-4 xl:grid-cols-[1.15fr_1fr]">
                      <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-4">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                          Why this Load is excluded
                        </p>
                        <ul className="mt-3 grid gap-2 text-sm text-amber-950/75">
                          {item.issues.map((issue, index) => (
                            <li key={`${item.jobLoadId}-${index}`} className="flex gap-2">
                              <span className="mt-0.5">•</span>
                              <span>{issue}</span>
                            </li>
                          ))}
                        </ul>

                        <Link
                          href={`/home/jobs/${item.jobId}`}
                          className="mt-4 inline-flex h-9 items-center rounded-xl border border-amber-200 bg-white px-3 text-xs font-semibold text-amber-900 hover:bg-amber-100"
                        >
                          Open Job
                        </Link>
                      </div>

                      <div className="grid gap-4">
                        <form
                          action={saveLoadReturnOverrideAction}
                          className="rounded-2xl border border-black/10 bg-[#fbfaf7] p-4"
                        >
                          {hiddenContext(context)}
                          <input type="hidden" name="jobLoadId" value={item.jobLoadId} />

                          <div className="mb-3">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                              Return values for this Load
                            </p>
                            <p className="mt-1 text-xs leading-5 text-black/45">
                              Normal defaults are No / No / No facility / None.
                              Change them here only when this movement is a special case.
                            </p>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <label>
                              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                Municipal source?
                              </span>
                              <select
                                name="municipalSource"
                                defaultValue={item.municipalSource ? "yes" : "no"}
                                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                              >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                              </select>
                            </label>

                            <label>
                              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                Degradable?
                              </span>
                              <select
                                name="degradable"
                                defaultValue={item.degradable ? "yes" : "no"}
                                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                              >
                                <option value="no">No</option>
                                <option value="yes">Yes</option>
                              </select>
                            </label>

                            <label>
                              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                From another activity
                              </span>
                              <input
                                name="fromAnotherActivity"
                                defaultValue={item.fromAnotherActivity || "No facility"}
                                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                              />
                            </label>

                            <label>
                              <span className="mb-1 block text-[9px] font-semibold uppercase tracking-[0.12em] text-black/35">
                                Pre-treatment
                              </span>
                              <input
                                name="preTreatment"
                                defaultValue={item.preTreatment || "None"}
                                className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                              />
                            </label>
                          </div>

                          <button className="mt-3 h-10 w-full rounded-xl bg-black px-3 text-xs font-semibold text-white hover:bg-orange-500 hover:text-black">
                            Save Load override
                          </button>
                        </form>

                        {item.geographySubjectId &&
                          item.issues.some((issue) =>
                            issue.toLowerCase().includes("local authority"),
                          ) && (
                          <div className="rounded-2xl border border-black/10 bg-white p-4">
                            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-orange-600">
                              Geography
                            </p>
                            <p className="mt-1 text-xs text-black/45">
                              {item.geographyName || "Source / destination site"} ·{" "}
                              {item.geographyPostcode || "No postcode"}
                            </p>

                            {item.geographyPostcode && (
                              <form
                                action={resolveSingleReturnGeographyAction}
                                className="mt-3"
                              >
                                {hiddenContext(context)}
                                <input
                                  type="hidden"
                                  name="subjectType"
                                  value={item.geographySubjectType ?? ""}
                                />
                                <input
                                  type="hidden"
                                  name="subjectId"
                                  value={item.geographySubjectId}
                                />
                                <input
                                  type="hidden"
                                  name="postcode"
                                  value={item.geographyPostcode}
                                />
                                <button className="h-10 w-full rounded-xl bg-orange-500 px-3 text-xs font-semibold text-black hover:bg-orange-400">
                                  Try postcode lookup
                                </button>
                              </form>
                            )}

                            <details className="mt-3 rounded-xl bg-[#fbfaf7] p-3">
                              <summary className="cursor-pointer text-xs font-semibold text-black/60">
                                Manual geography override
                              </summary>

                              <form
                                action={saveReturnAreaOverrideAction}
                                className="mt-3 grid gap-2"
                              >
                                {hiddenContext(context)}
                                <input
                                  type="hidden"
                                  name="subjectType"
                                  value={item.geographySubjectType ?? ""}
                                />
                                <input
                                  type="hidden"
                                  name="subjectId"
                                  value={item.geographySubjectId}
                                />
                                <input
                                  type="hidden"
                                  name="postcode"
                                  value={item.geographyPostcode}
                                />

                                <input
                                  name="localAuthorityName"
                                  defaultValue={item.geographyLocalAuthorityName}
                                  required
                                  placeholder="Local authority"
                                  className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs"
                                />
                                <input
                                  name="localAuthorityCode"
                                  defaultValue={item.geographyLocalAuthorityCode}
                                  placeholder="ONS / GSS code (optional)"
                                  className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs"
                                />
                                <input
                                  name="returnAreaLabel"
                                  defaultValue={
                                    item.geographyReturnAreaLabel ||
                                    item.geographyLocalAuthorityName
                                  }
                                  required
                                  placeholder="EA return label"
                                  className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs"
                                />

                                <button className="h-10 rounded-xl border border-black/10 bg-white px-3 text-xs font-semibold text-black hover:bg-black hover:text-white">
                                  Save geography override
                                </button>
                              </form>
                            </details>
                          </div>
                        )}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            )}
          </section>
        )}

        {view === "summary" && (
          <ReturnTableShell
            eyebrow="Existing operational summary"
            title="Waste received / removed by EWC"
            description="Kept because it is useful for reconciliation. It is no longer the only aggregation used to prepare the regulator return."
          >
            {data.aggregateRows.length === 0 ? (
              <EmptyRows />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[850px] text-left text-sm">
                  <thead className="bg-black text-white">
                    <tr className="text-[10px] uppercase tracking-[0.14em] text-white/55">
                      <th className="px-5 py-3">EWC</th>
                      <th className="px-5 py-3">Description</th>
                      <th className="px-5 py-3">Received loads</th>
                      <th className="px-5 py-3">Received tonnes</th>
                      <th className="px-5 py-3">Removed loads</th>
                      <th className="px-5 py-3">Removed tonnes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.aggregateRows.map((row) => (
                      <tr key={row.ewcCode}>
                        <td className="px-5 py-4 font-semibold">{row.ewcCode}</td>
                        <td className="max-w-lg px-5 py-4 text-black/55">
                          {row.wasteDescription || "—"}
                        </td>
                        <td className="px-5 py-4">{row.receivedLoads}</td>
                        <td className="px-5 py-4 font-semibold">
                          {tonnes(row.receivedTonnes)}
                        </td>
                        <td className="px-5 py-4">{row.removedLoads}</td>
                        <td className="px-5 py-4 font-semibold">
                          {tonnes(row.removedTonnes)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReturnTableShell>
        )}

        {view === "audit" && (
          <ReturnTableShell
            eyebrow="Existing audit detail"
            title={`Prepared movement detail (${data.detailRows.length})`}
            description="The underlying factual Loads behind the grouped regulator rows remain visible for reconciliation and traceability."
          >
            {data.detailRows.length === 0 ? (
              <EmptyRows />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1450px] text-left text-sm">
                  <thead className="bg-[#f3eee7] text-[10px] uppercase tracking-[0.14em] text-black/40">
                    <tr>
                      <th className="px-4 py-3">Direction</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">Job / load</th>
                      <th className="px-4 py-3">Ticket</th>
                      <th className="px-4 py-3">Origin</th>
                      <th className="px-4 py-3">Destination</th>
                      <th className="px-4 py-3">EWC</th>
                      <th className="px-4 py-3">D/R</th>
                      <th className="px-4 py-3">Municipal</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3">Tonnes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/5">
                    {data.detailRows.map((row) => (
                      <tr key={row.jobLoadId}>
                        <td className="px-4 py-3 capitalize">{row.direction}</td>
                        <td className="px-4 py-3 text-black/55">{dateTime(row.eventAt)}</td>
                        <td className="px-4 py-3 font-medium">
                          {row.jobNumber} / {row.loadNumber}
                        </td>
                        <td className="px-4 py-3 text-black/55">{row.ticketNumber || "—"}</td>
                        <td className="px-4 py-3 text-black/55">{row.origin || "—"}</td>
                        <td className="px-4 py-3 text-black/55">{row.destination || "—"}</td>
                        <td className="px-4 py-3 font-semibold">{row.ewcCode}</td>
                        <td className="px-4 py-3 font-semibold">{row.disposalRecoveryCode}</td>
                        <td className="px-4 py-3">{bool(row.municipalSource)}</td>
                        <td className="px-4 py-3">{row.state}</td>
                        <td className="px-4 py-3 font-semibold">{row.tonnes.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </ReturnTableShell>
        )}

        {view === "setup" && (
          <div className="mt-6 grid gap-6">
            <section className="grid gap-5 xl:grid-cols-2">
              <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Organisation defaults
                </p>
                <h2 className="mt-2 text-xl font-semibold">Return defaults</h2>
                <p className="mt-2 text-sm leading-6 text-black/45">
                  Waste X starts with low-friction common defaults. Individual
                  Jobs or Loads can override them whenever the real movement differs.
                </p>

                <form action={saveReturnSettingsAction} className="mt-5 grid gap-4">
                  {hiddenContext(context)}
                  <label>
                    <span className="mb-2 block text-xs font-semibold text-black/50">
                      Municipal Source? default
                    </span>
                    <select
                      name="municipalSourceDefault"
                      defaultValue={
                        data.settings.municipalSourceDefault === null
                          ? ""
                          : data.settings.municipalSourceDefault
                            ? "yes"
                            : "no"
                      }
                      className="h-11 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm"
                    >
                      <option value="no">No</option>
                      <option value="yes">Yes</option>
                    </select>
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold text-black/50">
                      From Another Activity default
                    </span>
                    <input
                      name="fromAnotherActivityDefault"
                      defaultValue={data.settings.fromAnotherActivityDefault}
                      placeholder="e.g. No facility"
                      className="h-11 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm"
                    />
                  </label>

                  <label>
                    <span className="mb-2 block text-xs font-semibold text-black/50">
                      Pre-treatment default
                    </span>
                    <input
                      name="preTreatmentDefault"
                      defaultValue={data.settings.preTreatmentDefault}
                      placeholder="e.g. None"
                      className="h-11 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-sm"
                    />
                  </label>

                  <button className="h-11 rounded-xl bg-black px-4 text-sm font-semibold text-white hover:bg-orange-500 hover:text-black">
                    Save defaults
                  </button>
                </form>
              </div>

              <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Automatic geography
                </p>
                <h2 className="mt-2 text-xl font-semibold">Resolve local authorities</h2>
                <p className="mt-2 text-sm leading-6 text-black/45">
                  Waste X looks up the administrative district / local authority
                  from every own-site and counterparty-site postcode, then stores
                  the result locally for return preparation.
                </p>

                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <Info label="Sites in this return" value={String(data.setup.geographies.length)} />
                  <Info
                    label="Still unresolved"
                    value={String(data.setup.unresolvedGeographyCount)}
                    warning={data.setup.unresolvedGeographyCount > 0}
                  />
                </div>

                <form action={resolveReturnGeographiesAction} className="mt-5">
                  {hiddenContext(context)}
                  <button className="h-11 w-full rounded-xl bg-orange-500 px-4 text-sm font-semibold text-black hover:bg-orange-400">
                    Resolve all site postcodes
                  </button>
                </form>

                <form action={backfillQuarterReturnSnapshotsAction} className="mt-3">
                  {hiddenContext(context)}
                  <button className="h-11 w-full rounded-xl border border-black/10 bg-white px-4 text-sm font-semibold text-black hover:bg-black hover:text-white">
                    Backfill missing Load snapshots for {period.label}
                  </button>
                </form>
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
              <div className="border-b border-black/10 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Geography review
                </p>
                <h2 className="mt-2 text-xl font-semibold">Source / destination areas</h2>
                <p className="mt-2 text-sm text-black/45">
                  Automatic lookup is the default. Use the override only when the
                  regulator pick-list or a boundary edge case needs a manual label.
                </p>
              </div>

              <div className="divide-y divide-black/5">
                {data.setup.geographies.map((row) => (
                  <details key={`${row.subjectType}-${row.subjectId}`} className="p-5">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{row.name}</p>
                          <p className="mt-1 text-xs text-black/45">
                            {row.postcode || "No postcode"} · {row.returnAreaLabel || "Unresolved"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                            row.resolved
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {row.resolved ? row.source || "Resolved" : "Needs attention"}
                        </span>
                      </div>
                    </summary>

                    <form
                      action={saveReturnAreaOverrideAction}
                      className="mt-4 grid gap-3 rounded-2xl bg-[#fbfaf7] p-4 md:grid-cols-4"
                    >
                      {hiddenContext(context)}
                      <input type="hidden" name="subjectType" value={row.subjectType} />
                      <input type="hidden" name="subjectId" value={row.subjectId} />
                      <input type="hidden" name="postcode" value={row.postcode} />
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          Local authority
                        </span>
                        <input
                          name="localAuthorityName"
                          defaultValue={row.localAuthorityName}
                          required
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          ONS / GSS code
                        </span>
                        <input
                          name="localAuthorityCode"
                          defaultValue={row.localAuthorityCode}
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          EA return label
                        </span>
                        <input
                          name="returnAreaLabel"
                          defaultValue={row.returnAreaLabel}
                          required
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        />
                      </label>
                      <button className="mt-5 h-10 rounded-xl bg-black px-3 text-xs font-semibold text-white">
                        Save override
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
              <div className="border-b border-black/10 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Material classification
                </p>
                <h2 className="mt-2 text-xl font-semibold">Degradable?</h2>
                <p className="mt-2 text-sm text-black/45">
                  This belongs to the Material Profile, so you classify it once and
                  every future Load can reuse it.
                </p>
              </div>

              <div className="divide-y divide-black/5">
                {data.setup.materials.map((material) => (
                  <form
                    key={material.id}
                    action={saveMaterialReturnProfileAction}
                    className="flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between"
                  >
                    {hiddenContext(context)}
                    <input type="hidden" name="materialProfileId" value={material.id} />
                    <div>
                      <p className="text-sm font-semibold">{material.name}</p>
                      <p className="mt-1 text-xs text-black/40">
                        {material.isDegradable ? "Degradable override" : "Default · Not degradable"}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      <select
                        name="isDegradable"
                        defaultValue={material.isDegradable ? "yes" : "no"}
                        className="h-10 rounded-xl border border-black/10 bg-[#fbfaf7] px-3 text-xs"
                      >
                        <option value="no">No</option>
                        <option value="yes">Yes</option>
                      </select>
                      <button className="h-10 rounded-xl bg-black px-4 text-xs font-semibold text-white">
                        Save
                      </button>
                    </div>
                  </form>
                ))}
              </div>
            </section>

            <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
              <div className="border-b border-black/10 p-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Job overrides
                </p>
                <h2 className="mt-2 text-xl font-semibold">Regulatory defaults by Job</h2>
                <p className="mt-2 text-sm text-black/45">
                  Only change a Job when it differs from the organisation defaults.
                  All Loads remain part of the same Job and inherit the Job values.
                </p>
              </div>

              <div className="divide-y divide-black/5">
                {data.setup.jobs.map((job) => (
                  <details key={job.id} className="p-5">
                    <summary className="cursor-pointer list-none">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold">{job.jobNumber}</p>
                          <p className="mt-1 text-xs text-black/45">
                            {job.clientName || "No client"} · Municipal: {bool(job.municipalSource)} · {job.hasOverride ? "Job override" : "Organisation default"}
                          </p>
                        </div>
                        <span className="text-xs font-semibold text-orange-700">Edit</span>
                      </div>
                    </summary>

                    <form
                      action={saveJobReturnProfileAction}
                      className="mt-4 grid gap-3 rounded-2xl bg-[#fbfaf7] p-4 md:grid-cols-4"
                    >
                      {hiddenContext(context)}
                      <input type="hidden" name="jobId" value={job.id} />
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          Municipal Source?
                        </span>
                        <select
                          name="municipalSource"
                          defaultValue={job.municipalSource ? "yes" : "no"}
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        >
                          <option value="no">No</option>
                          <option value="yes">Yes</option>
                        </select>
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          From Another Activity
                        </span>
                        <input
                          name="fromAnotherActivity"
                          defaultValue={job.fromAnotherActivity}
                          placeholder="e.g. No facility"
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        />
                      </label>
                      <label>
                        <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.12em] text-black/35">
                          Pre-treatment
                        </span>
                        <input
                          name="preTreatment"
                          defaultValue={job.preTreatment}
                          placeholder="e.g. None"
                          className="h-10 w-full rounded-xl border border-black/10 bg-white px-3 text-xs"
                        />
                      </label>
                      <button className="mt-5 h-10 rounded-xl bg-black px-3 text-xs font-semibold text-white">
                        Save Job override
                      </button>
                    </form>
                  </details>
                ))}
              </div>
            </section>
          </div>
        )}

        <section className="mt-8 grid gap-5 lg:grid-cols-2">
          <div className="rounded-[28px] border border-black/10 bg-white p-6 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
              Return context
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {data.selectedSite?.name ?? "Receiving site not configured"}
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <Info
                label="Permit / authorisation"
                value={data.selectedSite?.primaryPermitNumber ?? "Missing"}
              />
              <Info label="Regulator" value={data.selectedSite?.regulator ?? "Unknown"} />
              <Info label="Postcode" value={data.selectedSite?.postcode || "Not recorded"} />
              <Info label="EA form" value={`Version ${data.settings.formVersion}`} />
            </div>
          </div>

          <div
            className={`rounded-[28px] border p-6 ${
              exceptionGroups.length > 0
                ? "border-amber-200 bg-amber-50 text-amber-950"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] opacity-65">
              Preparation status
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              {exceptionGroups.length === 0
                ? "Return data ready"
                : hasPartialReturn
                  ? `Partial return ready · ${exceptionGroups.length} affected Load${exceptionGroups.length === 1 ? "" : "s"} excluded`
                  : `${exceptionGroups.length} affected Load${exceptionGroups.length === 1 ? "" : "s"} need review before they can be included`}
            </h2>
            <p className="mt-2 text-sm leading-6 opacity-70">
              Exceptions do not block valid Loads. The download always includes the
              current valid Incoming and Outgoing rows plus an Exceptions sheet
              showing anything left out.
            </p>
            {eaWindow && (
              <p className="mt-4 rounded-2xl border border-current/15 bg-white/45 p-4 text-sm font-medium">
                Environment Agency submission window: {eaWindow.label}.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8 rounded-[30px] border border-orange-200 bg-orange-50 p-6 text-orange-900">
          <p className="text-sm font-semibold">EA-ready preparation — not a cloned official submission form</p>
          <p className="mt-2 max-w-5xl text-sm leading-6 text-orange-900/70">
            One Waste X workbook contains both Incoming and Outgoing sheets,
            Movement Detail and Exceptions. If some Loads have exceptions, the valid
            Loads still export and only the affected Loads are excluded. Continue to
            use the current official Environment Agency Version 17.0 workbook for the
            actual submission until Waste X has a version-aware official-template
            population flow.
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
  warning = false,
}: {
  label: string;
  value: string;
  helper: string;
  warning?: boolean;
}) {
  return (
    <div
      className={`rounded-[24px] border bg-white p-5 shadow-sm ${
        warning ? "border-red-200" : "border-black/10"
      }`}
    >
      <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-black/35">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${warning ? "text-red-700" : ""}`}>
        {value}
      </p>
      <p className="mt-1 text-xs text-black/40">{helper}</p>
    </div>
  );
}

function Info({ label, value, warning = false }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="rounded-2xl bg-[#fbfaf7] p-4">
      <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-black/35">
        {label}
      </p>
      <p className={`mt-2 text-sm font-semibold ${warning ? "text-red-700" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function ReturnTableShell({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-6 overflow-hidden rounded-[30px] border border-black/10 bg-white shadow-sm">
      <div className="border-b border-black/10 p-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-black/45">{description}</p>
      </div>
      {children}
    </section>
  );
}

function EmptyRows() {
  return (
    <div className="p-10 text-center text-sm text-black/45">
      No valid prepared return rows were found for this site and quarter.
    </div>
  );
}
