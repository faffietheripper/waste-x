import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, supportTickets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";
import { getProfileByUserId } from "@/data-access/profiles";
import SignOutButton from "./SignOutButton";

// -------------------------------------------------------
// NAV ITEM STYLE
// -------------------------------------------------------
const navItem =
  "text-gray-500 hover:text-blue-600 transition-all duration-200 hover:translate-x-1";

// -------------------------------------------------------
// DYNAMIC NAV
// -------------------------------------------------------
function CapabilityNav({
  capabilities,
}: {
  capabilities: ("generator" | "carrier" | "manager")[];
}) {
  return (
    <div className="flex flex-col gap-5 text-sm font-medium">
      {/* ALWAYS */}
      <Link href="/home" className={navItem}>
        Home Page.
      </Link>

      <Link href="/home/my-activity" className={navItem}>
        My Activity.
      </Link>

      <Link href="/home/team-dashboard" className={navItem}>
        Team Dashboard.
      </Link>

      {/* ================= GENERATOR ================= */}
      {capabilities.includes("generator") && (
        <>
          <Link href="/home/waste-listings" className={navItem}>
            Waste Listings.
          </Link>

          <Link href="/home/create-waste-listings" className={navItem}>
            Create Waste Listing.
          </Link>
        </>
      )}

      {/* ================= MANAGER ================= */}
      {capabilities.includes("manager") && (
        <>
          <Link href="/home/waste-carriers" className={navItem}>
            Waste Carriers.
          </Link>

          <Link
            href="/home/carrier-hub/carrier-manager/analytics"
            className={navItem}
          >
            Carrier Hub.
          </Link>
        </>
      )}

      {/* ================= CARRIER ================= */}
      {capabilities.includes("carrier") && (
        <>
          <Link
            href="/home/carrier-hub/waste-carriers/analytics"
            className={navItem}
          >
            My Collections.
          </Link>
        </>
      )}

      {/* ALWAYS */}
      <Link href="/home/notifications" className={navItem}>
        Notifications.
      </Link>

      <Link href="/home/me/account" className={navItem}>
        User Settings.
      </Link>
    </div>
  );
}

// -------------------------------------------------------
// MAIN NAV
// -------------------------------------------------------
export default async function AppNav() {
  const session = await auth();
  if (!session?.user?.id) return null;

  // USER
  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: { organisation: true },
  });

  const capabilities =
    (user?.organisation?.capabilities as
      | ("generator" | "carrier" | "manager")[]
      | null) ?? [];

  // PROFILE
  let fullName = "Guest";
  let unreadCount = 0;

  const profile = await getProfileByUserId(session.user.id);
  fullName = profile?.fullName ?? "Unknown User";

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
      {/* 🔲 TOP BAR */}
      <div className="fixed top-0 left-0 w-full h-[13vh] bg-[#F7F7F8] border-b border-gray-200 flex items-center justify-between px-10 z-50">
        {/* 🔷 LOGO */}
        <Link href="/home" className="flex items-center">
          <Image
            src="/wastexblack.png"
            height={140}
            width={140}
            alt="Waste X logo"
            className="object-contain"
          />
        </Link>

        {/* 🔶 RIGHT SIDE */}
        <div className="flex items-center gap-8">
          {/* PROFILE */}
          <Link
            href="/home/me"
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <span className="text-sm text-gray-700">{fullName}</span>
          </Link>

          {/* SUPPORT */}
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

          {/* SIGN OUT */}
          <div>
            <SignOutButton />
          </div>
        </div>
      </div>

      {/* 🟩 SIDE NAV */}
      <div className="fixed top-[13vh] left-0 h-[87vh] w-[20vw] bg-[#F7F7F8] border-r border-gray-200 flex flex-col justify-between z-40">
        <div />

        <div className="p-10">
          <CapabilityNav capabilities={capabilities} />
        </div>
      </div>
    </>
  );
}
