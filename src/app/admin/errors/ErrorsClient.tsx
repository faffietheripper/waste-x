"use client";

import { useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { resolveErrorAction } from "./actions";

/* ===============================
   TYPES
============================== */

type ErrorLog = {
  id: string;
  code: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  createdAt: string | null;
  route?: string | null;
  userId?: string | null;
  organisationId?: string | null;
  metadata?: string | null;
  resolved?: boolean | null;
};

type GroupedError = {
  code: string;
  message: string;
  severity: "low" | "medium" | "high" | "critical";
  count: number;
  latest: string | null;
};

/* ===============================
   DATE FORMAT (SAFE)
============================== */

function formatDate(dateString: string | null) {
  if (!dateString) return "N/A";

  return new Date(dateString).toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/* ===============================
   TREND SIGNAL
============================== */

function getTrendStyle(count: number) {
  if (count > 20) return "bg-red-100 text-red-700";
  if (count > 5) return "bg-orange-100 text-orange-700";
  return "bg-green-100 text-green-700";
}

/* ===============================
   COMPONENT
============================== */

export default function ErrorsClient({
  initialErrors = [],
}: {
  initialErrors: ErrorLog[];
}) {
  const [selected, setSelected] = useState<ErrorLog | null>(null);
  const [view, setView] = useState<"raw" | "grouped">("raw");
  const [isPending, startTransition] = useTransition();

  const searchParams = useSearchParams();
  const router = useRouter();

  const currentSeverity = searchParams.get("severity") || "";
  const currentCode = searchParams.get("code") || "";
  const currentStatus = searchParams.get("status") || "active";

  /* ===============================
     URL UPDATE
  ============================== */

  function updateParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());

    if (value) params.set(key, value);
    else params.delete(key);

    router.replace(`?${params.toString()}`);
  }

  /* ===============================
     GROUPING LOGIC (CLIENT SIDE)
  ============================== */

  const grouped: GroupedError[] = Object.values(
    initialErrors.reduce((acc: any, err) => {
      const key = `${err.code}-${err.severity}`;

      if (!acc[key]) {
        acc[key] = {
          code: err.code,
          message: err.message,
          severity: err.severity,
          count: 0,
          latest: err.createdAt,
        };
      }

      acc[key].count += 1;

      if (
        err.createdAt &&
        (!acc[key].latest || err.createdAt > acc[key].latest)
      ) {
        acc[key].latest = err.createdAt;
      }

      return acc;
    }, {}),
  );

  /* ===============================
     STATS
  ============================== */

  const stats = {
    total: initialErrors.length,
    critical: initialErrors.filter((e) => e.severity === "critical").length,
    high: initialErrors.filter((e) => e.severity === "high").length,
    unresolved: initialErrors.filter((e) => !e.resolved).length,
  };

  /* ===============================
     UI
  ============================== */

  return (
    <div className="flex h-full">
      {/* LEFT PANEL */}
      <div className="w-1/2 border-r flex flex-col">
        {/* HEADER */}
        <div className="p-4 border-b flex justify-between items-center">
          <h1 className="text-xl font-bold">System Errors</h1>

          {/* 🔥 TOGGLE */}
          <div className="flex gap-2 text-xs">
            <button
              onClick={() => setView("raw")}
              className={`px-2 py-1 rounded ${
                view === "raw" ? "bg-black text-white" : "bg-gray-100"
              }`}
            >
              Raw
            </button>
            <button
              onClick={() => setView("grouped")}
              className={`px-2 py-1 rounded ${
                view === "grouped" ? "bg-black text-white" : "bg-gray-100"
              }`}
            >
              Grouped
            </button>
          </div>
        </div>

        {/* FILTERS */}
        <div className="p-4 border-b space-y-2">
          <input
            placeholder="Search by code..."
            defaultValue={currentCode}
            className="w-full border px-3 py-2 rounded text-sm"
            onChange={(e) => updateParam("code", e.target.value || null)}
          />

          <select
            value={currentSeverity}
            className="w-full border px-3 py-2 rounded text-sm"
            onChange={(e) => updateParam("severity", e.target.value || null)}
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>

          <select
            value={currentStatus}
            className="w-full border px-3 py-2 rounded text-sm"
            onChange={(e) => updateParam("status", e.target.value)}
          >
            <option value="active">Active Only</option>
            <option value="resolved">Resolved Only</option>
            <option value="all">All Errors</option>
          </select>
        </div>

        {/* STATS */}
        <div className="p-4 grid grid-cols-2 gap-2 text-sm border-b">
          <div className="bg-gray-100 p-2 rounded">Total: {stats.total}</div>
          <div className="bg-red-100 p-2 rounded text-red-700">
            Critical: {stats.critical}
          </div>
          <div className="bg-orange-100 p-2 rounded text-orange-700">
            High: {stats.high}
          </div>
          <div className="bg-green-100 p-2 rounded text-green-700">
            Active: {stats.unresolved}
          </div>
        </div>

        {/* LIST */}
        <div className="overflow-y-auto flex-1">
          {initialErrors.length === 0 ? (
            <div className="p-6 text-center text-gray-500">No errors found</div>
          ) : view === "raw" ? (
            initialErrors.map((err) => (
              <div
                key={err.id}
                onClick={() => setSelected(err)}
                className="p-4 border-b cursor-pointer hover:bg-gray-50"
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{err.code}</span>
                  <span className="text-xs text-gray-400">
                    {formatDate(err.createdAt)}
                  </span>
                </div>

                <div className="text-sm text-gray-600 truncate">
                  {err.message}
                </div>

                <div className="text-xs mt-1 flex gap-2">
                  <span>{err.severity}</span>
                  {!err.resolved && (
                    <span className="text-blue-600">active</span>
                  )}
                  {err.resolved && (
                    <span className="text-green-600">resolved</span>
                  )}
                </div>
              </div>
            ))
          ) : (
            grouped.map((err) => (
              <div key={err.code} className="p-4 border-b hover:bg-gray-50">
                <div className="flex justify-between">
                  <span className="font-semibold">{err.code}</span>
                  <span className="text-xs text-gray-400">
                    {formatDate(err.latest)}
                  </span>
                </div>

                <div className="text-sm text-gray-600">{err.message}</div>

                <div className="mt-1 flex gap-2 items-center text-xs">
                  <span>{err.severity}</span>

                  <span
                    className={`px-2 py-1 rounded ${getTrendStyle(err.count)}`}
                  >
                    {err.count} occurrences
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-1/2 p-6 overflow-y-auto">
        {!selected ? (
          <p className="text-gray-500">Select an error to inspect</p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{selected.code}</h2>

            <p>{selected.message}</p>

            <div>Severity: {selected.severity}</div>
            <div>Time: {formatDate(selected.createdAt)}</div>
            <div>Route: {selected.route || "N/A"}</div>

            {!selected.resolved && (
              <button
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await resolveErrorAction(selected.id);
                    router.refresh();
                  })
                }
                className="bg-green-600 text-white px-4 py-2 rounded"
              >
                Resolve
              </button>
            )}

            {selected.resolved && (
              <div className="text-green-600">✅ Resolved</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
