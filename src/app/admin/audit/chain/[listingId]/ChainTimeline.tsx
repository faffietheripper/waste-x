"use client";

import { format } from "date-fns";

export default function ChainTimeline({ events }: { events: any[] }) {
  if (!events.length) {
    return (
      <div className="bg-white border rounded-lg p-6 text-sm text-gray-500">
        No chain data available.
      </div>
    );
  }

  return (
    <div className="bg-white border rounded-lg p-6">
      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-3 top-0 bottom-0 w-px bg-gray-200" />

        <div className="space-y-6">
          {events.map((event, index) => (
            <TimelineItem key={event.id} event={event} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineItem({ event, index }: any) {
  return (
    <div className="relative flex items-start gap-4">
      {/* Dot */}
      <div className="relative z-10">
        <div className="w-6 h-6 rounded-full bg-black flex items-center justify-center text-white text-xs">
          {index + 1}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        <div className="text-sm font-medium text-gray-900">
          {getActionLabel(event.action)}
        </div>

        <div className="text-xs text-gray-500 mt-1">
          {event.organisationName || "System"} • {event.userName || "Unknown"}
        </div>

        <div className="text-xs text-gray-400 mt-1">
          {format(new Date(event.createdAt), "dd MMM yyyy, HH:mm")}
        </div>
      </div>
    </div>
  );
}

function getActionLabel(action: string) {
  switch (action) {
    case "LISTING_CREATED":
      return "Listing Created";

    case "BID_PLACED":
      return "Bid Placed";

    case "ASSIGNED":
      return "Carrier Assigned";

    case "COLLECTED":
      return "Waste Collected";

    case "COMPLETED":
      return "Completed";

    case "INCIDENT_REPORTED":
      return "Incident Reported";

    default:
      return action;
  }
}
