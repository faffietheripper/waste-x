"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown } from "lucide-react";

export default function AdminNav({ unreadCount }: { unreadCount: number }) {
  const pathname = usePathname();
  const [auditOpen, setAuditOpen] = useState(true);

  const linkClass = (href: string) =>
    `block px-4 py-2 rounded text-sm transition ${
      pathname === href
        ? "bg-gray-800 text-white"
        : "text-gray-300 hover:bg-gray-800"
    }`;

  return (
    <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
      {/* Core */}
      <Link href="/admin" className={linkClass("/admin")}>
        Dashboard
      </Link>

      <Link href="/admin/analytics" className={linkClass("/admin/analytics")}>
        Analytics
      </Link>

      {/* Audit Intelligence */}
      <div>
        <button
          onClick={() => setAuditOpen(!auditOpen)}
          className="w-full flex items-center justify-between px-4 py-2 rounded hover:bg-gray-800 transition text-left text-sm"
        >
          <span>Audit Intelligence</span>
          <ChevronDown
            size={16}
            className={`transition-transform ${auditOpen ? "rotate-180" : ""}`}
          />
        </button>

        {auditOpen && (
          <div className="ml-3 border-l border-gray-800 pl-2 space-y-1 mt-1">
            <Link
              href="/admin/audit/live"
              className={linkClass("/admin/audit/live")}
            >
              Live Activity
            </Link>

            <Link
              href="/admin/audit/chain"
              className={linkClass("/admin/audit/chain")}
            >
              Chain of Custody
            </Link>

            <Link
              href="/admin/audit/entity"
              className={linkClass("/admin/audit/entity")}
            >
              Entity Explorer
            </Link>

            <Link
              href="/admin/audit/compliance"
              className={linkClass("/admin/audit/compliance")}
            >
              Compliance
            </Link>
          </div>
        )}
      </div>

      <Link href="/admin/alerts" className={linkClass("/admin/alerts")}>
        Alerts
      </Link>

      {/* Operations */}
      <Link href="/admin/users" className={linkClass("/admin/users")}>
        Users
      </Link>

      <Link
        href="/admin/organisations"
        className={linkClass("/admin/organisations")}
      >
        Organisations
      </Link>

      <Link href="/admin/incidents" className={linkClass("/admin/incidents")}>
        Incidents
      </Link>

      <Link href="/admin/reviews" className={linkClass("/admin/reviews")}>
        Reviews
      </Link>

      {/* System */}
      <Link href="/admin/errors" className={linkClass("/admin/errors")}>
        Errors
      </Link>

      {/* Support */}
      <Link href="/admin/support" className={linkClass("/admin/support")}>
        <div className="flex justify-between items-center">
          <span>Support</span>

          {unreadCount > 0 && (
            <span className="bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>
      </Link>
    </nav>
  );
}
