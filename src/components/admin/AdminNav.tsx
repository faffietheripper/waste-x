"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function AdminNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const [auditOpen, setAuditOpen] = useState(true);

  const isActive = (href: string) => {
    if (href === "/admin") return pathname === href;

    return pathname === href || pathname.startsWith(`${href}/`);
  };

  const linkClass = (href: string) =>
    `block rounded-xl px-4 py-2.5 text-sm transition ${
      isActive(href)
        ? "bg-gray-800 text-white shadow-sm"
        : "text-gray-300 hover:bg-gray-800 hover:text-white"
    }`;

  const subLinkClass = (href: string) =>
    `block rounded-lg px-4 py-2 text-sm transition ${
      isActive(href)
        ? "bg-gray-800 text-white"
        : "text-gray-400 hover:bg-gray-800 hover:text-white"
    }`;

  return (
    <nav className="flex-1 overflow-y-auto p-4">
      <div className="space-y-6">
        {/* ================= CORE ================= */}
        <section>
          <NavSectionLabel label="Core" />

          <div className="mt-2 space-y-1">
            <Link href="/admin" className={linkClass("/admin")}>
              Dashboard
            </Link>

            <Link
              href="/admin/analytics"
              className={linkClass("/admin/analytics")}
            >
              Analytics
            </Link>
          </div>
        </section>

        {/* ================= AUDIT ================= */}
        <section>
          <NavSectionLabel label="Audit" />

          <div className="mt-2">
            <button
              onClick={() => setAuditOpen(!auditOpen)}
              className={`flex w-full items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm transition ${
                pathname.startsWith("/admin/audit")
                  ? "bg-gray-900 text-white"
                  : "text-gray-300 hover:bg-gray-800 hover:text-white"
              }`}
            >
              <span>Audit Intelligence</span>

              <ChevronDown
                size={16}
                className={`transition-transform ${
                  auditOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {auditOpen && (
              <div className="ml-3 mt-2 space-y-1 border-l border-gray-800 pl-2">
                <Link
                  href="/admin/audit/live"
                  className={subLinkClass("/admin/audit/live")}
                >
                  Live Activity
                </Link>

                <Link
                  href="/admin/audit/chain"
                  className={subLinkClass("/admin/audit/chain")}
                >
                  Chain of Custody
                </Link>

                <Link
                  href="/admin/audit/entity"
                  className={subLinkClass("/admin/audit/entity")}
                >
                  Entity Explorer
                </Link>

                <Link
                  href="/admin/audit/compliance"
                  className={subLinkClass("/admin/audit/compliance")}
                >
                  Compliance
                </Link>
              </div>
            )}
          </div>
        </section>

        {/* ================= OPERATIONS ================= */}
        <section>
          <NavSectionLabel label="Operations" />

          <div className="mt-2 space-y-1">
            <Link href="/admin/users" className={linkClass("/admin/users")}>
              Users
            </Link>

            <Link
              href="/admin/organisations"
              className={linkClass("/admin/organisations")}
            >
              Organisations
            </Link>
          </div>
        </section>

        {/* ================= COMPLIANCE ================= */}
        <section>
          <NavSectionLabel label="Compliance" />

          <div className="mt-2 space-y-1">
            <Link
              href="/admin/digital-waste-tracking"
              className={linkClass("/admin/digital-waste-tracking")}
            >
              Digital Waste Tracking
            </Link>

            <Link
              href="/admin/incidents"
              className={linkClass("/admin/incidents")}
            >
              Incidents
            </Link>

            <Link href="/admin/reviews" className={linkClass("/admin/reviews")}>
              Reviews
            </Link>
          </div>
        </section>

        {/* ================= SYSTEM ================= */}
        <section>
          <NavSectionLabel label="System" />

          <div className="mt-2 space-y-1">
            <Link href="/admin/alerts" className={linkClass("/admin/alerts")}>
              Alerts
            </Link>

            <Link href="/admin/errors" className={linkClass("/admin/errors")}>
              Errors
            </Link>

            <Link href="/admin/support" className={linkClass("/admin/support")}>
              <div className="flex items-center justify-between gap-3">
                <span>Support</span>

                {unreadCount > 0 && (
                  <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
              </div>
            </Link>
          </div>
        </section>
      </div>
    </nav>
  );
}

function NavSectionLabel({ label }: { label: string }) {
  return (
    <p className="px-4 text-[10px] font-semibold uppercase tracking-[0.22em] text-gray-600">
      {label}
    </p>
  );
}