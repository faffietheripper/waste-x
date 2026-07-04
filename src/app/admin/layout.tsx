// src/app/admin/layout.tsx

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { auth, signOut } from "@/auth";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import AdminNav from "@/components/admin/AdminNav";

async function logoutAction() {
  "use server";

  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser || dbUser.role !== "platform_admin") {
    redirect("/unauthorized");
  }

  const unreadTickets = await database.query.supportTickets.findMany({
    where: or(
      eq(supportTickets.status, "open"),
      and(
        eq(supportTickets.status, "in_progress"),
        isNull(supportTickets.assignedToUserId),
      ),
    ),
    columns: {
      id: true,
    },
  });

  const unreadCount = unreadTickets.length;

  const adminInitials = getInitials(dbUser.name ?? dbUser.email ?? "Admin");

  return (
    <div className="min-h-screen bg-gray-100 text-gray-950">
      {/* ================= SIDEBAR ================= */}
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-gray-900 bg-black text-white">
        {/* BRAND HEADER */}
        <div className="border-b border-gray-800 p-5">
          <div className="rounded-[1.35rem] border border-gray-800 bg-gray-950 p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-white text-sm font-black text-black">
                WX
              </div>

              <div>
                <p className="text-sm font-bold leading-none text-white">
                  Waste X Admin
                </p>

                <p className="mt-1 text-[11px] text-gray-500">
                  Platform command centre
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-800 bg-black px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-600">
                Signed in as
              </p>

              <div className="mt-2 flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-gray-800 text-xs font-bold text-white">
                  {adminInitials}
                </div>

                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">
                    {dbUser.name ?? "Platform Admin"}
                  </p>

                  <p className="truncate text-xs text-gray-500">
                    {dbUser.email}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* NAV */}
        <AdminNav unreadCount={unreadCount} />

        {/* FOOTER */}
        <div className="border-t border-gray-800 p-4">

           

            <form action={logoutAction} className="mt-4">
              <button
                type="submit"
                className="w-full rounded-2xl bg-red-600 text-center px-4 py-3 text-left text-sm font-semibold text-white transition hover:bg-red-700"
              >
                Logout
              </button>
            </form>

            
          </div>

      </aside>

      {/* ================= MAIN ================= */}
      <main className="ml-72 min-h-screen">
        <div className="mx-auto max-w-[1500px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}

/* =========================================================
   HELPERS
========================================================= */

function getInitials(value: string) {
  const parts = value
    .trim()
    .split(" ")
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "WX";

  return parts
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}