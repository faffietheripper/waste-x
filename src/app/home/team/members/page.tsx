import { auth } from "@/auth";
import { database } from "@/db/database";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

/* =========================================================
   PAGE
========================================================= */

export default async function MembersPage() {
  const session = await auth();

  if (!session?.user?.organisationId) {
    return <div className="p-10">Unauthorized</div>;
  }

  const orgId = session.user.organisationId;

  /* =========================================================
     FETCH USERS
  ========================================================= */

  const allUsers = await database
    .select()
    .from(users)
    .where(eq(users.organisationId, orgId));

  /* =========================================================
     SPLIT
  ========================================================= */

  const members = allUsers.filter((u: any) => u.status === "ACTIVE");
  const invited = allUsers.filter((u: any) => u.status === "INVITED");

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="p-10 mt-32 flex flex-col gap-10">
      {/* HEADER */}
      <div className="pl-[24vw] flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organisation Members</h1>
          <p className="text-sm text-gray-500">
            Manage your team and invitations
          </p>
        </div>

        {/* ADD MEMBER */}
        <a
          href="/home/team/members/invite"
          className="bg-blue-600 text-white text-sm px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          + Add Member
        </a>
      </div>

      {/* GRID */}
      <div className="pl-[24vw] grid grid-cols-3 gap-6 ">
        {/* ================= MEMBERS (2/3) ================= */}
        <div className="col-span-2 flex flex-col gap-6 ">
          <h2 className="text-lg font-semibold">Active Members</h2>

          {members.length === 0 && (
            <p className="text-sm text-gray-500">No active members.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {members.map((user: any) => (
              <div
                key={user.id}
                className="border border-gray-200 rounded-xl p-4 flex flex-col gap-2 hover:shadow-sm transition"
              >
                <p className="font-medium">{user.name || "Unnamed User"}</p>

                <p className="text-sm text-gray-500">{user.email}</p>

                <div className="text-xs text-gray-400">Role: {user.role}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ================= INVITED (1/3) ================= */}
        <div className="col-span-1 flex flex-col gap-6 bg-gray-200 p-2 rounded-md ">
          <h2 className="text-lg font-semibold">Invited</h2>

          {invited.length === 0 && (
            <p className="text-sm text-gray-500">No pending invites.</p>
          )}

          <div className="flex flex-col gap-4">
            {invited.map((user: any) => (
              <div
                key={user.id}
                className="border border-yellow-200 bg-yellow-50 rounded-xl p-4 flex flex-col gap-2"
              >
                <p className="font-medium">{user.name || "Invited User"}</p>

                <p className="text-sm text-gray-600">{user.email}</p>

                <div className="text-xs text-yellow-700">Invite pending</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
