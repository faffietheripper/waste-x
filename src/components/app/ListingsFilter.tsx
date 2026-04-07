"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

export default function ListingsFilter() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [endDate, setEndDate] = useState("");
  const [minBid, setMinBid] = useState("");
  const [location, setLocation] = useState("");

  /* =========================================================
     SYNC WITH URL (important)
  ========================================================= */

  useEffect(() => {
    setEndDate(searchParams.get("endDate") ?? "");
    setMinBid(searchParams.get("minBid") ?? "");
    setLocation(searchParams.get("location") ?? "");
  }, [searchParams]);

  /* =========================================================
     APPLY FILTERS
  ========================================================= */

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());

    // clean inputs
    const cleanLocation = location.trim();

    if (endDate) params.set("endDate", endDate);
    else params.delete("endDate");

    if (minBid && Number(minBid) > 0) {
      params.set("minBid", String(Number(minBid)));
    } else {
      params.delete("minBid");
    }

    if (cleanLocation) params.set("location", cleanLocation);
    else params.delete("location");

    router.push(`/home/waste-listings?${params.toString()}`);
  }

  /* =========================================================
     CLEAR FILTERS
  ========================================================= */

  function clearFilters() {
    setEndDate("");
    setMinBid("");
    setLocation("");

    const params = new URLSearchParams(searchParams.toString());

    params.delete("endDate");
    params.delete("minBid");
    params.delete("location");

    router.push(`/home/waste-listings?${params.toString()}`);
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="flex flex-wrap items-end gap-6 px-6 py-4 border-b bg-white">
      {/* END DATE */}
      <div>
        <label className="block text-sm font-medium mb-2">End Before</label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border rounded-md p-2"
        />
      </div>

      {/* MIN BID */}
      <div>
        <label className="block text-sm font-medium mb-2">
          Minimum Bid (£)
        </label>
        <input
          type="number"
          min="0"
          value={minBid}
          onChange={(e) => setMinBid(e.target.value)}
          className="border rounded-md p-2"
        />
      </div>

      {/* LOCATION */}
      <div>
        <label className="block text-sm font-medium mb-2">Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. London"
          className="border rounded-md p-2"
        />
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3">
        <button
          onClick={applyFilters}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Apply
        </button>

        <button
          onClick={clearFilters}
          className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition"
        >
          Clear
        </button>
      </div>
    </div>
  );
}
