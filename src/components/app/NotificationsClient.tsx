"use client";

import { markAsRead } from "@/app/home/notifications/actions";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

export default function NotificationsClient({
  notifications,
  userId,
}: {
  notifications: {
    id: string;
    title: string;
    message: string;
    isRead: boolean;
  }[];
  userId: string;
}) {
  const unreadNotifications = notifications.filter((n) => !n.isRead);
  const readNotifications = notifications.filter((n) => n.isRead);

  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function handleMarkAsRead(id: string) {
    await markAsRead(id);

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <div className="p-8 space-y-10 pl-[24vw] pt-32">
      {/* HEADER */}
      <div className="bg-gradient-to-r from-indigo-600 to-blue-700 text-white p-8 rounded-2xl shadow-xl">
        <h1 className="text-3xl font-bold mb-2">Notifications</h1>
        <p className="text-sm opacity-80">
          Stay updated with system activity and actions
        </p>
      </div>

      {!userId ? (
        <div className="bg-red-100 text-red-700 p-4 rounded-xl border">
          User ID is missing.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* ================= UNREAD ================= */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Unread</h2>

              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">
                {unreadNotifications.length}
              </span>
            </div>

            {unreadNotifications.length === 0 ? (
              <p className="text-sm text-gray-500">No unread notifications.</p>
            ) : (
              <div className="space-y-4">
                {unreadNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border border-blue-200 bg-blue-50 hover:shadow-sm transition"
                  >
                    <h3 className="font-semibold text-sm mb-1">{n.title}</h3>

                    <p className="text-sm text-gray-600 mb-3">{n.message}</p>

                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      disabled={isPending}
                      className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {isPending ? "Updating..." : "Mark as Read"}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ================= READ ================= */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">Read</h2>

              <span className="text-xs bg-gray-200 text-gray-700 px-2 py-1 rounded-full">
                {readNotifications.length}
              </span>
            </div>

            {readNotifications.length === 0 ? (
              <p className="text-sm text-gray-500">No read notifications.</p>
            ) : (
              <div className="space-y-4">
                {readNotifications.map((n) => (
                  <div
                    key={n.id}
                    className="p-4 rounded-xl border bg-gray-50 opacity-80"
                  >
                    <h3 className="font-semibold text-sm mb-1">{n.title}</h3>

                    <p className="text-sm text-gray-500">{n.message}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <div className="bg-gray-50 p-4 rounded-xl border text-xs text-gray-500 text-center">
        Notification Stream · Waste X System Events
      </div>
    </div>
  );
}
