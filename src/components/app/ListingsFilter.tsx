"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useEffect } from "react";

/* =========================================================
   TYPES
========================================================= */

type StatusFilter =
  | "all"
  | "open"
  | "assigned"
  | "in_progress"
  | "completed"
  | "cancelled";

/* =========================================================
   COMPONENT
========================================================= */

export default function ListingsFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [status, setStatus] = useState<StatusFilter>("all");
  const [endDate, setEndDate] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [location, setLocation] = useState("");

  /* =========================================================
     SYNC WITH URL
  ========================================================= */

  useEffect(() => {
    setStatus((searchParams.get("status") as StatusFilter) ?? "all");
    setEndDate(searchParams.get("endDate") ?? "");
    setMinPrice(searchParams.get("minPrice") ?? "");
    setMaxPrice(searchParams.get("maxPrice") ?? "");
    setLocation(searchParams.get("location") ?? "");
  }, [searchParams]);

  /* =========================================================
     APPLY FILTERS
  ========================================================= */

  function applyFilters() {
    const params = new URLSearchParams(searchParams.toString());

    const cleanLocation = location.trim();

    if (status && status !== "all") {
      params.set("status", status);
    } else {
      params.delete("status");
    }

    if (endDate) {
      params.set("endDate", endDate);
    } else {
      params.delete("endDate");
    }

    if (minPrice && Number(minPrice) >= 0) {
      params.set("minPrice", String(Number(minPrice)));
    } else {
      params.delete("minPrice");
    }

    if (maxPrice && Number(maxPrice) >= 0) {
      params.set("maxPrice", String(Number(maxPrice)));
    } else {
      params.delete("maxPrice");
    }

    if (cleanLocation) {
      params.set("location", cleanLocation);
    } else {
      params.delete("location");
    }

    const query = params.toString();

    router.push(
      query ? `/home/marketplace/browse?${query}` : "/home/marketplace/browse",
    );
  }

  /* =========================================================
     CLEAR FILTERS
  ========================================================= */

  function clearFilters() {
    setStatus("all");
    setEndDate("");
    setMinPrice("");
    setMaxPrice("");
    setLocation("");

    router.push("/home/marketplace/browse");
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <section className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-start justify-between gap-6">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
            Marketplace Filters
          </p>

          <h2 className="mt-2 text-xl font-semibold text-black">
            Filter Waste Listings
          </h2>

          <p className="mt-2 text-sm text-black/45">
            Narrow marketplace listings by status, end date, price range and
            location.
          </p>
        </div>

        <button
          type="button"
          onClick={clearFilters}
          className="rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-sm font-semibold text-black/55 transition hover:bg-orange-100 hover:text-orange-700"
        >
          Clear Filters
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {/* STATUS */}
        <div>
          <label className="text-sm font-medium text-black">Status</label>

          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StatusFilter)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
          >
            <option value="all">All visible</option>
            <option value="open">Open</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        {/* END DATE */}
        <div>
          <label className="text-sm font-medium text-black">End Before</label>

          <input
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition focus:border-orange-500 focus:bg-white"
          />
        </div>

        {/* MIN PRICE */}
        <div>
          <label className="text-sm font-medium text-black">
            Minimum Price
          </label>

          <input
            type="number"
            min="0"
            value={minPrice}
            onChange={(event) => setMinPrice(event.target.value)}
            placeholder="£ min"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
          />
        </div>

        {/* MAX PRICE */}
        <div>
          <label className="text-sm font-medium text-black">
            Maximum Price
          </label>

          <input
            type="number"
            min="0"
            value={maxPrice}
            onChange={(event) => setMaxPrice(event.target.value)}
            placeholder="£ max"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
          />
        </div>

        {/* LOCATION */}
        <div>
          <label className="text-sm font-medium text-black">Location</label>

          <input
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="e.g. London"
            className="mt-2 w-full rounded-2xl border border-black/10 bg-[#fbfaf7] px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-orange-500 focus:bg-white"
          />
        </div>
      </div>

      <div className="mt-6 flex items-center justify-between gap-4 border-t border-black/5 pt-5">
        <p className="text-xs text-black/40">
          Filters apply to listings your organisation is allowed to access.
        </p>

        <button
          type="button"
          onClick={applyFilters}
          className="rounded-full bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
        >
          Apply Filters
        </button>
      </div>
    </section>
  );
}
