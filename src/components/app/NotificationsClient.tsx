"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

/* =========================================================
   TYPES
========================================================= */

type NotificationRecord = {
  id: string;
  title: string;
  message: string;
  type?: string | null;
  isRead: boolean;
  createdAt: Date | string | null;
  listingId?: number | null;
  actorId?: string | null;
  organisationId?: string | null;
  system?: boolean;
  priority?: "low" | "medium" | "high";
};

type Filter = "all" | "unread" | "read" | "system" | "workflow";

/* =========================================================
   FORMATTERS
========================================================= */

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "Not yet";

  return new Date(date).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatType(type: string | null | undefined) {
  if (!type) return "Notification";

  return type
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getTypeBadgeClass(notification: NotificationRecord) {
  if (notification.system) {
    return "border-black bg-black text-orange-400";
  }

  switch (notification.type) {
    case "verification_code_generated":
      return "border-green-300 bg-green-100 text-green-700";

    case "incident_created":
    case "incident_reported":
      return "border-red-300 bg-red-100 text-red-700";

    case "incident_resolved":
      return "border-green-300 bg-green-100 text-green-700";

    case "assignment_created":
    case "assignment_assigned":
    case "manager_assigned":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "carrier_assigned":
    case "carrier_accepted":
    case "collection_verified":
      return "border-blue-300 bg-blue-100 text-blue-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

function getNotificationHref(notification: NotificationRecord) {
  if (notification.system) {
    if (notification.id === "profile-setup") {
      return "/home/me/account";
    }

    if (notification.id === "organisation-setup") {
      return "/home/settings/organisation?reason=no-organisation";
    }

    if (notification.id === "department-setup") {
      return "/home/settings/departments";
    }

    return "/home/settings";
  }

  if (notification.listingId) {
    return `/home/marketplace/browse/${notification.listingId}`;
  }

  return "/home/notifications";
}

/* =========================================================
   COMPONENT
========================================================= */

export default function NotificationsClient({
  notifications,
  userId,
}: {
  notifications: NotificationRecord[];
  userId: string;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const unreadNotifications = notifications.filter(
    (notification) => !notification.isRead,
  );

  const readNotifications = notifications.filter(
    (notification) => notification.isRead,
  );

  const systemNotifications = notifications.filter(
    (notification) => notification.system,
  );

  const workflowNotifications = notifications.filter(
    (notification) => !notification.system,
  );

  const priorityNotifications = notifications.filter(
    (notification) =>
      !notification.isRead ||
      notification.priority === "high" ||
      notification.system,
  );

  const filteredNotifications = useMemo(() => {
    switch (filter) {
      case "unread":
        return unreadNotifications;

      case "read":
        return readNotifications;

      case "system":
        return systemNotifications;

      case "workflow":
        return workflowNotifications;

      case "all":
      default:
        return notifications;
    }
  }, [
    filter,
    notifications,
    unreadNotifications,
    readNotifications,
    systemNotifications,
    workflowNotifications,
  ]);

  return (
    <section className="grid grid-cols-1 gap-8 xl:grid-cols-12">
      {/* =========================================================
         LEFT COLUMN — ACTION REQUIRED
      ========================================================= */}

      <aside className="space-y-6 xl:col-span-5">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Action Panel
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                Needs Attention
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Unread notifications, account setup warnings and workflow alerts
                that need action.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {priorityNotifications.length}
            </span>
          </div>

          <div className="mt-6 space-y-3">
            {priorityNotifications.length === 0 ? (
              <EmptyState
                title="Nothing urgent"
                text="No unread or priority notifications right now."
              />
            ) : (
              priorityNotifications.map((notification) => (
                <NotificationCard
                  key={notification.id}
                  notification={notification}
                  prominent
                />
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-black/10 bg-black p-6 text-white shadow-sm">
          <p className="text-xs uppercase tracking-[0.25em] text-orange-400">
            Notification Coverage
          </p>

          <h3 className="mt-3 text-lg font-semibold">
            Waste X should notify you about:
          </h3>

          <div className="mt-5 space-y-3">
            <CoverageItem text="Manager assigned or accepted a listing." />
            <CoverageItem text="Carrier assigned, accepted or rejected a job." />
            <CoverageItem text="Verification codes generated for collection." />
            <CoverageItem text="Incidents created, reviewed or resolved." />
            <CoverageItem text="Assignments completed or blocked by incidents." />
          </div>
        </div>
      </aside>

      {/* =========================================================
         RIGHT COLUMN — FEED
      ========================================================= */}

      <section className="space-y-6 xl:col-span-7">
        <div className="rounded-3xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="mb-6 flex items-start justify-between gap-6">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-orange-600">
                Notification Feed
              </p>

              <h2 className="mt-2 text-xl font-semibold text-black">
                All Notifications
              </h2>

              <p className="mt-2 text-sm leading-6 text-black/45">
                Review system messages and Waste X workflow activity.
              </p>
            </div>

            <span className="rounded-full bg-black px-4 py-2 text-xs font-medium text-orange-400">
              {filteredNotifications.length} shown
            </span>
          </div>

          {/* FILTERS */}
          <div className="mb-6 flex flex-wrap gap-3">
            <FilterButton
              active={filter === "all"}
              onClick={() => setFilter("all")}
            >
              All
            </FilterButton>

            <FilterButton
              active={filter === "unread"}
              onClick={() => setFilter("unread")}
            >
              Unread
            </FilterButton>

            <FilterButton
              active={filter === "read"}
              onClick={() => setFilter("read")}
            >
              Read
            </FilterButton>

            <FilterButton
              active={filter === "system"}
              onClick={() => setFilter("system")}
            >
              System
            </FilterButton>

            <FilterButton
              active={filter === "workflow"}
              onClick={() => setFilter("workflow")}
            >
              Workflow
            </FilterButton>
          </div>

          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <EmptyState
                title="No notifications"
                text="There are no notifications matching this filter."
              />
            ) : (
              filteredNotifications.map((notification) => (
                <NotificationCard
                  key={`${notification.id}-feed`}
                  notification={notification}
                />
              ))
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

/* =========================================================
   NOTIFICATION CARD
========================================================= */

function NotificationCard({
  notification,
  prominent = false,
}: {
  notification: NotificationRecord;
  prominent?: boolean;
}) {
  const href = getNotificationHref(notification);

  return (
    <Link
      href={href}
      className={`block rounded-2xl border p-5 transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-sm ${
        notification.isRead
          ? "border-black/10 bg-white"
          : "border-orange-300 bg-orange-50"
      }`}
    >
      <div className="flex items-start justify-between gap-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${getTypeBadgeClass(
                notification,
              )}`}
            >
              {notification.system ? "System" : formatType(notification.type)}
            </span>

            {!notification.isRead && (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-black">
                Unread
              </span>
            )}

            {notification.priority === "high" && (
              <span className="rounded-full border border-red-300 bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                Priority
              </span>
            )}
          </div>

          <h3
            className={`mt-3 font-semibold text-black ${
              prominent ? "text-lg" : "text-base"
            }`}
          >
            {notification.title}
          </h3>

          <p className="mt-2 text-sm leading-6 text-black/55">
            {notification.message}
          </p>
        </div>

        <div className="shrink-0 text-right">
          <p className="text-xs text-black/35">
            {formatDate(notification.createdAt)}
          </p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-black/5 pt-4">
        <p className="text-xs text-black/35">
          ID: <span className="font-mono">{notification.id.slice(0, 12)}</span>
        </p>

        <span className="text-sm font-semibold text-orange-600">Open →</span>
      </div>
    </Link>
  );
}

/* =========================================================
   SMALL COMPONENTS
========================================================= */

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-4 py-2 text-sm font-medium transition ${
        active
          ? "bg-black text-orange-400"
          : "bg-[#fbfaf7] text-black/55 hover:bg-orange-100 hover:text-orange-700"
      }`}
    >
      {children}
    </button>
  );
}

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/20 bg-[#fbfaf7] p-8 text-center">
      <p className="text-sm font-semibold text-black">{title}</p>
      <p className="mt-2 text-sm leading-6 text-black/45">{text}</p>
    </div>
  );
}

function CoverageItem({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-sm leading-6 text-white/55">{text}</p>
    </div>
  );
}
