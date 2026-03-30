import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";

// -------------------------------------------------------
//  NAV 1 — Waste Generator Navigation
// -------------------------------------------------------
function WasteGeneratorNav() {
  return (
    <div className="flex flex-col font-bold gap-8">
      <Link href="/home">Home Page.</Link>
      <Link href="/home/waste-listings">Waste Listings.</Link>
      <Link href="/home/create-waste-listings">Create Waste Listing.</Link>
      <Link href="/home/my-activity">My Activity.</Link>
      <Link href="/home/team-dashboard">Team Dashboard.</Link>
      <Link href="/home/notifications">Notifications.</Link>
      <Link href="/home/me/account">User Settings.</Link>
    </div>
  );
}

// -------------------------------------------------------
//  NAV 2 — Waste Manager Navigation
// -------------------------------------------------------
function WasteManagerNav() {
  return (
    <div className="flex flex-col font-bold gap-8">
      <Link href="/home">Home Page.</Link>
      <Link href="/home/waste-listings">Waste Listings.</Link>
      <Link href="/home/my-activity">My Activity.</Link>
      <Link href="/home/team-dashboard">Team Dashboard.</Link>
      <Link href="/home/waste-carriers">Waste Carriers.</Link>
      <Link href="/home/carrier-hub/carrier-manager/analytics">
        Carrier Hub.
      </Link>
      <Link href="/home/notifications">Notifications.</Link>
      <Link href="/home/me/account">User Settings.</Link>
    </div>
  );
}

// -------------------------------------------------------
//  NAV 3 — Waste Carrier Navigation
// -------------------------------------------------------
function WasteCarrierNav() {
  return (
    <div className="flex flex-col font-bold gap-8">
      <Link href="/home">Home Page.</Link>
      <Link href="/home/waste-listings">Waste Listings.</Link>
      <Link href="/home/team-dashboard">Team Dashboard.</Link>
      <Link href="/home/carrier-hub/waste-carriers/analytics">
        Carrier Hub.
      </Link>
      <Link href="/home/notifications">Notifications.</Link>
      <Link href="/home/me/account">User Settings.</Link>
    </div>
  );
}

// -------------------------------------------------------
//  MAIN HEADER COMPONENT (SERVER)
// -------------------------------------------------------
export default async function Header() {
  const session = await auth();

  if (!session?.user?.id) return null;

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
    },
  });

  const chain = user?.organisation?.chainOfCustody;

  const renderNav = () => {
    switch (chain) {
      case "wasteGenerator":
        return <WasteGeneratorNav />;
      case "wasteManager":
        return <WasteManagerNav />;
      case "wasteCarrier":
        return <WasteCarrierNav />;
      default:
        return (
          <div className="text-sm text-gray-400">No navigation available.</div>
        );
    }
  };

  return (
    <div className="bg-black text-white shadow-md p-12 fixed w-[20vw] flex z-50 h-full">
      <div className="flex flex-col justify-between w-full">
        {/* LOGO */}
        <Link
          href="/home"
          className="text-3xl font-bold z-10 flex items-center gap-4 mb-8"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth="1.5"
            stroke="white"
            className="size-10"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13.5 21v-7.5a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349M3.75 21V9.349m0 0a3.001 3.001 0 0 0 3.75-.615A2.993 2.993 0 0 0 9.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 0 0 2.25 1.016c.896 0 1.7-.393 2.25-1.015a3.001 3.001 0 0 0 3.75.614"
            />
          </svg>
          Waste X
        </Link>

        {/* ROLE-BASED NAVIGATION */}
        {renderNav()}
      </div>
    </div>
  );
}
