"use client";

/* =========================================================
   TYPES
========================================================= */

export type ChainTimelineEvent = {
  id: string;
  type:
    | "listing"
    | "assignment"
    | "collection"
    | "completion"
    | "incident"
    | "dwt"
    | "audit";

  title: string;
  description: string;
  status: string | null;
  actor: string;
  organisation: string;
  entityType: string;
  entityId: string;
  timestamp: string | null;

  metadata?: {
    label: string;
    value: string;
  }[];
};

/* =========================================================
   MAIN COMPONENT
========================================================= */

export default function ChainTimeline({
  events,
}: {
  events: ChainTimelineEvent[];
}) {
  if (!events.length) {
    return (
      <section className="rounded-[1.75rem] border border-gray-200 bg-white p-8 shadow-sm">
        <p className="text-sm font-semibold text-gray-950">
          No chain data available.
        </p>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-500">
          No audit events, assignments, incidents or DWT submissions were found
          for this listing.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[1.75rem] border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex flex-col gap-3 border-b border-gray-200 pb-5 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-400">
            Timeline
          </p>

          <h2 className="mt-2 text-lg font-bold text-gray-950">
            Custody timeline
          </h2>

          <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
            A combined custody trail from listing creation, assignments,
            collection, completion, incidents, DWT submissions and audit events.
          </p>
        </div>

        <span className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700">
          {events.length} event{events.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-5 top-0 h-full w-px bg-gray-200" />

        <div className="space-y-5">
          {events.map((event, index) => (
            <TimelineItem key={event.id} event={event} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* =========================================================
   TIMELINE ITEM
========================================================= */

function TimelineItem({
  event,
  index,
}: {
  event: ChainTimelineEvent;
  index: number;
}) {
  const tone = getTone(event.type, event.status);

  return (
    <article className="relative flex gap-5">
      <div className="relative z-10">
        <div
          className={`flex size-10 items-center justify-center rounded-2xl border text-xs font-bold ${tone.icon}`}
        >
          {getIcon(event.type, index)}
        </div>
      </div>

      <div className="flex-1 rounded-[1.35rem] border border-gray-200 bg-gray-50 p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${tone.badge}`}
              >
                {formatType(event.type)}
              </span>

              {event.status && (
                <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">
                  {formatStatus(event.status)}
                </span>
              )}
            </div>

            <h3 className="mt-3 text-sm font-bold text-gray-950">
              {event.title}
            </h3>

            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-500">
              {event.description}
            </p>

            <div className="mt-4 grid gap-2 text-sm text-gray-500 md:grid-cols-2">
              <p>
                Actor:{" "}
                <span className="font-medium text-gray-700">
                  {event.actor}
                </span>
              </p>

              <p>
                Organisation:{" "}
                <span className="font-medium text-gray-700">
                  {event.organisation}
                </span>
              </p>

              <p className="break-all">
                Entity:{" "}
                <span className="font-medium text-gray-700">
                  {event.entityType} / {event.entityId}
                </span>
              </p>

              <p>
                Time:{" "}
                <span className="font-medium text-gray-700">
                  {formatDate(event.timestamp)}
                </span>
              </p>
            </div>

            {event.metadata && event.metadata.length > 0 && (
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {event.metadata.map((item) => (
                  <div
                    key={`${event.id}-${item.label}`}
                    className="rounded-2xl border border-gray-200 bg-white p-3"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-400">
                      {item.label}
                    </p>

                    <p className="mt-2 break-words text-sm font-semibold text-gray-800">
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-500">
            #{index + 1}
          </span>
        </div>
      </div>
    </article>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function formatDate(value: string | null | undefined) {
  if (!value) return "Not recorded";

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatStatus(status: string | null | undefined) {
  if (!status) return "Unknown";

  return status
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatType(type: ChainTimelineEvent["type"]) {
  const labels: Record<ChainTimelineEvent["type"], string> = {
    listing: "Listing",
    assignment: "Assignment",
    collection: "Collection",
    completion: "Completion",
    incident: "Incident",
    dwt: "DWT",
    audit: "Audit",
  };

  return labels[type];
}

function getIcon(type: ChainTimelineEvent["type"], index: number) {
  if (type === "listing") return "L";
  if (type === "assignment") return "A";
  if (type === "collection") return "C";
  if (type === "completion") return "✓";
  if (type === "incident") return "!";
  if (type === "dwt") return "D";

  return index + 1;
}

function getTone(type: ChainTimelineEvent["type"], status: string | null) {
  if (type === "incident") {
    return {
      icon: "border-red-200 bg-red-50 text-red-700",
      badge: "border-red-200 bg-red-50 text-red-700",
    };
  }

  if (type === "dwt") {
    if (status === "rejected" || status === "failed") {
      return {
        icon: "border-red-200 bg-red-50 text-red-700",
        badge: "border-red-200 bg-red-50 text-red-700",
      };
    }

    return {
      icon: "border-gray-900 bg-gray-950 text-white",
      badge: "border-gray-900 bg-gray-950 text-white",
    };
  }

  if (type === "completion" || status === "completed") {
    return {
      icon: "border-gray-900 bg-gray-950 text-white",
      badge: "border-gray-900 bg-gray-950 text-white",
    };
  }

  if (type === "collection" || type === "assignment") {
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