import Link from "next/link";

import {
  searchSoloWorkspace,
  type SoloSearchResult,
  type SoloSearchResultType,
} from "@/modules/search/data-access/searchSoloWorkspace";
import { requireSoloWorkspaceAccess } from "@/modules/solo-workspace/core/requireSoloWorkspaceAccess";

type SearchParams = {
  q?: string | string[];
};

const GROUP_ORDER: SoloSearchResultType[] = [
  "job",
  "client",
  "haulier",
  "material",
  "vehicle",
  "driver",
  "receiving_site",
  "dwt",
  "counterparty",
];

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function groupTitle(type: SoloSearchResultType) {
  switch (type) {
    case "job":
      return "Jobs";
    case "client":
      return "Clients";
    case "haulier":
      return "Hauliers";
    case "material":
      return "Materials";
    case "vehicle":
      return "Vehicles";
    case "driver":
      return "Drivers";
    case "receiving_site":
      return "Receiving Site";
    case "dwt":
      return "DWT";
    default:
      return "Other businesses";
  }
}

function typeBadge(type: SoloSearchResultType) {
  return groupTitle(type).replace(/s$/, "");
}

export default async function SearchPage({
  searchParams = {},
}: {
  searchParams?: SearchParams;
}) {
  const access = await requireSoloWorkspaceAccess();
  const query = first(searchParams.q).trim();
  const response = await searchSoloWorkspace({
    organisationId: access.organisationId,
    query,
    limitPerGroup: 10,
  });

  const visibleGroups = GROUP_ORDER.filter(
    (type) => response.groups[type].length > 0,
  );

  return (
    <main className="min-h-screen bg-[#f7f3ed] px-4 pb-12 pt-24 text-black sm:px-6 lg:pl-[22vw] lg:pr-8 lg:pt-[14vh]">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="relative overflow-hidden rounded-[32px] bg-black p-6 text-white shadow-sm sm:p-8">
          <div className="absolute -right-20 -top-20 size-72 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="relative z-10">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
              Workspace Search
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Find anything fast
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-white/55">
              Search across jobs, clients, hauliers, materials, drivers,
              vehicles, the receiving site and Waste Tracking IDs.
            </p>

            <form method="get" className="mt-6 flex max-w-3xl flex-col gap-3 sm:flex-row">
              <input
                name="q"
                defaultValue={query}
                autoFocus
                placeholder="Try job number, PO, client, vehicle reg or WTID..."
                className="h-13 min-h-13 flex-1 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm text-white outline-none placeholder:text-white/35 focus:border-orange-400"
              />
              <button
                type="submit"
                className="rounded-2xl bg-orange-500 px-6 py-3 text-sm font-semibold text-black transition hover:bg-orange-400"
              >
                Search
              </button>
            </form>
          </div>
        </section>

        {!query ? (
          <section className="rounded-[28px] border border-black/10 bg-white p-10 text-center shadow-sm">
            <h2 className="text-xl font-semibold">Search your Waste X workspace</h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-black/45">
              Enter at least two characters. Search is scoped to your organisation only.
            </p>
          </section>
        ) : query.length < 2 ? (
          <section className="rounded-[28px] border border-orange-200 bg-orange-50 p-6 text-sm text-orange-800">
            Enter at least two characters to search.
          </section>
        ) : response.results.length === 0 ? (
          <section className="rounded-[28px] border border-dashed border-black/15 bg-white p-10 text-center">
            <h2 className="text-xl font-semibold">No matches for “{query}”</h2>
            <p className="mt-2 text-sm text-black/45">
              Try a job number, client name, PO, EWC material, vehicle registration or WTID.
            </p>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-orange-600">
                  Results
                </p>
                <h2 className="mt-2 text-2xl font-semibold">
                  {response.results.length} matches
                </h2>
              </div>
              <p className="text-xs text-black/40">
                Search: {query}
              </p>
            </section>

            <div className="grid gap-5 xl:grid-cols-2">
              {visibleGroups.map((type) => (
                <SearchGroup
                  key={type}
                  title={groupTitle(type)}
                  items={response.groups[type]}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function SearchGroup({
  title,
  items,
}: {
  title: string;
  items: SoloSearchResult[];
}) {
  return (
    <section className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-black/10 p-5">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full bg-black/5 px-2.5 py-1 text-xs font-semibold text-black/40">
          {items.length}
        </span>
      </div>

      <div className="divide-y divide-black/5">
        {items.map((item) => (
          <Link
            key={`${item.type}:${item.id}`}
            href={item.href}
            className="group flex items-center justify-between gap-4 p-5 transition hover:bg-orange-50"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-black/10 bg-[#f7f3ed] px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-black/40">
                  {typeBadge(item.type)}
                </span>
                {item.reference && (
                  <span className="truncate text-xs text-black/35">{item.reference}</span>
                )}
              </div>
              <p className="mt-2 truncate font-semibold group-hover:text-orange-700">
                {item.title}
              </p>
              <p className="mt-1 truncate text-sm text-black/45">{item.subtitle}</p>
            </div>
            <span className="shrink-0 text-lg text-black/25 transition group-hover:translate-x-1 group-hover:text-orange-600">
              →
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
