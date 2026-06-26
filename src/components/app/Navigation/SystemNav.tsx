import { auth } from "@/auth";
import { database } from "@/db/database";
import { users, supportTickets } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import Link from "next/link";
import Image from "next/image";

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

/* =========================================================
   NAV STYLES
========================================================= */

const navItem =
  "group flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium text-black/55 transition hover:bg-orange-50 hover:text-orange-600";

const navSectionLabel =
  "px-4 text-[10px] font-semibold uppercase tracking-[0.24em] text-black/35";

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
  if (!type) return "Not assigned";

  if (type === "generator") return "Generator";
  if (type === "carrier") return "Logistics";
  if (type === "manager") return "Waste Manager";
  if (type === "compliance") return "Compliance";

  return "Department";
}

function getDepartmentContextMessage(type: DepartmentType | null) {
  if (!type) {
    return "Assign a department to unlock operational navigation.";
  }

  if (type === "generator") {
    return "Generator workspace: create listings, assign jobs and complete work.";
  }

  if (type === "carrier") {
    return "Logistics workspace: manage assigned collections and incidents.";
  }

  if (type === "manager") {
    return "Waste manager workspace: bid for handling work and manage assigned jobs.";
  }

  if (type === "compliance") {
    return "Compliance workspace: review incidents, reports and audit records.";
  }

  return "Operational workspace.";
}

