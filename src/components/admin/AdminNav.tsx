"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export default function AdminNav({
  unreadCount,
}: {
  unreadCount: number;
}) {
  const pathname = usePathname();
  const [complianceOpen, setComplianceOpen] = useState(true);

  const isActive = (href: string) =>
    href === "/admin"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string) =>
    `block rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
      isActive(href)
        ? "border-red-600 bg-red-600 text-white"
        : "border-transparent text-white/58 hover:border-white/10 hover:bg-white/5 hover:text-white"
    }`;

  const subLinkClass = (href: string) =>
    `block rounded-lg px-4 py-2 text-sm font-semibold transition ${
      isActive(href)
        ? "bg-red-600 text-white"
        : "text-white/45 hover:bg-white/5 hover:text-white"
    }`;

  return (
    <nav className="px-4 py-5">
      <div className="space-y-7 pb-8">
        <NavGroup label="Control">
          <Link href="/admin" className={linkClass("/admin")}>
            Control Tower
          </Link>

          <Link
            href="/admin/workflows"
            className={linkClass("/admin/workflows")}
          >
            Workflow Health
          </Link>
        </NavGroup>

        <NavGroup label="Customers">
          <Link
            href="/admin/organisations"
            className={linkClass("/admin/organisations")}
          >
            Organisations
          </Link>

          <Link href="/admin/users" className={linkClass("/admin/users")}>
            Users & Access
          </Link>
        </NavGroup>

        <NavGroup label="Compliance">
          <button
            type="button"
            onClick={() => setComplianceOpen((value) => !value)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-2.5 text-left text-sm font-semibold transition ${
              pathname.startsWith("/admin/digital-waste-tracking") ||
              pathname.startsWith("/admin/quarterly-returns")
                ? "border-red-950 bg-red-950/35 text-white"
                : "border-transparent text-white/58 hover:border-white/10 hover:bg-white/5 hover:text-white"
            }`}
          >
            <span>Compliance Control</span>

            <ChevronDown
              size={16}
              className={`transition-transform ${
                complianceOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {complianceOpen ? (
            <div className="ml-3 mt-2 space-y-1 border-l border-red-950 pl-2">
              <Link
                href="/admin/digital-waste-tracking"
                className={subLinkClass(
                  "/admin/digital-waste-tracking",
                )}
              >
                DWT Submission Register
              </Link>

              <Link
                href="/admin/digital-waste-tracking/pat"
                className={subLinkClass(
                  "/admin/digital-waste-tracking/pat",
                )}
              >
                PAT Tracker
              </Link>

              <Link
                href="/admin/quarterly-returns"
                className={subLinkClass("/admin/quarterly-returns")}
              >
                Quarterly Returns
              </Link>
            </div>
          ) : null}
        </NavGroup>

        <NavGroup label="Product Operations">
          <Link
            href="/admin/commercial"
            className={linkClass("/admin/commercial")}
          >
            Commercial & Invoicing
          </Link>

          <Link
            href="/admin/transport-emissions"
            className={linkClass("/admin/transport-emissions")}
          >
            Transport Emissions
          </Link>
        </NavGroup>

        <NavGroup label="Platform Business">
          <Link
            href="/admin/billing"
            className={linkClass("/admin/billing")}
          >
            Platform Billing
          </Link>

          <Link
            href="/admin/reports"
            className={linkClass("/admin/reports")}
          >
            Platform Reports
          </Link>
        </NavGroup>

        <NavGroup label="Platform Operations">
          <Link
            href="/admin/support"
            className={linkClass("/admin/support")}
          >
            <span className="flex items-center justify-between gap-3">
              <span>Support</span>

              {unreadCount > 0 ? (
                <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-black text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </span>
          </Link>

          <Link
            href="/admin/errors"
            className={linkClass("/admin/errors")}
          >
            System Health
          </Link>

          <Link
            href="/admin/alerts"
            className={linkClass("/admin/alerts")}
          >
            Alerts
          </Link>
        </NavGroup>

        <NavGroup label="Governance">
          <Link
            href="/admin/audit"
            className={linkClass("/admin/audit")}
          >
            Activity & Audit
          </Link>
        </NavGroup>

        <NavGroup label="System">
          <Link
            href="/admin/danger-zone"
            className={linkClass("/admin/danger-zone")}
          >
            Danger Zone
          </Link>
        </NavGroup>
      </div>
    </nav>
  );
}

function NavGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section>
      <p className="px-4 text-[9px] font-black uppercase tracking-[0.28em] text-red-700">
        {label}
      </p>

      <div className="mt-2 space-y-1">{children}</div>
    </section>
  );
}