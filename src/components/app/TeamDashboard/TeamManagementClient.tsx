"use client";

import { useState } from "react";
import TeamMembersTable from "./TeamMembersTable";
import TeamInvitesTable from "./TeamInvitesTable";

export default function TeamManagementClient({ users }: { users: any[] }) {
  const [tab, setTab] = useState<"members" | "invites">("members");

  const active = users.filter((u) => u.status === "ACTIVE");
  const invited = users.filter((u) => u.status === "INVITED");

  const expired = invited.filter(
    (u) => u.inviteExpiry && new Date(u.inviteExpiry) < new Date(),
  );

  return (
    <div className="p-10 text-black">
      {/* HEADER */}
      <div className="mb-10">
        <h1 className="text-3xl font-semibold">Team Management</h1>
        <p className="text-sm text-neutral-500 mt-2">
          Manage organisation users, invites, and access permissions.
        </p>
      </div>

      {/* STATS */}
      <div className="grid grid-cols-3 gap-4 mb-10">
        <Stat label="Active Members" value={active.length} />
        <Stat label="Pending Invites" value={invited.length} />
        <Stat label="Expired Invites" value={expired.length} />
      </div>

      {/* TABS */}
      <div className="flex gap-6 mb-6 border-b border-neutral-800">
        <button
          onClick={() => setTab("members")}
          className={`pb-2 ${
            tab === "members"
              ? "text-orange-500 border-b border-orange-500"
              : "text-neutral-500"
          }`}
        >
          Members
        </button>

        <button
          onClick={() => setTab("invites")}
          className={`pb-2 ${
            tab === "invites"
              ? "text-orange-500 border-b border-orange-500"
              : "text-neutral-500"
          }`}
        >
          Invites
        </button>
      </div>

      {/* CONTENT */}
      {tab === "members" ? (
        <TeamMembersTable users={users} />
      ) : (
        <TeamInvitesTable users={users} />
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-neutral-800 p-4">
      <p className="text-sm text-neutral-500">{label}</p>
      <p className="text-2xl font-semibold text-black">{value}</p>
    </div>
  );
}
