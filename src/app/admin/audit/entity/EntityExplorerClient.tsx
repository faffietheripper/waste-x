// src/app/admin/audit/entity/EntityExplorerClient.tsx

"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type EntityAuditEvent = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  createdAt: string | null;
  previousState: string | null;
  newState: string | null;

  userName: string | null;
  userEmail: string | null;

  organisationName: string | null;
  organisationId: string | null;
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function EntityExplorerClient({
  initialEvents,
  initialEntityId,
}: {
  initialEvents: EntityAuditEvent[];
  initialEntityId: string;
}) {
  const [query, setQuery] = useState(initialEntityId);
  const router = useRouter();

  const hasQuery = initialEntityId.trim().length > 0;
  const hasResults = initialEvents.length > 0;

  const latestEvent = initialEvents[0] ?? null;

  const actionSummary = useMemo(() => {
    const counts = new Map<string, number>();

    for (const event of initialEvents) {
      counts.set(event.action, (counts.get(event.action) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([action, count]) => ({
        action,
        count,
      }))
      .sort((first, second) => second.count - first.count);
  }, [initialEvents]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanedQuery = query.trim();

    if (!cleanedQuery) return;

    router.push(`/admin/audit/entity?entityId=${encodeURIComponent(cleanedQuery)}`);
  }

  function clearSearch() {
    setQuery("");
    router.push("/admin/audit/entity");
  }

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
              Entity Explorer
            </h1>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Search any listing, assignment, organisation, user, incident or
              Digital Waste Tracking entity ID to inspect its audit history.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link
              href="/admin/audit/live"
              className="rounded-full border border-gray-200 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 transition hover:border-gray-300 hover:bg-gray-50"
            >
              Live activity
            </Link>

            <Link
              href="/admin/audit/chain"
              className="rounded-full bg-gray-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Chain of custody
            </Link>
          </div>
        </div>
      </section>

      {/* ================= SEARCH ================= */}
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Search
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Find an entity audit trail
            </h2>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              Paste the exact entity ID used in the audit table. This could be a
              listing ID, assignment UUID, organisation ID, incident ID or DWT
              submission ID.
            </p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="mt-6 flex flex-col gap-3 md:flex-row">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Example: 53c96334-ad43-4f09-8112-b505474eadf5"
            className="min-h-[3rem] flex-1 rounded-2xl border border-gray-200 bg-gray-50 px-4 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-gray-400 focus:bg-white"
          />

          <div className="flex gap-3">
            <button
              type="submit"
              className="rounded-2xl bg-gray-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-gray-800"
            >
              Search
            </button>

            {hasQuery && (
              <button
                type="button"
                onClick={clearSearch}
                className="rounded-2xl border border-gray-200 bg-white px-5 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
              >
                Clear
              </button>
            )}
          </div>
        </form>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <HelperCard
            label="Listing"
            value="Use the numeric listing ID"
            helper="Example: 7"
          />

          <HelperCard
            label="Assignment"
            value="Use the assignment UUID"
            helper="Best for operational investigations"
          />

          <HelperCard
            label="DWT / Incident"
            value="Use the saved entity ID"
            helper="Useful for compliance debugging"
          />
        </div>
      </section>

      {/* ================= SUMMARY ================= */}
      <section className="grid gap-5 md:grid-cols-3">
        <SummaryCard
          label="Matching events"
          value={initialEvents.length}
          helper={hasQuery ? "For current entity search" : "No entity selected"}
        />

        <SummaryCard
          label="Latest action"
          value={latestEvent ? formatAction(latestEvent.action) : "—"}
          helper={
            latestEvent
              ? formatDateTime(latestEvent.createdAt)
              : "Search an entity to inspect activity"
          }
        />

        <SummaryCard
          label="Entity type"
          value={latestEvent?.entityType ? formatAction(latestEvent.entityType) : "—"}
          helper={initialEntityId || "No ID selected"}
        />
      </section>

      {/* ================= RESULTS ================= */}
      <section className="grid gap-6 xl:grid-cols-3">
        {/* MAIN RESULT LIST */}
        <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm xl:col-span-2">
          <div className="flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
                Results
              </p>

              <h2 className="mt-2 text-lg font-bold text-gray-950">
                Entity audit events
              </h2>

              <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
                Events are shown newest first, including the user,
                organisation, previous state and new state where available.
              </p>
            </div>

            {hasQuery && (
              <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-xs font-semibold text-gray-600">
                {initialEntityId}
              </span>
            )}
          </div>

          {!hasQuery ? (
            <EmptyState
              title="Search for an entity"
              message="Enter an entity ID above to inspect its audit history."
            />
          ) : !hasResults ? (
            <EmptyState
              title="No audit events found"
              message="No events were found for this entity ID. Check the ID, or try searching from the Live Activity page."
            />
          ) : (
            <div className="mt-6 space-y-4">
              {initialEvents.map((event, index) => (
                <EventCard
                  key={event.id}
                  event={event}
                  index={initialEvents.length - index}
                />
              ))}
            </div>
          )}
        </section>

        {/* SIDE SUMMARY */}
        <aside className="space-y-6">
          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Entity Context
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Investigation summary
            </h2>

            <div className="mt-5 space-y-3">
              <InfoRow label="Entity ID" value={initialEntityId || "Not selected"} />

              <InfoRow
                label="Entity type"
                value={
                  latestEvent?.entityType
                    ? formatAction(latestEvent.entityType)
                    : "Unknown"
                }
              />

              <InfoRow
                label="First seen"
                value={
                  initialEvents.length > 0
                    ? formatDateTime(initialEvents[initialEvents.length - 1].createdAt)
                    : "Not recorded"
                }
              />

              <InfoRow
                label="Latest event"
                value={
                  latestEvent ? formatDateTime(latestEvent.createdAt) : "Not recorded"
                }
              />
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
              Actions
            </p>

            <h2 className="mt-2 text-lg font-bold text-gray-950">
              Action breakdown
            </h2>

            {actionSummary.length === 0 ? (
              <p className="mt-5 text-sm leading-6 text-gray-500">
                No actions to summarise yet.
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {actionSummary.map((item) => (
                  <div
                    key={item.action}
                    className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3"
                  >
                    <span className="text-sm font-medium text-gray-700">
                      {formatAction(item.action)}
                    </span>

                    <span className="rounded-full bg-gray-950 px-2.5 py-1 text-xs font-semibold text-white">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
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

      <p className="mt-3 truncate text-2xl font-bold text-gray-950">{value}</p>

      <p className="mt-2 text-xs leading-5 text-gray-400">{helper}</p>
    </div>
  );
}

function HelperCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {label}
      </p>

      <p className="mt-2 text-sm font-semibold text-gray-900">{value}</p>

      <p className="mt-1 text-xs leading-5 text-gray-500">{helper}</p>
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-8">
      <p className="text-sm font-semibold text-gray-950">{title}</p>

      <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
        {message}
      </p>
    </div>
  );
}

function EventCard({
  event,
  index,
}: {
  event: EntityAuditEvent;
  index: number;
}) {
  const tone = getActionTone(event.action);

  return (
    <article className="rounded-[1.5rem] border border-gray-200 bg-gray-50 p-5">
      <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex gap-4">
          <div
            className={`flex size-10 shrink-0 items-center justify-center rounded-2xl border text-xs font-bold ${tone.icon}`}
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
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {formatAction(event.entityType)}
                </span>
              )}
            </div>

            <h3 className="mt-3 text-sm font-bold text-gray-950">
              {formatAction(event.action)}
            </h3>

            <div className="mt-3 grid gap-2 text-sm text-gray-500">
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

              <p>
                Time:{" "}
                <span className="font-medium text-gray-700">
                  {formatDateTime(event.createdAt)}
                </span>
              </p>
            </div>
          </div>
        </div>

        <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500">
          #{index}
        </span>
      </div>

      {(event.previousState || event.newState) && (
        <StateDiff
          previousState={event.previousState}
          newState={event.newState}
        />
      )}
    </article>
  );
}

function StateDiff({
  previousState,
  newState,
}: {
  previousState: string | null;
  newState: string | null;
}) {
  return (
    <details className="mt-5 rounded-2xl border border-gray-200 bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">
        View state changes
      </summary>

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <StateBox title="Previous state" value={previousState} />
        <StateBox title="New state" value={newState} />
      </div>
    </details>
  );
}

function StateBox({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  const formatted = formatStateValue(value);

  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-400">
        {title}
      </p>

      <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-6 text-gray-700">
        {formatted}
      </pre>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
      <p className="text-xs font-medium text-gray-400">{label}</p>

      <p className="mt-1 break-words text-sm font-semibold text-gray-900">
        {value}
      </p>
    </div>
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
    icon: "border-gray-200 bg-white text-gray-600",
    badge: "border-gray-200 bg-white text-gray-600",
  };
}

function formatStateValue(value: string | null) {
  if (!value) return "No state recorded.";

  try {
    const parsed = JSON.parse(value);

    return JSON.stringify(parsed, null, 2);
  } catch {
    return value;
  }
}