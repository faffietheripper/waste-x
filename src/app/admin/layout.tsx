import Link from "next/link";
import { ReactNode } from "react";
import { signOut, auth } from "@/auth";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import { eq, and, or, isNull } from "drizzle-orm";
import { redirect } from "next/navigation";

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

  if (dbUser?.role !== "platform_admin") {
    redirect("/unauthorized");
  }

  console.log("SESSION:", session);
  console.log("DB USER:", dbUser);

  // 🔴 ADMIN UNREAD COUNT
  const unreadTickets = await database.query.supportTickets.findMany({
    where: or(
      eq(supportTickets.status, "open"),
      and(
        eq(supportTickets.status, "in_progress"),
        isNull(supportTickets.assignedToUserId),
      ),
    ),
  });

  const unreadCount = unreadTickets.length;

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Sidebar */}
      <aside className="fixed top-0 left-0 h-screen w-64 bg-black text-white flex flex-col">
        <div className="p-6 text-xl font-bold border-b border-gray-800">
          Waste X Admin
        </div>

        <nav className="flex-1 p-4 space-y-2 text-sm overflow-y-auto">
          <AdminLink href="/admin">Dashboard</AdminLink>
          <AdminLink href="/admin/analytics">Analytics</AdminLink>
          <AdminLink href="/admin/users">Users</AdminLink>
          <AdminLink href="/admin/organisations">Organisations</AdminLink>
          <AdminLink href="/admin/incidents">Incidents</AdminLink>
          <AdminLink href="/admin/reviews">Reviews</AdminLink>
          <AdminLink href="/admin/errors">Errors</AdminLink>

          <AdminLink href="/admin/support">
            <div className="flex justify-between items-center">
              <span>Support</span>

              {unreadCount > 0 && (
                <span className="bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </div>
          </AdminLink>
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-4">
          <form action={logoutAction}>
            <button
              type="submit"
              className="w-full text-left px-4 py-2 rounded bg-red-600 hover:bg-red-700 transition text-sm"
            >
              Logout
            </button>
          </form>

          <div className="text-xs text-gray-400">Waste Platform v1.0</div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 min-h-screen p-8 overflow-y-auto">{children}</main>
    </div>
  );
}

function AdminLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-4 py-2 rounded hover:bg-gray-800 transition"
    >
      {children}
    </Link>
  );
}
