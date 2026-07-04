"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type AuditFeedEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string | null;

  userName: string | null;
  userEmail: string | null;

  organisationName: string | null;
  organisationId: string | null;
};

type ActionFilter = {
  label: string;
  value: string;
  group: "Core" | "Operations" | "Compliance" | "DWT" | "System";
};

const ACTIONS: ActionFilter[] = [
  {
    label: "Listing created",
    value: "LISTING_CREATED",
    group: "Operations",
  },
  {
    label: "Bid placed",
    value: "BID_PLACED",
    group: "Operations",
  },
  {
    label: "Assigned",
    value: "ASSIGNED",
    group: "Operations",
  },
  {
    label: "Transfer assigned",
    value: "TRANSFER_ASSIGNED",
    group: "Operations",
  },
  {
    label: "Collected",
    value: "COLLECTED",
    group: "Operations",
  },
  {
    label: "Completed",
    value: "COMPLETED",
    group: "Operations",
  },
  {
    label: "Incident reported",
    value: "INCIDENT_REPORTED",
    group: "Compliance",
  },
  {
    label: "DWT submitted",
    value: "DWT_SUBMITTED",
    group: "DWT",
  },
  {
    label: "DWT accepted",
    value: "DWT_ACCEPTED",
    group: "DWT",
  },
  {
    label: "DWT rejected",
    value: "DWT_REJECTED",
    group: "DWT",
  },
  {
    label: "Organisation approved",
    value: "ORGANISATION_APPROVED",
    group: "Core",
  },
  {
    label: "User invited",
    value: "USER_INVITED",
    group: "Core",
  },
  {
    label: "System error",
    value: "SYSTEM_ERROR",
    group: "System",
  },
];

export function AuditFeed({
  events,
  page,
  limit,
  selectedActions,
  lastUpdatedAt,
}: {
  events: AuditFeedEvent[];
  page: number;
  limit: number;
  selectedActions: string[];
  lastUpdatedAt: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoRefresh, setAutoRefresh] = useState(true);

  const groupedActions = useMemo(() => {
    return ACTIONS.reduce<Record<string, ActionFilter[]>>((groups, action) => {
      if (!groups[action.group]) {
        groups[action.group] = [];
      }

      groups[action.group].push(action);

      return groups;
    }, {});
  }, []);

  const selectedActionSet = useMemo(
    () => new Set(selectedActions),
    [selectedActions],
  );

  const hasFilters = selectedActions.length > 0;

  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      router.refresh();
    }, 5000);

    return () => clearInterval(interval);
  }, [autoRefresh, router]);

  function updateParams(nextActions: string[], nextPage = 1) {
    const params = new URLSearchParams(searchParams.toString());

    if (nextActions.length > 0) {
      params.set("action", nextActions.join(","));
    } else {
      params.delete("action");
    }

    params.set("page", String(nextPage));

    router.push(`?${params.toString()}`);
  }

  function toggleAction(action: string) {
    const current = new Set(selectedActions);

    if (current.has(action)) {
      current.delete(action);
    } else {
      current.add(action);
    }

    updateParams(Array.from(current), 1);
  }

  function clearFilters() {
    updateParams([], 1);
  }

  function goToPage(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));

    router.push(`?${params.toString()}`);
  }

  const lastUpdatedLabel = formatDateTime(lastUpdatedAt);

  return (
    <div className="space-y-8">
      {/* ================= HEADER ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-7 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-400">
              Audit Intelligence
            </p>

            <h1 className="mt-3 text-3xl font-bold tracking-tight text-gray-950">
              Live Activity
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Real-time platform activity across users, organisations, waste
              listings, assignments, incidents and Digital Waste Tracking.
            </p>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-center">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
                Auto refresh
              </p>

              <p className="mt-1 text-sm font-medium text-gray-700">
                Last updated {lastUpdatedLabel}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setAutoRefresh((current) => !current)}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                autoRefresh
                  ? "bg-gray-950 text-white hover:bg-gray-800"
                  : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              {autoRefresh ? "Live on" : "Live paused"}
            </button>
          </div>
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-3">
        <SummaryCard
          label="Events on page"
          value={events.length}
          helper={`Showing up to ${limit} records`}
        />

        <SummaryCard
          label="Active filters"
          value={selectedActions.length}
          helper={hasFilters ? "Filtered activity" : "All activity"}
        />

        <SummaryCard
          label="Current page"
          value={page}
          helper={events.length < limit ? "End of current results" : "More may exist"}
        />
      </section>

      {/* ================= FILTERS ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Filters
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Activity filters
            </h2>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Filter the live audit feed by operational, compliance, DWT and
              system events.
            </p>
          </div>

          {hasFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="mt-6 space-y-5">
          {Object.entries(groupedActions).map(([group, actions]) => (
            <div key={group}>
              <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-400">
                {group}
              </p>

              <div className="flex flex-wrap gap-2">
                {actions.map((action) => {
                  const active = selectedActionSet.has(action.value);

                  return (
                    <button
                      key={action.value}
                      type="button"
                      onClick={() => toggleAction(action.value)}
                      className={`rounded-full border px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? "border-gray-950 bg-gray-950 text-white"
                          : "border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300 hover:bg-white"
                      }`}
                    >
                      {action.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ================= FEED ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Feed
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Platform activity stream
            </h2>
          </div>

          <button
            type="button"
            onClick={() => router.refresh()}
            className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white"
          >
            Refresh now
          </button>
        </div>

        {events.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
            <p className="text-sm font-semibold text-gray-950">
              No activity found.
            </p>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
              Try clearing the filters, or wait for new platform actions to
              appear.
            </p>
          </div>
        ) : (
          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200">
            <div className="divide-y divide-gray-200 bg-white">
              {events.map((event) => (
                <AuditFeedRow key={event.id} event={event} />
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ================= PAGINATION ================= */}
      <section className="flex items-center justify-between rounded-[1.5rem] border border-gray-200 bg-white p-4 shadow-sm">
        <button
          type="button"
          onClick={() => goToPage(page - 1)}
          disabled={page === 1}
          className="rounded-full border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Previous
        </button>

        <span className="text-sm font-medium text-gray-500">Page {page}</span>

        <button
          type="button"
          onClick={() => goToPage(page + 1)}
          disabled={events.length < limit}
          className="rounded-full border border-gray-200 bg-gray-50 px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          Next
        </button>
      </section>
    </div>
  );
}

