"use server";

import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, supportTickets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { getProfileByUserId } from "@/data-access/profiles";
import SignOutButton from "../SignOutButton";

/* =========================================================
   NAV ITEM STYLE
========================================================= */

const navItem =
  "text-gray-500 hover:text-orange-500 transition-all duration-200 hover:translate-x-1";

const navSectionLabel = "text-xs uppercase tracking-[0.18em] text-gray-400";

/* =========================================================
   TYPES
========================================================= */

type Capability = "generator" | "carrier" | "manager";

/* =========================================================
   CAPABILITY NAV
========================================================= */

function CapabilityNav({ capabilities }: { capabilities: Capability[] }) {
  const isGenerator = capabilities.includes("generator");
  const isCarrier = capabilities.includes("carrier");
  const isManager = capabilities.includes("manager");

  const canUseOperations = isGenerator || isCarrier || isManager;
  const canUseListings = isGenerator || isManager;
  const canUseTemplates = isGenerator || isManager;
  const canUseMarketplace = isCarrier || isManager;
  const canUseCompliance = isGenerator || isCarrier || isManager;

  return (
    <div className="flex flex-col gap-7 text-sm font-medium">
      {/* DASHBOARD */}
      <Link href="/home" className={navItem}>
        Dashboard
      </Link>

      {/* ================= OPERATIONS ================= */}
      {canUseOperations && (
        <div className="flex flex-col gap-3">
          <span className={navSectionLabel}>Operations</span>

          {canUseListings && (
            <Link href="/home/operations/listings" className={navItem}>
              My Listings
            </Link>
          )}

          <Link href="/home/operations/assignments" className={navItem}>
            Assignments
          </Link>

          {isCarrier && (
            <Link
              href="/home/operations/assignments/active"
              className={navItem}
            >
              Active Jobs
            </Link>
          )}

          {canUseTemplates && (
            <Link href="/home/operations/templates" className={navItem}>
              Templates
            </Link>
          )}
        </div>
      )}

      {/* ================= MARKETPLACE ================= */}
      {canUseMarketplace && (
        <div className="flex flex-col gap-3">
          <span className={navSectionLabel}>Marketplace</span>

          <Link href="/home/marketplace/browse" className={navItem}>
            Browse Listings
          </Link>

          <Link href="/home/marketplace/bids" className={navItem}>
            My Bids
          </Link>
        </div>
      )}

      {/* ================= COMPLIANCE ================= */}
      {canUseCompliance && (
        <div className="flex flex-col gap-3">
          <span className={navSectionLabel}>Compliance</span>

          <Link href="/home/compliance/incidents" className={navItem}>
            Incidents
          </Link>

          <Link
            href="/home/operations/assignments/completed"
            className={navItem}
          >
            Completed Jobs
          </Link>
        </div>
      )}

      {/* ================= TEAM ================= */}
      <div className="flex flex-col gap-3">
        <span className={navSectionLabel}>Team</span>

        <Link href="/home/team/members" className={navItem}>
          Members
        </Link>

        <Link href="/home/settings/organisation" className={navItem}>
          Organisation
        </Link>
      </div>

      {/* ================= GLOBAL ================= */}
      <div className="flex flex-col gap-3">
        <span className={navSectionLabel}>System</span>

        <Link href="/home/notifications" className={navItem}>
          Notifications
        </Link>

        <Link href="/home/settings" className={navItem}>
          Settings
        </Link>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN NAV
========================================================= */

export default async function SystemNav() {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true },
  });

  const capabilities =
    (user?.organisation?.capabilities as Capability[] | null) ?? [];

  let fullName = "Guest";
  let unreadCount = 0;

  const profile = await getProfileByUserId(session.user.id);
  fullName = profile?.fullName ?? user?.name ?? "Unknown User";

  if (user?.organisationId) {
    const unreadTickets = await database.query.supportTickets.findMany({
      where: and(
        eq(supportTickets.organisationId, user.organisationId),
        eq(supportTickets.status, "waiting_on_user"),
      ),
    });

    unreadCount = unreadTickets.length;
  }

  return (
    <>
      {/* ================= TOP BAR ================= */}
      <div className="fixed top-0 left-0 w-full h-[13vh] bg-[#F7F7F8] border-b border-gray-200 flex items-center justify-between px-10 z-50">
        <Link href="/home" className="flex items-center">
          <Image
            src="/wastexblack.png"
            height={140}
            width={140}
            alt="Waste X logo"
            className="object-contain"
          />
        </Link>

        <div className="flex items-center gap-8">
          <Link
            href="/home/settings"
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <span className="text-sm text-gray-700">{fullName}</span>
          </Link>

          <Link
            href="/home/support"
            className="relative flex items-center gap-2 bg-gray-200 hover:bg-gray-300 px-4 py-2.5 rounded-md transition"
          >
            <span className="text-sm text-gray-700">Support</span>

            {unreadCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </Link>

          <SignOutButton />
        </div>
      </div>

      {/* ================= SIDE NAV ================= */}
      <div className="fixed top-[13vh] left-0 h-[87vh] w-[20vw] bg-[#F7F7F8] border-r border-gray-200 flex flex-col z-40">
        <div className="p-10">
          <CapabilityNav capabilities={capabilities} />
        </div>
      </div>
    </>
  );
}
