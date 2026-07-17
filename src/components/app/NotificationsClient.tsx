"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { markNotificationAsRead } from "@/modules/notifications/actions/markAsRead";
import { markAllNotificationsAsRead } from "@/modules/notifications/actions/markAllAsRead";

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

  /*
    Old compatibility flag.
  */
  system?: boolean;

  /*
    New temporary system notification flag.
    These are generated in checkSystemNotifications and do not exist in db.
  */
  isSystemGenerated?: boolean;

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

function isSystemNotification(notification: NotificationRecord) {
  return Boolean(notification.system || notification.isSystemGenerated);
}

function getNotificationPriority(notification: NotificationRecord) {
  if (notification.priority) return notification.priority;

  if (isSystemNotification(notification)) {
    return "high";
  }

  switch (notification.type) {
    case "incident_reported":
    case "incident_created":
    case "verification_code_generated":
    case "support_waiting_on_user":
      return "high";

    case "manager_assigned":
    case "manager_rejected":
    case "carrier_assigned":
    case "carrier_rejected":
      return "medium";

    default:
      return "low";
  }
}

function getTypeBadgeClass(notification: NotificationRecord) {
  if (isSystemNotification(notification)) {
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
    case "manager_accepted":
      return "border-orange-300 bg-orange-100 text-orange-700";

    case "carrier_assigned":
    case "carrier_accepted":
    case "collection_verified":
      return "border-blue-300 bg-blue-100 text-blue-700";

    case "waste_received_completed":
    case "assignment_completed":
      return "border-green-300 bg-green-100 text-green-700";

    case "support_reply_added":
    case "support_waiting_on_user":
      return "border-purple-300 bg-purple-100 text-purple-700";

    default:
      return "border-gray-300 bg-gray-100 text-gray-700";
  }
}

/* =========================================================
   NOTIFICATION ROUTING

   Important:
   Workflow notifications must be checked before listingId.
   Most workflow notifications still carry listingId for context,
   but the Open button should take users to assignment workflows.
========================================================= */

