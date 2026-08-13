// src/components/app/Navigation/SiteSwitcherClient.tsx

"use client";

import { useMemo, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ALL_SITES_FILTER_VALUE } from "@/modules/sites/core/siteFilter";
import { getSiteTypeLabel } from "@/modules/sites/core/siteTypes";

type SiteSwitcherSite = {
  id: string;
  name: string;
  siteType: string;
  isDefault: boolean;
};

export default function SiteSwitcherClient({
  sites,
}: {
  sites: SiteSwitcherSite[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const selectedValue = useMemo(() => {
    const currentSiteId = searchParams.get("siteId");

    if (!currentSiteId) {
      return ALL_SITES_FILTER_VALUE;
    }

    const matchingSite = sites.find((site) => site.id === currentSiteId);

    return matchingSite ? matchingSite.id : ALL_SITES_FILTER_VALUE;
  }, [searchParams, sites]);

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams.toString());

    if (value === ALL_SITES_FILTER_VALUE) {
      params.delete("siteId");
    } else {
      params.set("siteId", value);
    }

    const query = params.toString();
    const href = query ? `${pathname}?${query}` : pathname;

    startTransition(() => {
      router.push(href);
    });
  }

  return (
    <div className="hidden items-center gap-2 rounded-2xl border border-black/10 bg-white px-3 py-2 lg:flex">
      <div className="grid h-8 w-8 place-items-center rounded-xl bg-[#f7f3ed] text-orange-600">
        <SiteIcon />
      </div>

      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.2em] text-black/35">
          Site view
        </p>

        <select
          value={selectedValue}
          disabled={isPending}
          onChange={(event) => handleChange(event.target.value)}
          className="max-w-[190px] cursor-pointer bg-transparent text-xs font-semibold text-black outline-none disabled:cursor-wait disabled:text-black/35"
        >
          <option value={ALL_SITES_FILTER_VALUE}>All Sites</option>

          {sites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
              {site.isDefault ? " — Default" : ""}
              {" · "}
              {getSiteTypeLabel(site.siteType as never)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function SiteIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="M4 20h16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M6 20V8l6-4 6 4v12"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M9 20v-6h6v6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}