/* =========================================================
   OPERATIONAL NAV
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

  /*
    Important model:

    organisation.capabilities = what the company is allowed to do
    activeDepartmentType = what this user is allowed to do right now

    Example:
    A company can have generator + carrier + manager capabilities,
    but a compliance user still only sees compliance/audit work.
  */

  const canViewListings = can("listing:view");
  const canCreateListings = can("listing:create");

  const canViewTemplates = can("template:view");
  const canCreateTemplates = can("template:create");

  const canViewMarketplace = can("marketplace:view");
  const canBid = can("listing:bid");

  const canViewAssignments = can("assignment:view");

  const canViewIncidents = can("incident:view");
  const canViewComplianceReports = can("compliance:reports");
  const canViewComplianceAudit = can("compliance:audit");

  const canViewTeam = can("team:view") || hasOrganisation;
  const canViewSupport = can("support:view") || hasOrganisation;
  const canViewNotifications = can("notification:view") || hasOrganisation;

  const sections: NavSection[] = [
    {
      label: "Core",
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
          label: "Assignments Overview",
          href: "/home/operations/assignments",
          show: canViewAssignments,
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
          label: "Templates",
          href: "/home/operations/templates",
          show: canViewTemplates || canCreateTemplates,
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
          label: "Incident Review",
          href: "/home/compliance/incidents",
          show: canViewIncidents,
        },
        {
          label: "Compliance Reports",
          href: "/home/compliance/reports",
          show: canViewComplianceReports,
        },
        {
          label: "Audit Trail",
          href: "/home/compliance/audit",
          show: canViewComplianceAudit,
        },
      ],
    },
    {
      label: "Team",
      items: [
        {
          label: "Members",
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
    {
      label: "System",
      items: [
        {
          label: "Notifications",
          href: "/home/notifications",
          show: canViewNotifications,
        },
        {
          label: "Support",
          href: "/home/support",
          show: canViewSupport,
        },
        {
          label: "Settings",
          href: "/home/settings/profile",
          show: true,
        },
      ],
    },
  ];

  return (
    <nav className="flex flex-col gap-7">
      {sections.map((section) => {
        const visibleItems = section.items.filter(
          (item) => item.show !== false,
        );

        if (visibleItems.length === 0) return null;

        return (
          <div key={section.label} className="space-y-2">
            <p className={navSectionLabel}>{section.label}</p>

            <div className="space-y-1">
              {visibleItems.map((item) => (
                <Link key={item.href} href={item.href} className={navItem}>
                  <span>{item.label}</span>

                  <span className="text-black/20 transition group-hover:translate-x-0.5 group-hover:text-orange-500">
                    →
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

/* =========================================================
   CAPABILITY PILLS
========================================================= */

function CapabilityPills({ capabilities }: { capabilities: Capability[] }) {
  if (!capabilities.length) {
    return (
      <span className="rounded-full border border-orange-300 bg-orange-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-orange-700">
        Setup Required
      </span>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {capabilities.map((capability) => (
        <span
          key={capability}
          className="rounded-full border border-black/10 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-widest text-black/45"
        >
          {capability}
        </span>
      ))}
    </div>
  );
}

/* =========================================================
   ACTIVE DEPARTMENT PILL
========================================================= */

function ActiveDepartmentPill({
  activeDepartment,
}: {
  activeDepartment: {
    id: string;
    name: string;
    type: string;
  } | null;
}) {
  if (!activeDepartment) {
    return (
      <Link
        href="/home/settings/departments"
        className="hidden rounded-full border border-orange-300 bg-orange-50 px-4 py-2 text-xs font-medium text-orange-700 transition hover:border-orange-400 hover:bg-orange-100 lg:block"
      >
        Department setup required
      </Link>
    );
  }

  return (
    <Link
      href="/home/settings/departments"
      className="hidden rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-medium text-black/55 transition hover:border-orange-300 hover:text-orange-600 lg:block"
    >
      Active:{" "}
      <span className="font-semibold capitalize text-black">
        {activeDepartment.name}
      </span>
    </Link>
  );
}

/* =========================================================
   MAIN NAV
========================================================= */

export default async function SystemNav() {
  const session = await auth();

  if (!session?.user?.id) return null;

  /* =========================================================
     USER + ORGANISATION
  ========================================================= */

  const user = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
    with: {
      organisation: true,
      department: true,
    },
  });

  const capabilities =
    (user?.organisation?.capabilities as Capability[] | null) ?? [];

  const hasOrganisation = Boolean(user?.organisationId && user?.organisation);

  const activeDepartment = user?.department ?? null;

  const activeDepartmentType =
    (activeDepartment?.type as DepartmentType | undefined) ?? null;

  /* =========================================================
     PROFILE
  ========================================================= */

  const profile = await getProfileByUserId(session.user.id);

  const fullName = profile?.fullName ?? user?.name ?? "Unknown User";

  const profileImage = profile?.profilePicture ?? null;

  /* =========================================================
     SUPPORT BADGE
  ========================================================= */

  let waitingOnUserCount = 0;

  if (user?.organisationId) {
    const waitingTickets = await database.query.supportTickets.findMany({
      where: and(
        eq(supportTickets.organisationId, user.organisationId),
        eq(supportTickets.status, "waiting_on_user"),
      ),
      columns: {
        id: true,
      },
    });

    waitingOnUserCount = waitingTickets.length;
  }

  /* =========================================================
     UI
  ========================================================= */

  return (
    <>
      {/* ================= TOP BAR ================= */}
      <header className="fixed left-0 top-0 z-50 flex h-[13vh] w-full items-center justify-between border-b border-black/10 bg-[#f7f3ed]/95 px-10 backdrop-blur">
        {/* LOGO */}
        <Link href="/home" className="flex items-center">
          <Image
            src="/wastexblack.png"
            height={140}
            width={140}
            alt="Waste X logo"
            className="object-contain"
            priority
          />
        </Link>

        {/* RIGHT */}
        <div className="flex items-center gap-5">
          {/* ACTIVE DEPARTMENT */}
          <ActiveDepartmentPill activeDepartment={activeDepartment} />

          {/* PROFILE */}
          <Link
            href="/home/settings/profile"
            className="flex items-center gap-3 rounded-full border border-black/10 bg-white px-3 py-2 transition hover:border-orange-300 hover:bg-orange-50"
          >
            {profileImage ? (
              <img
                src={profileImage}
                alt={fullName}
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-full bg-black text-xs font-semibold text-orange-400">
                {getInitials(fullName) || "WX"}
              </div>
            )}

            <span className="hidden text-sm font-medium text-black/65 md:block">
              {fullName}
            </span>
          </Link>

          {/* SUPPORT */}
          <Link
            href="/home/support"
            className="relative rounded-full bg-black px-5 py-2.5 text-sm font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black"
          >
            Support
            {waitingOnUserCount > 0 && (
              <span className="absolute -right-2 -top-2 rounded-full bg-red-500 px-2 py-0.5 text-xs font-semibold text-white">
                {waitingOnUserCount > 9 ? "9+" : waitingOnUserCount}
              </span>
            )}
          </Link>

          <SignOutButton />
        </div>
      </header>

      {/* ================= SIDE NAV ================= */}
      <aside className="fixed left-0 top-[13vh] z-40 flex h-[87vh] w-[20vw] flex-col border-r border-black/10 bg-[#f7f3ed]">
        <div className="flex h-full flex-col overflow-y-auto p-8">
          {/* ORG SUMMARY */}
          <section className="mb-8 rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600">
              Organisation
            </p>

            <h2 className="mt-2 line-clamp-2 text-base font-semibold text-black">
              {user?.organisation?.teamName ?? "No organisation"}
            </h2>

            <div className="mt-4">
              <CapabilityPills capabilities={capabilities} />
            </div>

            <div className="mt-4 rounded-2xl border border-black/10 bg-[#f7f3ed] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-black/35">
                Current Department
              </p>

              <p className="mt-2 text-sm font-semibold text-black">
                {activeDepartment?.name ?? "No department assigned"}
              </p>

              <p className="mt-1 text-xs text-black/45">
                {formatDepartmentType(activeDepartmentType)}
              </p>

              <p className="mt-3 text-xs leading-5 text-black/45">
                {getDepartmentContextMessage(activeDepartmentType)}
              </p>
            </div>

            {!user?.organisationId && (
              <Link
                href="/home/settings/organisation?reason=no-organisation"
                className="mt-5 inline-flex rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
              >
                Create Organisation →
              </Link>
            )}

            {user?.organisationId && !activeDepartment && (
              <Link
                href="/home/settings/departments?reason=no-active-department"
                className="mt-5 inline-flex rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
              >
                Assign Department →
              </Link>
            )}
          </section>

          {/* NAV */}
          <OperationalNav
            capabilities={capabilities}
            activeDepartmentType={activeDepartmentType}
            hasOrganisation={hasOrganisation}
          />

          {/* FOOTER CONTEXT */}
          <section className="mt-auto pt-8">
            <div className="rounded-3xl border border-black/10 bg-black p-5 text-white">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-400">
                Waste X MVP
              </p>

              <p className="mt-2 text-xs leading-5 text-white/50">
                Digital infrastructure for waste tracking, assignments,
                compliance and operational chain-of-custody.
              </p>
            </div>
          </section>
        </div>
      </aside>
    </>
  );
}