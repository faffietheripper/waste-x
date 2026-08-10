import { auth } from "@/auth";
import { database } from "@/db/database";
import {
  notifications,
  supportTickets,
  users,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { getProfileByUserId } from "@/data-access/profiles";
import SignOutButton from "../SignOutButton";

import {
  type Capability,
  type DepartmentType,
  type Permission,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

/* =========================================================
   TYPES
========================================================= */

type NavItem = {
  label: string;
  href: string;
  show?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

type ActiveDepartmentSummary = {
  name: string;
  type: DepartmentType | null;
} | null;

/* =========================================================
   NAV STYLES
========================================================= */

const navItem =
  "group flex items-center justify-between rounded-2xl border border-transparent px-4 py-3 text-sm font-medium text-black/55 transition hover:border-orange-200 hover:bg-white hover:text-black hover:shadow-sm";

const navSectionLabel =
  "px-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/30";

/* =========================================================
   HELPERS
========================================================= */

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatDepartmentType(type: DepartmentType | null) {
  if (!type) return "Department not assigned";

  if (type === "generator") return "Waste Generator";
  if (type === "carrier") return "Waste Carrier";
  if (type === "manager") return "Waste Manager";
  if (type === "compliance") return "Compliance";

  return "Operational Department";
}

function formatBadgeCount(count: number) {
  if (count > 99) return "99+";

  return count.toString();
}

/* =========================================================
   SIMPLE ICONS
========================================================= */

function BellIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
    >
      <path
        d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M10 21h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SupportIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
    >
      <path
        d="M4 12a8 8 0 0 1 16 0v5a2 2 0 0 1-2 2h-2v-6h4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M4 13h4v6H6a2 2 0 0 1-2-2v-4Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M16 19c0 1.1-.9 2-2 2h-2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      className="h-5 w-5"
    >
      <path
        d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"
        stroke="currentColor"
        strokeWidth="1.8"
      />

      <path
        d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.86 2.86-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.55v-.09A1.7 1.7 0 0 0 8.5 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.86-2.86.06-.06A1.7 1.7 0 0 0 4.1 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2.3V9.55h.1A1.7 1.7 0 0 0 4.1 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06L6.56 3.7l.06.06A1.7 1.7 0 0 0 8.5 4.1a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2.3h4.05v.1A1.7 1.7 0 0 0 15 4.1a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.86 2.86-.06.06A1.7 1.7 0 0 0 19.4 8.5a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4.05h-.1A1.7 1.7 0 0 0 19.4 15Z"
        stroke="currentColor"
        strokeWidth="1.35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="h-4 w-4"
    >
      <path
        d="m7.5 5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* =========================================================
   ACTIVE DEPARTMENT
========================================================= */

function ActiveDepartmentPill({
  department,
}: {
  department: ActiveDepartmentSummary;
}) {
  if (!department) {
    return (
      <Link
        href="/home/settings/departments?reason=no-active-department"
        className="hidden items-center gap-3 rounded-2xl border border-orange-300 bg-orange-50 px-4 py-2 transition hover:border-orange-400 hover:bg-orange-100 lg:flex"
      >
        <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />

        <span>
          <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-orange-700/60">
            Workspace
          </span>

          <span className="block text-xs font-semibold text-orange-800">
            Assign department
          </span>
        </span>
      </Link>
    );
  }

  return (
    <Link
      href="/home/settings/departments"
      className="hidden items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-2 transition hover:border-orange-300 hover:bg-orange-50 lg:flex"
    >
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-40" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
      </span>

      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-black/35">
          Active department
        </span>

        <span className="block max-w-[180px] truncate text-xs font-semibold text-black">
          {department.name}

          <span className="ml-1.5 font-normal text-black/40">
            · {formatDepartmentType(department.type)}
          </span>
        </span>
      </span>
    </Link>
  );
}

/* =========================================================
   NOTIFICATION BUTTON
========================================================= */

function NotificationButton({
  unreadCount,
}: {
  unreadCount: number;
}) {
  const notificationLabel =
    unreadCount > 0
      ? `${unreadCount} unread notification${
          unreadCount === 1 ? "" : "s"
        }`
      : "Notifications";

  return (
    <Link
      href="/home/notifications"
      aria-label={notificationLabel}
      title={notificationLabel}
      className="relative grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-black/10 bg-white text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
    >
      <BellIcon />

      {unreadCount > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#f7f3ed] bg-orange-500 px-1 text-[9px] font-bold text-black">
          {formatBadgeCount(unreadCount)}
        </span>
      )}
    </Link>
  );
}

/* =========================================================
   OPERATIONAL NAVIGATION
========================================================= */

function OperationalNav({
  capabilities,
  activeDepartmentType,
  hasOrganisation,
}: {
  capabilities: Capability[];
  activeDepartmentType: DepartmentType | null;
  hasOrganisation: boolean;
}) {
  function can(permission: Permission) {
    return hasOperationalPermission({
      capabilities,
      departmentType: activeDepartmentType,
      permission,
    });
  }

  /* Listings */
  const canViewListings = can("listing:view");
  const canCreateListings = can("listing:create");

  /* Templates */
  const canViewTemplates = can("template:view");
  const canCreateTemplates = can("template:create");

  /* Marketplace */
  const canViewMarketplace = can("marketplace:view");
  const canBid = can("listing:bid");

  /* Assignments */
  const canViewAssignments = can("assignment:view");
  const canAssignCarrier = can("assignment:assign_carrier");

  /*
    Carrier Hub is intentionally manager-side for MVP.
    Generators can still see assigned carriers through listings/assignments,
    and carriers use their own assignment queue. The hub is for the manager
    step: accepted job -> choose carrier -> carrier workflow starts.
  */
  const canUseCarrierHub =
    hasOrganisation &&
    activeDepartmentType === "manager" &&
    (canViewAssignments || canAssignCarrier);

  /* Receiving */
  const canViewReceiving = can("receiving:view");
  const canCreateReceiving = can("receiving:create");
  const canSubmitReceiving = can("receiving:submit");

  /* Digital Waste Tracking */
  const canViewDigitalWasteTracking = can("dwt:view");

  const canSubmitDigitalWasteTracking = can(
    "dwt:submit_receive_movement",
  );

  const canUpdateDigitalWasteTracking = can(
    "dwt:update_receive_movement",
  );

  const canViewDwtReferenceData = can(
    "dwt:reference_data:view",
  );

  const canSyncDwtReferenceData = can(
    "dwt:reference_data:sync",
  );

  const canAccessDwtArea =
    canViewDigitalWasteTracking ||
    canSubmitDigitalWasteTracking ||
    canUpdateDigitalWasteTracking ||
    canViewDwtReferenceData ||
    canSyncDwtReferenceData;

  /* Incidents, compliance and reports */
  const canViewIncidents = can("incident:view");
  const canViewComplianceReports = can("compliance:reports");
  const canViewComplianceAudit = can("compliance:audit");

  /*
    Reports Centre is wider than the old compliance reports page.
    It should be available to organisation users who can view operational,
    compliance, receiving or DWT areas. The reports page itself still performs
    server-side permission checks before generating anything.
  */
  const canViewReportsCentre =
    hasOrganisation &&
    (canViewListings ||
      canViewAssignments ||
      canViewReceiving ||
      canAccessDwtArea ||
      canViewIncidents ||
      canViewComplianceReports ||
      canViewComplianceAudit);

  /* Shared workspace */
  const canViewTeam = can("team:view") || hasOrganisation;

  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        {
          label: "Dashboard",
          href: "/home",
          show: true,
        },
      ],
    },
    {
      label: "Operations",
      items: [
        {
          label: "My Listings",
          href: "/home/operations/listings",
          show: canViewListings || canCreateListings,
        },
        {
          label: "Assignments",
          href: "/home/operations/assignments",
          show: canViewAssignments,
        },
        {
          label: "Carrier Hub",
          href: "/home/operations/carriers",
          show: canUseCarrierHub,
        },
        {
          label: "Active Assignments",
          href: "/home/operations/assignments/active",
          show: canViewAssignments,
        },
        {
          label: "Completed Jobs",
          href: "/home/operations/assignments/completed",
          show: canViewAssignments,
        },
        {
          label: "Intake Queue",
          href: "/home/receiving/intake",
          show: canViewReceiving,
        },
        {
          label: "New Intake",
          href: "/home/receiving/intake/new",
          show: canCreateReceiving,
        },
        {
          label: "DWT Submissions",
          href: "/home/receiving/submissions",
          show:
            canViewReceiving ||
            canSubmitReceiving ||
            canAccessDwtArea,
        },
      ],
    },
    {
      label: "Marketplace",
      items: [
        {
          label: "Browse Listings",
          href: "/home/marketplace/browse",
          show: canViewMarketplace,
        },
        {
          label: "My Bids",
          href: "/home/marketplace/bids",
          show: canBid,
        },
      ],
    },
    {
      label: "Compliance",
      items: [
        {
          label: "Digital Waste Tracking",
          href: "/home/compliance/digital-waste-tracking",
          show: canAccessDwtArea,
        },
        {
          label: "Incident Review",
          href: "/home/compliance/incidents",
          show: canViewIncidents,
        },
        {
          label: "Reports Centre",
          href: "/home/reports",
          show: canViewReportsCentre,
        },
        {
          label: "Audit Trail",
          href: "/home/compliance/audit",
          show: canViewComplianceAudit,
        },
      ],
    },
    {
      label: "Workspace",
      items: [
        {
          label: "Templates",
          href: "/home/operations/templates",
          show: canViewTemplates || canCreateTemplates,
        },
        {
          label: "Team Members",
          href: "/home/team/members",
          show: canViewTeam,
        },
        {
          label: "Organisation",
          href: "/home/settings/organisation",
          show: true,
        },
        {
          label: "Departments",
          href: "/home/settings/departments",
          show: true,
        },
      ],
    },
  ];

  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => {
        const visibleItems = section.items.filter(
          (item) => item.show !== false,
        );

        if (visibleItems.length === 0) return null;

        return (
          <section
            key={section.label}
            className="space-y-2"
          >
            <p className={navSectionLabel}>
              {section.label}
            </p>

            <div className="space-y-1">
              {visibleItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={navItem}
                >
                  <span className="min-w-0 flex-1 truncate">
                    {item.label}
                  </span>

                  <span className="text-black/15 transition group-hover:translate-x-0.5 group-hover:text-orange-500">
                    <ArrowIcon />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </nav>
  );
}

/* =========================================================
   SIDEBAR FOOTER
========================================================= */

function SidebarFooter({
  waitingOnUserCount,
}: {
  waitingOnUserCount: number;
}) {
  return (
    <div className="border-t border-black/10 bg-[#f7f3ed] p-4">
      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/home/support"
          className="relative flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 py-3 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
        >
          <SupportIcon />

          <span>Support</span>

          {waitingOnUserCount > 0 && (
            <span className="absolute -right-1.5 -top-1.5 grid min-h-5 min-w-5 place-items-center rounded-full border-2 border-[#f7f3ed] bg-red-500 px-1 text-[9px] font-bold text-white">
              {waitingOnUserCount > 9
                ? "9+"
                : waitingOnUserCount}
            </span>
          )}
        </Link>

        <Link
          href="/home/settings/profile"
          className="flex items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white px-3 py-3 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-600"
        >
          <SettingsIcon />

          <span>Settings</span>
        </Link>
      </div>
    </div>
  );
}

/* =========================================================
   MAIN NAVIGATION
========================================================= */

export default async function SystemNav() {
  const session = await auth();

  if (!session?.user?.id) return null;

  /* =========================================================
     USER, ORGANISATION AND DEPARTMENT
  ========================================================= */

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  const capabilities =
    (user?.organisation?.capabilities as
      | Capability[]
      | null) ?? [];

  const hasOrganisation = Boolean(
    user?.organisationId && user?.organisation,
  );

  const activeDepartment = user?.department ?? null;

  const activeDepartmentType =
    (activeDepartment?.type as
      | DepartmentType
      | undefined) ?? null;

  /* =========================================================
     PROFILE, NOTIFICATIONS AND SUPPORT COUNTS
  ========================================================= */

  const profilePromise = getProfileByUserId(
    session.user.id,
  );

  const unreadNotificationsPromise = database
    .select({
      id: notifications.id,
    })
    .from(notifications)
    .where(
      and(
        eq(
          notifications.recipientId,
          session.user.id,
        ),
        eq(notifications.isRead, false),
      ),
    );

  const waitingTicketsPromise = user?.organisationId
    ? database.query.supportTickets.findMany({
        where: and(
          eq(
            supportTickets.organisationId,
            user.organisationId,
          ),
          eq(
            supportTickets.status,
            "waiting_on_user",
          ),
        ),
        columns: {
          id: true,
        },
      })
    : Promise.resolve([]);

  const [
    profile,
    unreadNotifications,
    waitingTickets,
  ] = await Promise.all([
    profilePromise,
    unreadNotificationsPromise,
    waitingTicketsPromise,
  ]);

  const fullName =
    profile?.fullName ??
    user?.name ??
    "Unknown User";

  const profileImage =
    profile?.profilePicture ?? null;

  const unreadNotificationCount =
    unreadNotifications.length;

  const waitingOnUserCount =
    waitingTickets.length;

  const departmentSummary: ActiveDepartmentSummary =
    activeDepartment
      ? {
          name: activeDepartment.name,
          type: activeDepartmentType,
        }
      : null;

  /* =========================================================
     UI
  ========================================================= */

  return (
    <>
      {/* ================= TOP BAR ================= */}
      <header className="fixed left-0 top-0 z-50 flex h-[13vh] w-full items-center justify-between border-b border-black/10 bg-[#f7f3ed]/95 px-6 backdrop-blur lg:px-10">
        {/* LOGO */}
        <Link
          href="/home"
          aria-label="Waste X dashboard"
          className="flex items-center"
        >
          <Image
            src="/wastexblack.png"
            height={140}
            width={140}
            alt="Waste X logo"
            className="object-contain"
            priority
          />
        </Link>

        {/* TOP BAR ACTIONS */}
        <div className="flex items-center gap-2 sm:gap-3">
          <ActiveDepartmentPill
            department={departmentSummary}
          />

          <NotificationButton
            unreadCount={unreadNotificationCount}
          />

          <Link
            href="/home/settings/profile"
            className="flex h-11 items-center gap-3 rounded-2xl border border-black/10 bg-white px-2.5 transition hover:border-orange-300 hover:bg-orange-50 sm:px-3"
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt={fullName}
                className="h-8 w-8 rounded-xl object-cover"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-xl bg-black text-xs font-semibold text-orange-400">
                {getInitials(fullName) || "WX"}
              </div>
            )}

            <span className="hidden max-w-[150px] truncate text-sm font-medium text-black/65 md:block">
              {fullName}
            </span>
          </Link>

          <SignOutButton />
        </div>
      </header>

      {/* ================= SIDE NAV ================= */}
      <aside className="fixed left-0 top-[13vh] z-40 flex h-[87vh] w-[20vw] flex-col border-r border-black/10 bg-[#f7f3ed]">
        <div className="flex h-full min-h-0 flex-col">
          {/* SCROLLABLE NAV ITEMS */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <OperationalNav
              capabilities={capabilities}
              activeDepartmentType={
                activeDepartmentType
              }
              hasOrganisation={hasOrganisation}
            />
          </div>

          {/* ALWAYS-VISIBLE FOOTER ACTIONS */}
          <SidebarFooter
            waitingOnUserCount={
              waitingOnUserCount
            }
          />
        </div>
      </aside>
    </>
  );
}