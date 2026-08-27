"use client";

import { useState } from "react";

function normalise(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export default function TransportEmissionsSearch({ total }: { total: number }) {
  const [query, setQuery] = useState("");
  const [showing, setShowing] = useState(total);

  function apply(value: string) {
    setQuery(value);
    const needle = normalise(value);

    const rows = Array.from(
      document.querySelectorAll<HTMLTableRowElement>(
        'tr[data-transport-emissions-row="true"]',
      ),
    );

    let matches = 0;

    for (const row of rows) {
      const haystack = normalise(row.dataset.search ?? "");
      const visible = !needle || haystack.includes(needle);
      row.style.display = visible ? "" : "none";
      if (visible) matches += 1;
    }

    setShowing(matches);
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
      <div className="relative w-full max-w-xl">
        <input
          type="search"
          value={query}
          onChange={(event) => apply(event.target.value)}
          placeholder="Search job, client, haulier, vehicle, postcode, status…"
          className="h-10 w-full rounded-xl border border-black/10 bg-[#fbfaf7] px-4 pr-10 text-xs font-medium outline-none focus:border-orange-400 focus:bg-white"
        />
        {query && (
          <button
            type="button"
            onClick={() => apply("")}
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-sm text-black/40 hover:bg-black/5 hover:text-black"
          >
            ×
          </button>
        )}
      </div>

      <span className="hidden whitespace-nowrap text-xs font-semibold text-black/40 sm:block">
        {showing} / {total}
      </span>
    </div>
  );
}
