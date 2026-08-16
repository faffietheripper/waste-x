import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { and, eq, isNull, or } from "drizzle-orm";

import { auth, signOut } from "@/auth";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import AdminNav from "@/components/admin/AdminNav";
import { requireActiveSession } from "@/modules/auth/core/requireActiveSession";

async function logoutAction() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireActiveSession();
  const session = await auth();

  if (!session?.user?.id) redirect("/login");

  const dbUser = await database.query.users.findFirst({
    where: eq(users.id, session.user.id),
  });

  if (!dbUser || dbUser.role !== "platform_admin") redirect("/unauthorized");

  const unreadTickets = await database.query.supportTickets.findMany({
    where: or(
      eq(supportTickets.status, "open"),
      and(
        eq(supportTickets.status, "in_progress"),
        isNull(supportTickets.assignedToUserId),
      ),
    ),
    columns: { id: true },
  });

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-72 flex-col border-r border-red-950/70 bg-black text-white">
        <div className="border-b border-white/10 p-5">
          <div className="rounded-[1.4rem] border border-white/10 bg-[#080808] p-4">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-red-600 text-sm font-black text-white">WX</div>
              <div>
                <p className="text-sm font-black text-white">Waste X Admin</p>
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-red-700">Platform control</p>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <p className="truncate text-sm font-bold text-white">{dbUser.name ?? "Platform Admin"}</p>
              <p className="mt-1 truncate text-xs text-white/35">{dbUser.email}</p>
            </div>
          </div>
        </div>

        <AdminNav unreadCount={unreadTickets.length} />

        <div className="border-t border-white/10 p-4">
          <div className="mb-3 rounded-xl border border-red-950/60 bg-red-950/15 px-3 py-2">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-700">Protected admin surface</p>
          </div>
          <form action={logoutAction}>
            <button type="submit" className="w-full rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700">
              Logout
            </button>
          </form>
        </div>
      </aside>

      <main className="ml-72 min-h-screen bg-[#050505]">
        <div className="mx-auto max-w-[1550px] px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
