import Link from "next/link";
import Image from "next/image";
import SignOutButton from "./SignOutButton";

// -------------------------------------------------------
//  NAV ITEM STYLE
// -------------------------------------------------------
const navItem =
  "text-gray-500 hover:text-black transition-all duration-200 hover:translate-x-1";

// -------------------------------------------------------
//  NAVS
// -------------------------------------------------------
function WasteGeneratorNav() {
  return (
    <div className="flex flex-col gap-5 text-sm font-medium">
      <Link href="/home" className={navItem}>
        Home Page.
      </Link>
      <Link href="/home/waste-listings" className={navItem}>
        Waste Listings.
      </Link>
      <Link href="/home/create-waste-listings" className={navItem}>
        Create Waste Listing.
      </Link>
      <Link href="/home/my-activity" className={navItem}>
        My Activity.
      </Link>
      <Link href="/home/team-dashboard" className={navItem}>
        Team Dashboard.
      </Link>
      <Link href="/home/notifications" className={navItem}>
        Notifications.
      </Link>
      <Link href="/home/me/account" className={navItem}>
        User Settings.
      </Link>
    </div>
  );
}

function WasteManagerNav() {
  return (
    <div className="flex flex-col gap-5 text-sm font-medium">
      <Link href="/home" className={navItem}>
        Home Page.
      </Link>
      <Link href="/home/waste-listings" className={navItem}>
        Waste Listings.
      </Link>
      <Link href="/home/my-activity" className={navItem}>
        My Activity.
      </Link>
      <Link href="/home/team-dashboard" className={navItem}>
        Team Dashboard.
      </Link>
      <Link href="/home/waste-carriers" className={navItem}>
        Waste Carriers.
      </Link>
      <Link
        href="/home/carrier-hub/carrier-manager/analytics"
        className={navItem}
      >
        Carrier Hub.
      </Link>
      <Link href="/home/notifications" className={navItem}>
        Notifications.
      </Link>
      <Link href="/home/me/account" className={navItem}>
        User Settings.
      </Link>
    </div>
  );
}

function WasteCarrierNav() {
  return (
    <div className="flex flex-col gap-5 text-sm font-medium">
      <Link href="/home" className={navItem}>
        Home Page.
      </Link>
      <Link href="/home/waste-listings" className={navItem}>
        Waste Listings.
      </Link>
      <Link href="/home/team-dashboard" className={navItem}>
        Team Dashboard.
      </Link>
      <Link
        href="/home/carrier-hub/waste-carriers/analytics"
        className={navItem}
      >
        Carrier Hub.
      </Link>
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
//  MAIN NAV
// -------------------------------------------------------
export default function AppNav({ user, profile }: { user: any; profile: any }) {
  const chain = user?.organisation?.chainOfCustody;
  const fullName = profile?.fullName ?? "Unknown User";

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
    <>
      {/* 🔲 TOP BAR */}
      <div className="fixed top-0 left-0 w-full h-[13vh] bg-[#F7F7F8] border-b border-gray-200 text-black flex items-center justify-between px-10 z-50">
        {/* LOGO */}
        <Image
          src="/wastexblack.png"
          height={180}
          width={180}
          alt="Waste X logo"
          className="object-contain pt-4"
        />

        {/* USER ACTIONS */}
        <div className="flex items-center gap-8">
          <Link
            href="/home/me"
            className="flex items-center gap-3 hover:opacity-80 transition"
          >
            <div className="w-8 h-8 rounded-full bg-gray-200" />
            <span className="text-sm text-gray-700">{fullName}</span>
          </Link>

          <Link
            href="/home/support"
            className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 px-4 py-2.5 rounded-md transition"
          >
            <span className="text-sm text-gray-700">Support</span>
          </Link>

          <SignOutButton />
        </div>
      </div>

      {/* SIDE NAV */}
      <div className="fixed top-[13vh] left-0 h-[87vh] w-[20vw] bg-[#F7F7F8] border-r border-gray-200 text-black z-40 flex flex-col justify-end">
        <div className="p-10">{renderNav()}</div>
      </div>
    </>
  );
}
