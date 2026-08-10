"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import {
  createReportExportAction,
  type CreateReportExportActionResult,
} from "../actions/createReportExportAction";
import { REPORT_FORMATS, REPORT_TYPES } from "../core/reportTypes";

type ReportGeneratorFormProps = {
  allowedReportTypes?: string[];
};

export default function ReportGeneratorForm({
  allowedReportTypes,
}: ReportGeneratorFormProps) {
  const router = useRouter();

  const [isPending, startTransition] = useTransition();
  const [result, setResult] =
    useState<CreateReportExportActionResult | null>(null);

  const visibleReportTypes = useMemo(() => {
    if (!allowedReportTypes?.length) {
      return REPORT_TYPES;
    }

    return REPORT_TYPES.filter((report) =>
      allowedReportTypes.includes(report.value),
    );
  }, [allowedReportTypes]);

  return (
    <form
      className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
      onSubmit={(event) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);

        startTransition(async () => {
          const response = await createReportExportAction(formData);

          setResult(response);
          router.refresh();

          if (response.ok && response.downloadUrl) {
            window.location.assign(response.downloadUrl);
          }
        });
      }}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-600">
          Reports Centre
        </p>

        <h2 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
          Generate a report
        </h2>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
          Export operational and compliance data for your own records, audits or
          internal review.
        </p>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <label className="block">
          <span className="text-sm font-semibold text-slate-800">
            Report type
          </span>

          <select
            name="reportType"
            required
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          >
            {visibleReportTypes.map((report) => (
              <option key={report.value} value={report.value}>
                {report.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Format</span>

          <select
            name="format"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          >
            {REPORT_FORMATS.map((format) => (
              <option key={format.value} value={format.value}>
                {format.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">
            Date from
          </span>

          <input
            name="dateFrom"
            type="date"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-slate-800">Date to</span>

          <input
            name="dateTo"
            type="date"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          />
        </label>

        <label className="block lg:col-span-2">
          <span className="text-sm font-semibold text-slate-800">
            Optional status filter
          </span>

          <select
            name="status"
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-orange-400 focus:ring-4 focus:ring-orange-100"
          >
            <option value="all">All statuses</option>
            <option value="open">Open</option>
            <option value="pending">Pending</option>
            <option value="accepted">Accepted</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
            <option value="resolved">Resolved</option>
            <option value="submitted">Submitted</option>
            <option value="accepted_with_warnings">
              Accepted with warnings
            </option>
            <option value="failed">Failed</option>
          </select>
        </label>
      </div>

      {result && (
        <div
          className={`mt-5 rounded-2xl border px-4 py-3 text-sm ${
            result.ok
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {result.message}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-slate-500">
          Every generated report is logged for audit purposes.
        </p>

        <button
          type="submit"
          disabled={isPending}
          className="inline-flex justify-center rounded-2xl bg-black px-6 py-3 text-sm font-bold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? "Generating..." : "Generate report"}
        </button>
      </div>
    </form>
  );
}