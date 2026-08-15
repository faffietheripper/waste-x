import Link from "next/link";
import React from "react";
import { redirect } from "next/navigation";

import { auth } from "@/auth";

/* =========================================================
   TYPES
========================================================= */

type SettingsNavItem = {
  label: string;
  href: string;
  description: string;
  icon: React.ReactNode;
  featured?: boolean;
};

/* =========================================================
   NAV ITEMS
========================================================= */

const settingsNavItems: SettingsNavItem[] = [
  {
    label: "Profile",
    href: "/home/settings/profile",
    description: "Personal details",
    icon: <SettingsIcon />,
  },
  {
    label: "Account",
    href: "/home/settings/account",
    description: "Login and access",
    icon: <SlidersIcon />,
  },
  {
    label: "Sites",
    href: "/home/settings/sites",
    description: "Sites and depots",
    icon: <SitesIcon />,
  },
  {
    label: "Organisation",
    href: "/home/settings/organisation",
    description: "Company profile",
    icon: <BuildingIcon />,
  },
  {
    label: "Departments",
    href: "/home/settings/departments",
    description: "Active workflow areas",
    icon: <DepartmentsIcon />,
  },
  {
    label: "Data Readiness",
    href: "/home/settings/data-readiness",
    description: "Check operational setup",
    icon: <DataReadinessIcon />,
  },
  {
    label: "Digital Waste Tracking",
    href: "/home/settings/digital-waste-tracking",
    description: "Receiver API code",
    icon: <DigitalWasteTrackingIcon />,
    featured: true,
  },
  {
    label: "Billing",
    href: "/home/settings/billing",
    description: "Plan and payments",
    icon: <CardIcon />,
  },
  {
    label: "Terms",
    href: "/home/settings/terms",
    description: "Policies and terms",
    icon: <DocumentIcon />,
  },
];

/* =========================================================
   LAYOUT
========================================================= */

export default async function SettingsLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-[#f7f3ed] pl-[22vw]">
      <section className="sticky top-[13vh] z-30 border-b border-black/10 bg-[#f7f3ed]/95 px-10 py-5 backdrop-blur">
        <div className="flex items-center justify-between gap-8">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
              Waste X Settings
            </p>

            <h1 className="mt-1 text-2xl font-semibold text-black">Settings</h1>
          </div>

          <div className="hidden rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400 lg:block">
            Account controls, organisation setup and compliance configuration
          </div>
        </div>

        <nav className="mt-5 overflow-x-auto py-10 pb-2">
          <div className="flex gap-3">
            {settingsNavItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`group flex shrink-0 items-center gap-3 rounded-2xl border p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${
                  item.featured
                    ? "w-[270px] border-orange-200 bg-orange-50 hover:border-orange-400"
                    : "w-[190px] border-black/10 bg-white hover:border-orange-300"
                }`}
              >
                <div
                  className={`flex size-10 shrink-0 items-center justify-center rounded-xl border transition ${
                    item.featured
                      ? "border-orange-200 bg-white text-orange-600 group-hover:border-orange-400 group-hover:bg-orange-100"
                      : "border-black/10 bg-[#fbfaf7] text-black/55 group-hover:border-orange-300 group-hover:bg-orange-50 group-hover:text-orange-600"
                  }`}
                >
                  {item.icon}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-black">
                      {item.label}
                    </p>

                    {item.featured && (
                      <span className="shrink-0 rounded-full bg-black px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-orange-400">
                        DWT
                      </span>
                    )}
                  </div>

                  <p className="mt-1 truncate text-xs text-black/40">
                    {item.description}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </nav>
      </section>

      <section className="mt-32 px-10 py-10">{children}</section>
    </main>
  );
}

/* =========================================================
   ICONS
========================================================= */

function SettingsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 9.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 18.75a6.75 6.75 0 0 0-10.5 0M12 3.75a6 6 0 0 0-6 6c0 4.5 6 10.5 6 10.5s6-6 6-10.5a6 6 0 0 0-6-6Z" />
    </svg>
  );
}

function SlidersIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 1 1-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 0 1-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 0 1-3 0m-9.75 0h9.75" />
    </svg>
  );
}

function BuildingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4.5 21V8.25L12 3l7.5 5.25V21M9 21v-6h6v6M9 10.5h.008v.008H9V10.5Zm3 0h.008v.008H12V10.5Zm3 0h.008v.008H15V10.5Z" />
    </svg>
  );
}

function DepartmentsIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5h10.5M6.75 12h10.5M6.75 16.5h10.5M3.75 5.25A2.25 2.25 0 0 1 6 3h12a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 18 21H6a2.25 2.25 0 0 1-2.25-2.25V5.25Z" />
    </svg>
  );
}

function SitesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 20h16" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 20V8l6-4 6 4v12" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 20v-6h6v6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 10h.01M15 10h.01" />
    </svg>
  );
}

function DataReadinessIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5h6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 2.75h6a1.25 1.25 0 0 1 1.25 1.25v1A1.25 1.25 0 0 1 15 6.25H9A1.25 1.25 0 0 1 7.75 5V4A1.25 1.25 0 0 1 9 2.75Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 5H6.75A2.75 2.75 0 0 0 4 7.75v11.5A2.75 2.75 0 0 0 6.75 22h10.5A2.75 2.75 0 0 0 20 19.25V7.75A2.75 2.75 0 0 0 17.25 5h-.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="m8 13 2.25 2.25L16 9.5" />
    </svg>
  );
}

function DigitalWasteTrackingIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75 5.25 6.75v5.25c0 4.125 2.7 7.95 6.75 9 4.05-1.05 6.75-4.875 6.75-9V6.75L12 3.75Z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15A2.25 2.25 0 0 0 21.75 17.25V6.75A2.25 2.25 0 0 0 19.5 4.5h-15A2.25 2.25 0 0 0 2.25 6.75v10.5A2.25 2.25 0 0 0 4.5 19.5Z" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="size-5" fill="none" viewBox="0 0 24 24" strokeWidth="1.7" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-.988-2.386l-4.751-4.751A3.375 3.375 0 0 0 11.375 3.5H8.25A2.25 2.25 0 0 0 6 5.75v12.5A2.25 2.25 0 0 0 8.25 20.5h9A2.25 2.25 0 0 0 19.5 18.25v-4Z" />
    </svg>
  );
}
