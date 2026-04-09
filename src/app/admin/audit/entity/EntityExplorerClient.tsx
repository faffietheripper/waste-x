"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";

export default function EntityExplorerClient({
  initialEvents,
  initialEntityId,
}: any) {
  const [query, setQuery] = useState(initialEntityId);
  const router = useRouter();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query) return;
    router.push(`?entityId=${query}`);
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div>
        <h1 className="text-2xl font-semibold">Entity Explorer</h1>
        <p className="text-sm text-gray-500">
          Search any listing, organisation, or entity ID
        </p>
      </div>

      {/* SEARCH */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter entity ID..."
          className="border rounded px-4 py-2 text-sm w-full"
        />

        <button
          type="submit"
          className="bg-black text-white px-4 py-2 rounded text-sm"
        >
          Search
        </button>
      </form>

      {/* RESULTS */}
      <div className="bg-white border rounded-lg divide-y">
        {initialEvents.length === 0 && (
          <div className="p-6 text-sm text-gray-500">No results</div>
        )}

        {initialEvents.map((event: any) => (
          <div key={event.id} className="p-4 text-sm space-y-1">
            <div className="font-medium">{event.action}</div>

            <div className="text-gray-500 text-xs">
              {event.organisationName || "System"} •{" "}
              {event.userName || "Unknown"}
            </div>

            <div className="text-gray-400 text-xs">
              {format(new Date(event.createdAt), "dd MMM yyyy, HH:mm")}
            </div>

            {(event.previousState || event.newState) && (
              <div className="text-xs bg-gray-50 p-2 rounded mt-2">
                <div>Prev: {event.previousState}</div>
                <div>New: {event.newState}</div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
