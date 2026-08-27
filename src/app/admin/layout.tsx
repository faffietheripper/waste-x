import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { auth, signOut } from "@/auth";
import AdminNav from "@/components/admin/AdminNav";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import { requireActiveSession } from "@/modules/auth/core/requireActiveSession";

async function logoutAction() {
  "use server";

  await signOut({
    redirectTo: "/login",
  });
}

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireActiveSession();

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

  return (
    <div className="min-h-screen bg-[#080808] text-white">
      {/* =========================================================
          DESKTOP SIDEBAR
      ========================================================= */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-72 flex-col border-r border-red-950/70 bg-black lg:flex">
        {/* Fixed identity area */}
        <AdminIdentity
          name={dbUser.name ?? "Platform Admin"}
          email={dbUser.email}
        />

        {/* Scrollable navigation area */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <AdminNav unreadCount={unreadCount} />
        </div>

        {/* Fixed footer */}
        <AdminFooter logoutAction={logoutAction} />
      </aside>

      {/* =========================================================
          MOBILE HEADER
      ========================================================= */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/95 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-xs font-black text-white">
              WX
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black text-white">
                Waste X Platform Admin
              </p>

              <p className="text-[9px] font-bold uppercase tracking-[0.18em] text-red-500">
                Control plane
              </p>
            </div>
          </div>

          <details className="relative shrink-0">
            <summary className="cursor-pointer list-none rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-white transition hover:bg-white/10">
              Menu
            </summary>

            <div className="absolute right-0 mt-3 flex max-h-[80vh] w-[min(90vw,340px)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50">
              {/* Mobile nav scroll area */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <AdminNav unreadCount={unreadCount} />
              </div>

              {/* Mobile logout stays visible */}
              <div className="shrink-0 border-t border-white/10 bg-black p-4">
                <form action={logoutAction}>
                  <button
                    type="submit"
                    className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700"
                  >
                    Logout
                  </button>
                </form>
              </div>
            </div>
          </details>
        </div>
      </header>

      {/* =========================================================
          PAGE CONTENT
      ========================================================= */}
      <main className="min-h-screen lg:ml-72">
        <div className="mx-auto w-full max-w-[1700px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}

/* =========================================================
   SIDEBAR IDENTITY
========================================================= */

function AdminIdentity({
  name,
  email,
}: {
  name: string;
  email: string;
}) {
  return (
    <div className="shrink-0 border-b border-white/10 p-5">
      <div className="rounded-[1.4rem] border border-white/10 bg-[#080808] p-4">
        <div className="flex items-center gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 text-sm font-black text-white">
            WX
          </div>

          <div className="min-w-0">
            <p className="text-sm font-black leading-tight text-white">
              Waste X Platform Admin
            </p>

            <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">
              Control plane
            </p>
          </div>
        </div>

        <div className="mt-4 border-t border-white/10 pt-4">
          <p className="truncate text-sm font-bold text-white">
            {name}
          </p>

          <p className="mt-1 truncate text-xs text-white/35">
            {email}
          </p>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   SIDEBAR FOOTER
========================================================= */

function AdminFooter({
  logoutAction,
}: {
  logoutAction: () => Promise<void>;
}) {
  return (
    <div className="shrink-0 border-t border-white/10 bg-black p-4">
      <div className="mb-3 rounded-xl border border-red-950/60 bg-red-950/15 px-3 py-2">
        <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-700">
          Protected platform surface
        </p>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700"
        >
          Logout
        </button>
      </form>
    </div>
  );
}