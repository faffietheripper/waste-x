// src/components/app/Navigation/SystemNav.tsx

import { and, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";

import { auth } from "@/auth";
import { database } from "@/db/database";

import {
  notifications,
  supportTickets,
  users,
  type OrganisationOperatingMode,
} from "@/db/schema";

import { getProfileByUserId } from "@/data-access/profiles";

import {
  type Capability,
  type DepartmentType,
  type Permission,
  hasOperationalPermission,
} from "@/modules/auth/core/permissions";

import {
  shouldShowActiveDepartmentSwitcher,
  shouldShowAdvancedCompliance,
  shouldShowCarrierHub,
  shouldShowDepartments,
  shouldShowDwtSubmissions,
  shouldShowExternalJobs,
  shouldShowIncidents,
  shouldShowMarketplace,
  shouldShowReceiving,
  shouldShowReports,
  shouldShowSiteSettings,
  shouldShowTeamMembers,
  shouldUseSimplifiedNavigation,
  type OrganisationCapability,
} from "@/modules/organisations/core/operatingModes";

import type { SoloPermission } from "@/modules/solo-permissions/core/permissions";
import { getSoloUserAccess } from "@/modules/solo-permissions/data-access/getSoloUserAccess";

import SignOutButton from "../SignOutButton";
import SiteSwitcher from "./SiteSwitcher";

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

type OrganisationNavigationContext = {
  operatingMode?: OrganisationOperatingMode | null;
  capabilities?: OrganisationCapability[] | null;
} | null;

/* =========================================================
   STYLES
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

function formatDepartmentType(
  type: DepartmentType | null,
) {
  if (!type) {
    return "Department not assigned";
  }

  if (type === "generator") {
    return "Waste Generator";
  }

  if (type === "carrier") {
    return "Waste Carrier";
  }

  if (type === "manager") {
    return "Waste Manager";
  }

  if (type === "compliance") {
    return "Compliance";
  }

  return "Operational Department";
}

function formatBadgeCount(count: number) {
  if (count > 99) {
    return "99+";
  }

  return count.toString();
}

/* =========================================================
   ICONS
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
   WORKSPACE PILLS
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

function SoloWorkspacePill({
  canManageOrganisation,
}: {
  canManageOrganisation: boolean;
}) {
  const content = (
    <>
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-40" />

        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-orange-500" />
      </span>

      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-[0.2em] text-orange-700/60">
          Solo workspace
        </span>

        <span className="block max-w-[180px] truncate text-xs font-semibold text-black">
          Main operational workspace
        </span>
      </span>
    </>
  );

  if (!canManageOrganisation) {
    return (
      <div
        title="Organisation settings are restricted"
        className="hidden items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2 lg:flex"
      >
        {content}
      </div>
    );
  }

  return (
    <Link
      href="/home/settings/organisation"
      className="hidden items-center gap-3 rounded-2xl border border-orange-200 bg-orange-50 px-4 py-2 transition hover:border-orange-300 hover:bg-orange-100 lg:flex"
    >
      {content}
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
   NAV RENDERER
========================================================= */

function NavigationSections({
  sections,
}: {
  sections: NavSection[];
}) {
  return (
    <nav className="flex flex-col gap-6">
      {sections.map((section) => {
        const visibleItems = section.items.filter(
          (item) => item.show !== false,
        );

        if (visibleItems.length === 0) {
          return null;
        }

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
                  key={`${section.label}-${item.href}-${item.label}`}
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
   SOLO MVP NAVIGATION
========================================================= */

function SoloOperationalNav({
  hasOrganisation,
  permissions,
}: {
  hasOrganisation: boolean;
  permissions: Set<SoloPermission>;
}) {
  function can(permission: SoloPermission) {
    return hasOrganisation && permissions.has(permission);
  }

  function canAny(required: SoloPermission[]) {
    return hasOrganisation && required.some((permission) => permissions.has(permission));
  }

  const sections: NavSection[] = [
    {
      label: "Overview",
      items: [
        {
          label: "Dashboard",
          href: "/home",
          // Dashboard remains the safe landing page for every active Solo user.
          show: true,
        },
      ],
    },

    {
      label: "Operations",
      items: [
        {
          label: "Jobs",
          href: "/home/jobs",
          show: canAny(["jobs:view", "jobs:create"]),
        },
        {
          label: "Daily Operations",
          href: "/home/worksheet",
          show: can("worksheet:view"),
        },
        {
          label: "Movements",
          href: "/home/movements",
          show: can("worksheet:view"),
        },
      ],
    },
{
      label: "Compliance",
      items: [
       
        {
          label: "DWT Centre",
          href: "/home/dwt",
          show: can("dwt:view"),
        },
        {
          label: "Quarterly Returns",
          href: "/home/returns",
          show: can("returns:view"),
        },
        {
          label: "Activity",
          href: "/home/activity",
          show: can("activity:view"),
        }, {
          label: "Receiving Site & Permit",
          href: "/home/sites",
          show: can("site_permit:view"),
        },
      ],
    },
    {
      label: "Business Data",
      items: [
        {
          label: "Clients",
          href: "/home/clients",
          show: can("clients:view"),
        },
        {
          label: "Hauliers",
          href: "/home/hauliers",
          show: can("transport:view"),
        },
        {
          label: "Drivers & Vehicles",
          href: "/home/transport",
          show: can("transport:view"),
        },
        {
          label: "Materials",
          href: "/home/materials",
          show: can("materials:view"),
        },
        {
          label: "Third-Party Facilities",
          href: "/home/tips",
          // The current permission catalogue does not have a dedicated
          // third-party-facility permission. For MVP, users involved in
          // transport OR site/compliance work may view this master data.
          show: canAny(["transport:view", "site_permit:view"]),
        },
        {
          label: "Rate Library",
          href: "/home/rates",
          // Legacy/reference pricing remains available, but Jobs now own the
          // commercial terms used by native customer invoicing.
          show: can("rates:view"),
        },
      ],
    },

    

    {
      label: "Accounts",
      items: [
        {
          label: "Commercial & Invoicing",
          href: "/home/commercial",
          show: can("accounts:view"),
        },
        {
          label: "Billing & Exports",
          href: "/home/accounts",
          // Retained for the existing export/external-accounting workflow.
          show: can("accounts:view"),
        },
        {
          label: "Reports",
          href: "/home/reports",
          show: can("reports:view"),
        },
        {
          label: "Transport Emissions",
          href: "/home/reports/transport-emissions",
          show: can("reports:view"),
        },
      ],
    },

    {
      label: "Marketplace",
      items: [
        {
          label: "Browse Marketplace",
          href: "/home/marketplace/browse",
          // Marketplace is treated as part of job visibility for the Solo MVP.
          show: can("jobs:view"),
        },
        {
          label: "My Listings",
          href: "/home/operations/listings",
          show: can("jobs:view"),
        },
        {
          label: "My Bids",
          href: "/home/marketplace/bids",
          show: can("jobs:view"),
        },
      ],
    },

    {
      label: "Workspace",
      items: [
        {
          label: "Team & Permissions",
          href: "/home/team/members",
          show: can("team:view"),
        },
      ],
    },
  ];

  return <NavigationSections sections={sections} />;
}

/* =========================================================
   LEGACY / FUTURE NETWORK NAVIGATION

   Generator / Carrier / departments remain here.

   They are NOT shown while Solo Workspace MVP is active.
========================================================= */

function LegacyOperationalNav({
  capabilities,
  activeDepartmentType,
  hasOrganisation,
  organisation,
}: {
  capabilities: Capability[];
  activeDepartmentType: DepartmentType | null;
  hasOrganisation: boolean;
  organisation: OrganisationNavigationContext;
}) {
  function can(permission: Permission) {
    return hasOperationalPermission({
      capabilities,
      departmentType: activeDepartmentType,
      permission,
    });
  }

  /* =========================================================
     LISTINGS
  ========================================================= */

  const canViewListings = can("listing:view");
  const canCreateListings = can("listing:create");

  const canAccessWasteRecords =
    canViewListings || canCreateListings;

  /* =========================================================
     TEMPLATES
  ========================================================= */

  const canViewTemplates = can("template:view");
  const canCreateTemplates = can("template:create");

  /* =========================================================
     MARKETPLACE
  ========================================================= */

  const canViewMarketplace = can("marketplace:view");
  const canBid = can("listing:bid");

  const canAccessMarketplace =
    hasOrganisation &&
    shouldShowMarketplace(organisation) &&
    (canViewMarketplace || canBid);

  /* =========================================================
     ASSIGNMENTS
  ========================================================= */

  const canViewAssignments = can("assignment:view");

  const canAssignCarrier = can(
    "assignment:assign_carrier",
  );

  const canUseCarrierHub =
    hasOrganisation &&
    shouldShowCarrierHub(organisation) &&
    activeDepartmentType === "manager" &&
    (canViewAssignments || canAssignCarrier);

  /* =========================================================
     RECEIVING
  ========================================================= */

  const canViewReceiving = can("receiving:view");
  const canCreateReceiving = can("receiving:create");
  const canSubmitReceiving = can("receiving:submit");

  const canAccessReceivingArea =
    hasOrganisation &&
    (shouldShowReceiving(organisation) ||
      canViewReceiving ||
      canCreateReceiving ||
      canSubmitReceiving);

  /* =========================================================
     DWT
  ========================================================= */

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
    hasOrganisation &&
    (shouldShowDwtSubmissions(organisation) ||
      canViewDigitalWasteTracking ||
      canSubmitDigitalWasteTracking ||
      canUpdateDigitalWasteTracking ||
      canViewDwtReferenceData ||
      canSyncDwtReferenceData);

  /* =========================================================
     INCIDENTS / COMPLIANCE
  ========================================================= */

  const canViewIncidents = can("incident:view");

  const canViewComplianceReports = can(
    "compliance:reports",
  );

  const canViewComplianceAudit = can(
    "compliance:audit",
  );

  const canAccessIncidents =
    hasOrganisation &&
    (shouldShowIncidents(organisation) ||
      canViewIncidents);

  const canViewReportsCentre =
    hasOrganisation &&
    (shouldShowReports(organisation) ||
      canViewListings ||
      canViewAssignments ||
      canViewReceiving ||
      canAccessDwtArea ||
      canViewIncidents ||
      canViewComplianceReports ||
      canViewComplianceAudit);

  const canAccessAdvancedCompliance =
    shouldShowAdvancedCompliance(organisation) &&
    canViewComplianceAudit;

  /* =========================================================
     WORKSPACE
  ========================================================= */

  const canViewTeam =
    can("team:view") || hasOrganisation;

  const canAccessTeamMembers =
    canViewTeam &&
    shouldShowTeamMembers(organisation);

  const canAccessDepartments =
    hasOrganisation &&
    shouldShowDepartments(organisation);

  const canAccessSiteSettings =
    hasOrganisation &&
    shouldShowSiteSettings(organisation);

  /* =========================================================
     SECTIONS
  ========================================================= */

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
          show: canAccessWasteRecords,
        },

        {
          label: "External Jobs",
          href: "/home/operations/jobs",
          show:
            hasOrganisation &&
            shouldShowExternalJobs(organisation),
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
          show: canAccessReceivingArea,
        },

        {
          label: "DWT Submissions",
          href: "/home/receiving/submissions",
          show: canAccessDwtArea,
        },
      ],
    },

    {
      label: "Marketplace",
      items: [
        {
          label: "Browse Listings",
          href: "/home/marketplace/browse",
          show:
            canAccessMarketplace &&
            canViewMarketplace,
        },

        {
          label: "My Bids",
          href: "/home/marketplace/bids",
          show:
            canAccessMarketplace &&
            canBid,
        },
      ],
    },

    {
      label: "Compliance",
      items: [
        {
          label: "Digital Waste Tracking",
          href:
            "/home/compliance/digital-waste-tracking",
          show: canAccessDwtArea,
        },

        {
          label: "Incident Review",
          href: "/home/compliance/incidents",
          show: canAccessIncidents,
        },

        {
          label: "Reports Centre",
          href: "/home/reports",
          show: canViewReportsCentre,
        },

        {
          label: "Audit Trail",
          href: "/home/compliance/audit",
          show: canAccessAdvancedCompliance,
        },
      ],
    },

    {
      label: "Workspace",
      items: [
        {
          label: "Templates",
          href: "/home/operations/templates",
          show:
            canViewTemplates ||
            canCreateTemplates,
        },

        {
          label: "Team Members",
          href: "/home/team/members",
          show: canAccessTeamMembers,
        },

        {
          label: "Organisation",
          href: "/home/settings/organisation",
          show: hasOrganisation,
        },

        {
          label: "Sites",
          href: "/home/settings/sites",
          show: canAccessSiteSettings,
        },

        {
          label: "Departments",
          href: "/home/settings/departments",
          show: canAccessDepartments,
        },
      ],
    },
  ];

  return <NavigationSections sections={sections} />;
}

/* =========================================================
   OPERATIONAL NAVIGATION ROUTER
========================================================= */

function OperationalNav({
  capabilities,
  activeDepartmentType,
  hasOrganisation,
  organisation,
  soloPermissions,
}: {
  capabilities: Capability[];
  activeDepartmentType: DepartmentType | null;
  hasOrganisation: boolean;
  organisation: OrganisationNavigationContext;
  soloPermissions: Set<SoloPermission>;
}) {
  const useSoloNavigation =
    shouldUseSimplifiedNavigation(organisation);

  if (useSoloNavigation) {
    return (
      <SoloOperationalNav
        hasOrganisation={hasOrganisation}
        permissions={soloPermissions}
      />
    );
  }

  return (
    <LegacyOperationalNav
      capabilities={capabilities}
      activeDepartmentType={activeDepartmentType}
      hasOrganisation={hasOrganisation}
      organisation={organisation}
    />
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

  if (!session?.user?.id) {
    return null;
  }

  /* =========================================================
     USER
  ========================================================= */

  const user =
    await database.query.users.findFirst({
      where: eq(users.id, session.user.id),

      with: {
        organisation: true,
        department: true,
      },
    });

  const capabilities =
    (user?.organisation
      ?.capabilities as Capability[] | null) ??
    [];

  const organisationModeCapabilities =
    capabilities as OrganisationCapability[];

  const organisationContext: OrganisationNavigationContext =
    user?.organisation
      ? {
          operatingMode:
            user.organisation
              .operatingMode as OrganisationOperatingMode | null,

          capabilities:
            organisationModeCapabilities,
        }
      : null;

  const hasOrganisation = Boolean(
    user?.organisationId &&
      user?.organisation,
  );

  /* =========================================================
     DEPARTMENT

     Still loaded for future/legacy workspaces.

     Solo Workspace ignores it.
  ========================================================= */

  const activeDepartment =
    user?.department ?? null;

  const activeDepartmentType =
    (activeDepartment?.type as
      | DepartmentType
      | undefined) ?? null;

  /* =========================================================
     PRODUCT WORKSPACE
  ========================================================= */

  const isSoloOrganisation =
    shouldUseSimplifiedNavigation(
      organisationContext,
    );

  /*
    SOLO PERMISSION-AWARE NAVIGATION

    The sidebar now uses the exact same effective access snapshot as
    Team & Permissions. No new DB fields or schema changes are required.
  */
  const soloAccess =
    isSoloOrganisation &&
    user?.organisationId &&
    user.role !== "platform_admin"
      ? await getSoloUserAccess({
          organisationId: user.organisationId,
          userId: user.id,
        })
      : null;

  const soloPermissions =
    new Set<SoloPermission>(
      soloAccess?.permissions ?? [],
    );

  const showSoloWorkspacePill =
    hasOrganisation &&
    isSoloOrganisation;

  const showActiveDepartmentPill =
    hasOrganisation &&
    !isSoloOrganisation &&
    shouldShowActiveDepartmentSwitcher(
      organisationContext,
    );

  /* =========================================================
     HEADER DATA
  ========================================================= */

  const profilePromise =
    getProfileByUserId(session.user.id);

  const unreadNotificationsPromise =
    database
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
          eq(
            notifications.isRead,
            false,
          ),
        ),
      );

  const waitingTicketsPromise =
    user?.organisationId
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

  /* =========================================================
     DISPLAY DATA
  ========================================================= */

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
     RENDER
  ========================================================= */

  return (
    <>
      <header className="fixed left-0 top-0 z-50 flex h-[13vh] w-full items-center justify-between border-b border-black/10 bg-[#f7f3ed]/95 px-6 backdrop-blur lg:px-10">
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

        <div className="flex items-center gap-2 sm:gap-3">
          {hasOrganisation &&
            user?.organisationId && (
              <SiteSwitcher
                organisationId={
                  user.organisationId
                }
                organisation={
                  organisationContext
                }
              />
            )}

          {showSoloWorkspacePill && (
            <SoloWorkspacePill
              canManageOrganisation={
                soloPermissions.has("permissions:manage")
              }
            />
          )}

          {showActiveDepartmentPill && (
            <ActiveDepartmentPill
              department={departmentSummary}
            />
          )}

          <NotificationButton
            unreadCount={
              unreadNotificationCount
            }
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
                {getInitials(fullName) ||
                  "WX"}
              </div>
            )}

            <span className="hidden max-w-[150px] truncate text-sm font-medium text-black/65 md:block">
              {fullName}
            </span>
          </Link>

          <SignOutButton />
        </div>
      </header>

      <aside className="fixed left-0 top-[13vh] z-40 flex h-[87vh] w-[20vw] flex-col border-r border-black/10 bg-[#f7f3ed]">
        <div className="flex h-full min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
            <OperationalNav
              capabilities={capabilities}
              activeDepartmentType={
                activeDepartmentType
              }
              hasOrganisation={
                hasOrganisation
              }
              organisation={
                organisationContext
              }
              soloPermissions={
                soloPermissions
              }
            />
          </div>

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