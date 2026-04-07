"use client";

import { useState } from "react";
import { resendInvite, revokeInvite } from "@/app/home/team-dashboard/actions";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: "ACTIVE" | "INVITED" | string;
  inviteExpiry?: Date | string | null;
};

type ActionResponse = { success: true } | { success: false; message: string };

/* =========================================================
   COMPONENT
========================================================= */

export default function TeamMembersTable({ users }: { users: User[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"resend" | "revoke" | null>(
    null,
  );
  const [localUsers, setLocalUsers] = useState(users);

  const run = useAction();

  const now = new Date();

  const active = localUsers.filter((u) => u.status === "ACTIVE");
  const invited = localUsers.filter((u) => u.status === "INVITED");

  /* =========================================================
     RESEND
  ========================================================= */

  const handleResend = async (userId: string) => {
    setLoadingId(userId);
    setActionType("resend");

    const res = await run<ActionResponse>(() => resendInvite(userId));

    setLoadingId(null);

    // errors handled globally
    if (res && res.success === false) return;
  };

  /* =========================================================
     REVOKE
  ========================================================= */

  const handleRevoke = async (userId: string) => {
    setLoadingId(userId);
    setActionType("revoke");

    const res = await run<ActionResponse>(() => revokeInvite(userId));

    setLoadingId(null);

    if (res && res.success === true) {
      setLocalUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="space-y-10">
      {/* ================= ACTIVE USERS ================= */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Active Members</h2>

        <div className="border border-neutral-800 rounded-xl overflow-hidden">
          {active.length === 0 && (
            <div className="p-4 text-sm text-neutral-500">
              No active members.
            </div>
          )}

          {active.map((user) => (
            <div
              key={user.id}
              className="flex justify-between items-center p-4 border-b border-neutral-800"
            >
              <div>
                <p className="text-white font-medium">{user.name}</p>
                <p className="text-sm text-neutral-500">{user.email}</p>
              </div>

              <div className="text-sm text-neutral-400">{user.role}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ================= INVITED USERS ================= */}
      <div>
        <h2 className="text-lg font-semibold mb-4">Pending Invites</h2>

        <div className="border border-neutral-800 rounded-xl overflow-hidden">
          {invited.length === 0 && (
            <div className="p-4 text-sm text-neutral-500">
              No pending invites.
            </div>
          )}

          {invited.map((user) => {
            const expiryDate = user.inviteExpiry
              ? new Date(user.inviteExpiry)
              : null;

            const isExpired =
              expiryDate && expiryDate.getTime() < now.getTime();

            const isLoading = loadingId === user.id;

            return (
              <div
                key={user.id}
                className="flex justify-between items-center p-4 border-b border-neutral-800"
              >
                <div>
                  <p className="text-white font-medium">{user.name}</p>
                  <p className="text-sm text-neutral-500">{user.email}</p>

                  {expiryDate && (
                    <p
                      className={`text-xs mt-1 ${
                        isExpired ? "text-red-500" : "text-yellow-500"
                      }`}
                    >
                      {isExpired
                        ? "Invite expired"
                        : `Expires: ${expiryDate.toLocaleDateString("en-GB")}`}
                    </p>
                  )}
                </div>

                <div className="flex gap-2">
                  <button
                    disabled={isLoading}
                    onClick={() => handleResend(user.id)}
                    className="px-3 py-1 text-xs bg-orange-500 text-black rounded disabled:opacity-50"
                  >
                    {isLoading && actionType === "resend"
                      ? "Sending..."
                      : "Resend"}
                  </button>

                  <button
                    disabled={isLoading}
                    onClick={() => handleRevoke(user.id)}
                    className="px-3 py-1 text-xs border border-red-500 text-red-500 rounded disabled:opacity-50"
                  >
                    {isLoading && actionType === "revoke"
                      ? "Revoking..."
                      : "Revoke"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