function getNotificationHref(notification: NotificationRecord) {
  const system = isSystemNotification(notification);

  if (system) {
    if (
      notification.id === "profile-setup" ||
      notification.id === "system-profile-setup" ||
      notification.type === "system_profile_setup"
    ) {
      return "/home/settings/profile";
    }

    if (
      notification.id === "organisation-setup" ||
      notification.id === "system-organisation-setup" ||
      notification.type === "system_organisation_setup"
    ) {
      return "/home/settings/organisation?reason=no-organisation";
    }

    if (
      notification.id === "department-setup" ||
      notification.id === "system-department-setup" ||
      notification.type === "system_department_setup"
    ) {
      return "/home/settings/departments";
    }

    if (
      notification.id === "role-setup" ||
      notification.id === "system-role-setup" ||
      notification.type === "system_role_setup"
    ) {
      return "/home/settings/account";
    }

    return "/home/settings/profile";
  }

  const type = notification.type ?? "";

  /*
    Assignment / workflow notifications should go to the assignment overview,
    not the marketplace listing page.
  */
  if (
    type.includes("assignment") ||
    type.includes("carrier") ||
    type.includes("manager") ||
    type.includes("collection") ||
    type.includes("verification") ||
    type.includes("waste_received") ||
    type.includes("receive_waste")
  ) {
    return "/home/operations/assignments";
  }

  if (type.startsWith("support_")) {
    return "/home/support";
  }

  if (type.includes("incident")) {
    return "/home/compliance/incidents";
  }

  /*
    Only pure listing notifications go to the listing detail page.
  */
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
  const router = useRouter();

  const [filter, setFilter] = useState<Filter>("all");
  const [localReadIds, setLocalReadIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const normalisedNotifications = useMemo(() => {
    return notifications.map((notification) => ({
      ...notification,
      isRead:
        notification.isRead ||
        localReadIds.includes(notification.id) ||
        false,
      system: isSystemNotification(notification),
      priority: getNotificationPriority(notification),
    }));
  }, [notifications, localReadIds]);

  const unreadNotifications = normalisedNotifications.filter(
    (notification) => !notification.isRead,
  );

  const readNotifications = normalisedNotifications.filter(
    (notification) => notification.isRead,
  );

  const systemNotifications = normalisedNotifications.filter((notification) =>
    isSystemNotification(notification),
  );

  const workflowNotifications = normalisedNotifications.filter(
    (notification) => !isSystemNotification(notification),
  );

  const storedUnreadNotifications = normalisedNotifications.filter(
    (notification) =>
      !notification.isRead && !isSystemNotification(notification),
  );

  const priorityNotifications = normalisedNotifications.filter(
    (notification) =>
      !notification.isRead ||
      getNotificationPriority(notification) === "high" ||
      isSystemNotification(notification),
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
        return normalisedNotifications;
    }
  }, [
    filter,
    normalisedNotifications,
    unreadNotifications,
    readNotifications,
    systemNotifications,
    workflowNotifications,
  ]);

  function markLocalRead(notificationId: string) {
    setLocalReadIds((prev) =>
      prev.includes(notificationId) ? prev : [...prev, notificationId],
    );
  }

  function handleMarkOneAsRead(notification: NotificationRecord) {
    if (notification.isRead) return;

    /*
      System notifications are temporary UI alerts.
      They are not stored in bb_notification, so we only mark them locally.
    */
    if (isSystemNotification(notification)) {
      markLocalRead(notification.id);
      setMessage("System notification marked as read for this session.");
      return;
    }

    startTransition(async () => {
      try {
        await markNotificationAsRead({
          notificationId: notification.id,
          userId,
        });

        markLocalRead(notification.id);
        setMessage("Notification marked as read.");
        router.refresh();
      } catch (error) {
        console.error(error);
        setMessage("Failed to mark notification as read.");
      }
    });
  }

  function handleMarkAllAsRead() {
    if (storedUnreadNotifications.length === 0) {
      setMessage("No stored unread notifications to mark as read.");
      return;
    }

    startTransition(async () => {
      try {
        await markAllNotificationsAsRead(userId);

        setLocalReadIds((prev) => [
          ...prev,
          ...storedUnreadNotifications
            .map((notification) => notification.id)
            .filter((id) => !prev.includes(id)),
        ]);

        setMessage("Stored notifications marked as read.");
        router.refresh();
      } catch (error) {
        console.error(error);
        setMessage("Failed to mark all notifications as read.");
      }
    });
  }

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

          {message && (
            <div className="mt-5 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800">
              {message}
            </div>
          )}

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleMarkAllAsRead}
              disabled={isPending || storedUnreadNotifications.length === 0}
              className="rounded-full bg-black px-4 py-2 text-xs font-semibold text-orange-400 transition hover:bg-orange-500 hover:text-black disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isPending ? "Working..." : "Mark stored as read"}
            </button>

            <Link
              href="/home/settings/profile"
              className="rounded-full border border-black/10 bg-[#fbfaf7] px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
            >
              Account setup
            </Link>
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
                  isPending={isPending}
                  onMarkAsRead={() => handleMarkOneAsRead(notification)}
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
                  isPending={isPending}
                  onMarkAsRead={() => handleMarkOneAsRead(notification)}
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
  isPending,
  onMarkAsRead,
}: {
  notification: NotificationRecord;
  prominent?: boolean;
  isPending: boolean;
  onMarkAsRead: () => void;
}) {
  const href = getNotificationHref(notification);
  const system = isSystemNotification(notification);

  return (
    <article
      className={`rounded-2xl border p-5 transition ${
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
              {system ? "System" : formatType(notification.type)}
            </span>

            {!notification.isRead && (
              <span className="rounded-full bg-orange-500 px-3 py-1 text-xs font-semibold text-black">
                Unread
              </span>
            )}

            {getNotificationPriority(notification) === "high" && (
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

      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t border-black/5 pt-4">
        <p className="text-xs text-black/35">
          ID:{" "}
          <span className="font-mono">
            {notification.id.length > 12
              ? notification.id.slice(0, 12)
              : notification.id}
          </span>
        </p>

        <div className="flex items-center gap-3">
          {!notification.isRead && (
            <button
              type="button"
              disabled={isPending}
              onClick={onMarkAsRead}
              className="rounded-full border border-black/10 bg-white px-4 py-2 text-xs font-semibold text-black/55 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Mark read
            </button>
          )}

          <Link
            href={href}
            className="rounded-full bg-orange-500 px-4 py-2 text-xs font-semibold text-black transition hover:bg-orange-400"
          >
            Open →
          </Link>
        </div>
      </div>
    </article>
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
  children: ReactNode;
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