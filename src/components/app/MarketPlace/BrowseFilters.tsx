"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export default function BrowseFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [location, setLocation] = useState(searchParams.get("location") || "");
  const [minPrice, setMinPrice] = useState(searchParams.get("minPrice") || "");
  const [maxPrice, setMaxPrice] = useState(searchParams.get("maxPrice") || "");

  function applyFilters() {
    const params = new URLSearchParams();

    if (location) params.set("location", location);
    if (minPrice) params.set("minPrice", minPrice);
    if (maxPrice) params.set("maxPrice", maxPrice);

    router.push(`/home/marketplace/browse?${params.toString()}`);
  }

  return (
    <div className="fixed top-[13vh] left-[20vw] right-0 z-40 bg-white border-b border-gray-200 px-10 py-4 pt-26 flex gap-4 items-center">
      <input
        placeholder="Location..."
        value={location}
        onChange={(e) => setLocation(e.target.value)}
        className="border px-3 py-2 rounded-md text-sm"
      />

      <input
        placeholder="Min £"
        value={minPrice}
        onChange={(e) => setMinPrice(e.target.value)}
        className="border px-3 py-2 rounded-md text-sm w-24"
      />

      <input
        placeholder="Max £"
        value={maxPrice}
        onChange={(e) => setMaxPrice(e.target.value)}
        className="border px-3 py-2 rounded-md text-sm w-24"
      />

      <button
        onClick={applyFilters}
        className="bg-black text-white px-4 py-2 rounded-md text-sm"
      >
        Apply
      </button>
    </div>
  );
}