/* =========================================================
   COMPONENTS
========================================================= */

function SummaryCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper: string;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{label}</p>

      <p className="mt-3 text-3xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function AuditFeedRow({ event }: { event: AuditFeedEvent }) {
  const tone = getActionTone(event.action);

  return (
    <article className="flex flex-col gap-4 px-5 py-4 transition hover:bg-gray-50 md:flex-row md:items-start md:justify-between">
      <div className="flex gap-4">
        <div
          className={`mt-1 flex size-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-bold ${tone.icon}`}
        >
          {getActionInitial(event.action)}
        </div>

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
            >
              {formatAction(event.action)}
            </span>

            {event.entityType && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                {formatAction(event.entityType)}
              </span>
            )}
          </div>

          <h3 className="mt-3 text-sm font-semibold text-gray-950">
            {formatAction(event.action)}
          </h3>

          <div className="mt-2 grid gap-1 text-sm text-gray-500">
            <p>
              User:{" "}
              <span className="font-medium text-gray-700">
                {event.userName ?? event.userEmail ?? "System"}
              </span>
            </p>

            <p>
              Organisation:{" "}
              <span className="font-medium text-gray-700">
                {event.organisationName ?? "Platform / not linked"}
              </span>
            </p>

            {event.entityId && (
              <p className="break-all">
                Entity ID:{" "}
                <span className="font-medium text-gray-700">
                  {event.entityId}
                </span>
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="md:text-right">
        <p className="text-sm font-medium text-gray-700">
          {formatDateTime(event.createdAt)}
        </p>

        <p className="mt-1 text-xs text-gray-400">Audit #{event.id}</p>
      </div>
    </article>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatAction(value: string | null | undefined) {
  if (!value) return "Unknown";

  return value
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getActionInitial(action: string) {
  if (action.includes("DWT")) return "D";
  if (action.includes("INCIDENT")) return "!";
  if (action.includes("COMPLETED")) return "✓";
  if (action.includes("COLLECTED")) return "C";
  if (action.includes("ASSIGNED")) return "A";
  if (action.includes("BID")) return "B";
  if (action.includes("LISTING")) return "L";
  if (action.includes("USER")) return "U";
  if (action.includes("ORGANISATION")) return "O";
  if (action.includes("ERROR")) return "E";

  return "•";
}

function getActionTone(action: string) {
  if (action.includes("DWT")) {
    return {
      icon: "border-gray-900 bg-gray-950 text-white",
      badge: "border-gray-900 bg-gray-950 text-white",
    };
  }

  if (action.includes("INCIDENT") || action.includes("ERROR")) {
    return {
      icon: "border-red-200 bg-red-50 text-red-700",
      badge: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (action.includes("COMPLETED") || action.includes("ACCEPTED")) {
    return {
      icon: "border-gray-300 bg-gray-100 text-gray-800",
      badge: "border-gray-300 bg-gray-100 text-gray-800",
    };
  }

  return {
    icon: "border-gray-200 bg-gray-50 text-gray-600",
    badge: "border-gray-200 bg-gray-50 text-gray-600",
  };
}