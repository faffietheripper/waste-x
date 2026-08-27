"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

function normalise(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function compact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export default function WorksheetSearch({
  date,
  view,
  totalRows,
}: {
  date: string;
  view: "live" | "completed";
  totalRows: number;
}) {
  /*
    Search is intentionally client-side:
    - 300-400 rows can be filtered instantly without another database request.
    - Mark arrived / Save weight / Accept can still use the existing Server Actions.
    - The query is kept in sessionStorage so an action refresh does not make the
      operator lose the search they were working from.
  */
  const storageKey = useMemo(
    () => `waste-x:worksheet-search:${date}`,
    [date],
  );

  const [query, setQuery] = useState("");
  const [matchedRows, setMatchedRows] = useState(totalRows);

  const applySearch = useCallback(
    (rawQuery: string) => {
      const queryNormal = normalise(rawQuery);
      const queryCompact = compact(rawQuery);

      const rows = Array.from(
        document.querySelectorAll<HTMLTableRowElement>(
          'tr[data-worksheet-row="true"]',
        ),
      );

      let matches = 0;

      for (const row of rows) {
        const searchable = row.dataset.search ?? "";
        const searchableNormal = normalise(searchable);
        const searchableCompact = compact(searchable);

        const isMatch =
          !queryNormal ||
          searchableNormal.includes(queryNormal) ||
          (queryCompact.length >= 2 &&
            searchableCompact.includes(queryCompact));

        row.style.display = isMatch ? "" : "none";

        if (isMatch) matches += 1;
      }

      setMatchedRows(matches);
    },
    [],
  );

  useEffect(() => {
    const saved = window.sessionStorage.getItem(storageKey) ?? "";
    setQuery(saved);

    const apply = () => applySearch(saved);
    requestAnimationFrame(() => requestAnimationFrame(apply));
  }, [applySearch, storageKey, view, totalRows]);

  function updateQuery(value: string) {
    setQuery(value);
    window.sessionStorage.setItem(storageKey, value);
    applySearch(value);
  }

  function clearSearch() {
    setQuery("");
    window.sessionStorage.removeItem(storageKey);
    applySearch("");
  }

  return (
    <div className="flex min-w-0 flex-1 items-center justify-end gap-2 xl:max-w-[720px]">
      <div className="relative min-w-0 flex-1">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-black/30"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>

        <input
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          placeholder="Search job, number plate, driver, haulier, source, site, EWC, ticket…"
          className="h-10 w-full rounded-xl border border-black/10 bg-[#fbfaf7] pl-10 pr-10 text-xs font-medium text-black outline-none placeholder:text-black/30 focus:border-orange-400 focus:bg-white"
        />

        {query && (
          <button
            type="button"
            onClick={clearSearch}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-sm font-semibold text-black/35 hover:bg-black/5 hover:text-black"
          >
            ×
          </button>
        )}
      </div>

      <div className="hidden min-w-[88px] text-right sm:block">
        <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-black/30">
          Showing
        </p>
        <p
          className={`text-xs font-semibold ${
            query && matchedRows === 0 ? "text-red-600" : "text-black/55"
          }`}
        >
          {matchedRows} / {totalRows}
        </p>
      </div>
    </div>
  );
}
