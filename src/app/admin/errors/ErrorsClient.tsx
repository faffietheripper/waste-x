"use client";

import { useState, useTransition } from "react";
import { resolveErrorAction } from "./actions";

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

export default function ErrorsClient({
  initialErrors = [],
}: {
  initialErrors: ErrorLog[];
}) {
  const [selected, setSelected] = useState<ErrorLog | null>(null);
  const [isPending, startTransition] = useTransition();

  // 🔗 Read current URL params (client-safe)
  const params =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();

  const currentSeverity = params.get("severity") || "";
  const currentCode = params.get("code") || "";

  // 📊 Stats
  const stats = {
    total: initialErrors.length,
    critical: initialErrors.filter((e) => e.severity === "critical").length,
    high: initialErrors.filter((e) => e.severity === "high").length,
    unresolved: initialErrors.filter((e) => !e.resolved).length,
  };

  return (
    <div className="flex h-full">
      {/* LEFT PANEL */}
      <div className="w-1/2 border-r flex flex-col">
        {/* HEADER */}
        <div className="p-4 border-b">
          <h1 className="text-xl font-bold">System Errors</h1>
        </div>

        {/* FILTERS */}
        <div className="p-4 border-b space-y-2">
          {/* CODE SEARCH */}
          <input
            placeholder="Search by code..."
            defaultValue={currentCode}
            className="w-full border px-3 py-2 rounded text-sm"
            onChange={(e) => {
              const value = e.target.value;
              const url = new URL(window.location.href);

              if (value) url.searchParams.set("code", value);
              else url.searchParams.delete("code");

              window.location.href = url.toString();
            }}
          />

          {/* SEVERITY FILTER */}
          <select
            value={currentSeverity} // ✅ FIXED
            className="w-full border px-3 py-2 rounded text-sm"
            onChange={(e) => {
              const value = e.target.value;
              const url = new URL(window.location.href);

              if (value) url.searchParams.set("severity", value);
              else url.searchParams.delete("severity");

              window.location.href = url.toString();
            }}
          >
            <option value="">All Severities</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
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
            <div className="p-6 text-center text-gray-500">
              <p className="text-sm">No errors logged 🎉</p>
              <p className="text-xs mt-1">System is operating normally</p>
            </div>
          ) : (
            initialErrors.map((err) => (
              <div
                key={err.id}
                onClick={() => setSelected(err)}
                className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
                  selected?.id === err.id ? "bg-gray-100" : ""
                }`}
              >
                <div className="flex justify-between">
                  <span className="font-semibold">{err.code}</span>
                  <span className="text-xs text-gray-400">
                    {err.createdAt
                      ? new Date(err.createdAt).toLocaleString()
                      : "N/A"}
                  </span>
                </div>

                <div className="text-sm text-gray-600 truncate">
                  {err.message}
                </div>

                <div className="text-xs mt-1 flex gap-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium
                      ${
                        err.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : err.severity === "high"
                            ? "bg-orange-100 text-orange-700"
                            : err.severity === "medium"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-gray-100 text-gray-700"
                      }`}
                  >
                    {err.severity}
                  </span>

                  {!err.resolved && (
                    <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs">
                      active
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="w-1/2 p-6 overflow-y-auto">
        {initialErrors.length === 0 ? (
          <div className="text-center text-gray-500 mt-20">
            <p className="text-sm">No issues to inspect</p>
            <p className="text-xs mt-1">
              Errors will appear here when they occur
            </p>
          </div>
        ) : !selected ? (
          <p className="text-gray-500">Select an error to inspect</p>
        ) : (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{selected.code}</h2>

            <div>
              <strong>Message:</strong>
              <p>{selected.message}</p>
            </div>

            <div>
              <strong>Severity:</strong> {selected.severity}
            </div>

            <div>
              <strong>Time:</strong>{" "}
              {selected.createdAt
                ? new Date(selected.createdAt).toLocaleString()
                : "N/A"}
            </div>

            <div>
              <strong>Route:</strong> {selected.route || "N/A"}
            </div>

            <div>
              <strong>User ID:</strong> {selected.userId || "N/A"}
            </div>

            <div>
              <strong>Organisation:</strong> {selected.organisationId || "N/A"}
            </div>

            <div>
              <strong>Metadata:</strong>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto">
                {(() => {
                  try {
                    return selected.metadata
                      ? JSON.stringify(JSON.parse(selected.metadata), null, 2)
                      : "No metadata";
                  } catch {
                    return selected.metadata;
                  }
                })()}
              </pre>
            </div>

            {!selected.resolved && (
              <button
                disabled={isPending}
                onClick={() => {
                  startTransition(async () => {
                    await resolveErrorAction(selected.id);
                    window.location.reload();
                  });
                }}
                className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
              >
                {isPending ? "Resolving..." : "Mark as Resolved"}
              </button>
            )}

            {selected.resolved && (
              <div className="text-green-600 font-medium">✅ Resolved</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
