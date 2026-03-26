import Link from "next/link";
import { getProfileByUserId } from "@/data-access/profiles";
import { auth } from "@/auth";
import SignOutButton from "./SignOutButton";
import { database } from "@/db/database";
import { supportTickets, users } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export default async function Header2() {
  const session = await auth();

  let fullName = "Guest";
  let unreadCount = 0;

  if (session?.user?.id) {
    const profile = await getProfileByUserId(session.user.id);
    fullName = profile?.fullName ?? "Unknown User";

    const dbUser = await database.query.users.findFirst({
      where: eq(users.id, session.user.id),
    });

    if (dbUser?.organisationId) {
      const unreadTickets = await database.query.supportTickets.findMany({
        where: and(
          eq(supportTickets.organisationId, dbUser.organisationId),
          eq(supportTickets.status, "waiting_on_user"),
        ),
      });

      unreadCount = unreadTickets.length;
    }
  }

  return (
    <div className="bg-black fixed text-white pb-8 pr-8 flex items-center justify-end z-50 w-full h-[13vh]">
      <div className="flex items-center gap-6">
        {/* PROFILE */}
        <Link
          href="/home/me"
          className="flex items-center space-x-3 hover:opacity-80 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-8"
          >
            <path
              fillRule="evenodd"
              d="M18.685 19.097A9.723 9.723 0 0 0 21.75 12c0-5.385-4.365-9.75-9.75-9.75S2.25 6.615 2.25 12a9.723 9.723 0 0 0 3.065 7.097A9.716 9.716 0 0 0 12 21.75a9.716 9.716 0 0 0 6.685-2.653Zm-12.54-1.285A7.486 7.486 0 0 1 12 15a7.486 7.486 0 0 1 5.855 2.812A8.224 8.224 0 0 1 12 20.25a8.224 8.224 0 0 1-5.855-2.438ZM15.75 9a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
              clipRule="evenodd"
            />
          </svg>
          <div className="text-sm">{fullName}</div>
        </Link>

        {/* SUPPORT BUTTON */}
        <Link
          href="/home/support"
          className="relative flex items-center gap-2 bg-white/10 hover:bg-white/20 px-4 py-3 rounded-lg transition group"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            className="w-5 h-5 group-hover:scale-110 transition"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8 10h8M8 14h5M21 12c0 4.418-4.03 8-9 8a9.77 9.77 0 0 1-4-.8L3 20l1.2-3.2A7.86 7.86 0 0 1 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
            />
          </svg>

          <span className="text-sm">Support</span>

          {/* 🔴 UNREAD BADGE */}
          {unreadCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs font-semibold px-2 py-0.5 rounded-full shadow">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Link>

        {/* SIGN OUT */}
        <SignOutButton />
      </div>
    </div>
  );
}
