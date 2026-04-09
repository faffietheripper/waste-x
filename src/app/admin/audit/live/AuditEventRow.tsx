"use client";

import { formatDistanceToNow } from "date-fns";
import { ActionBadge } from "./ActionBadge";
import { formatActionText } from "./formatAction";

export function AuditEventRow({ event }: any) {
  return (
    <div className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition">
      <div className="flex items-center gap-4">
        <ActionBadge action={event.action} />

        <div className="text-sm">
          <div className="font-medium text-gray-900">
            {formatActionText(event)}
          </div>

          <div className="text-gray-500 text-xs">
            {event.organisationName || "System"} • {event.userName || "Unknown"}
          </div>
        </div>
      </div>

      <div className="text-xs text-gray-400">
        {formatDistanceToNow(new Date(event.createdAt), {
          addSuffix: true,
        })}
      </div>
    </div>
  );
}
