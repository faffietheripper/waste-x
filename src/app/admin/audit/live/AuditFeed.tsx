"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AuditEventRow } from "./AuditEventRow";

const ACTIONS = [
  "LISTING_CREATED",
  "BID_PLACED",
  "ASSIGNED",
  "COLLECTED",
  "COMPLETED",
  "INCIDENT_REPORTED",
];

export function AuditFeed({
  events,
  page,
  selectedActions,
}: {
  events: any[];
  page: number;
  selectedActions: string[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // 🔁 AUTO REFRESH (every 5s)
  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [router]);

  // 🎯 FILTER TOGGLE
  function toggleAction(action: string) {
    const current = new Set(selectedActions);

    if (current.has(action)) {
      current.delete(action);
    } else {
      current.add(action);
    }

    const params = new URLSearchParams(searchParams.toString());

    if (current.size > 0) {
      params.set("action", Array.from(current).join(","));
    } else {
      params.delete("action");
    }

    params.set("page", "1"); // reset page

    router.push(`?${params.toString()}`);
  }

  // 📄 PAGINATION
  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">Live Activity</h1>
        <p className="text-sm text-gray-500">
          Real-time system activity across the platform
        </p>
      </div>

      {/* FILTERS */}
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((action) => {
          const active = selectedActions.includes(action);

          return (
            <button
              key={action}
              onClick={() => toggleAction(action)}
              className={`text-xs px-3 py-1 rounded-full border transition ${
                active
                  ? "bg-black text-white border-black"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-100"
              }`}
            >
              {action.replaceAll("_", " ")}
            </button>
          );
        })}
      </div>

      {/* FEED */}
      <div className="bg-white rounded-lg border divide-y">
        {events.length === 0 && (
          <div className="p-6 text-sm text-gray-500">No activity found.</div>
        )}

        {events.map((event) => (
          <AuditEventRow key={event.id} event={event} />
        ))}
      </div>

      {/* PAGINATION */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="px-4 py-2 text-sm border rounded disabled:opacity-50"
        >
          Previous
        </button>

        <span className="text-sm text-gray-500">Page {page}</span>

        <button
          onClick={() => goToPage(page + 1)}
          disabled={events.length < 20}
          className="px-4 py-2 text-sm border rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}
