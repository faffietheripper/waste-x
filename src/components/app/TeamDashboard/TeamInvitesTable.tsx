"use client";

import { useState } from "react";
import { resendInvite, revokeInvite } from "@/app/home/team-dashboard/actions";
import { useAction } from "@/lib/actions/useAction";

/* =========================================================
   TYPES
========================================================= */

type UserInvite = {
  id: string;
  name: string;
  email: string;
  status: string;
  inviteExpiry?: Date | string | null;
};

type ActionResponse = { success: true } | { success: false; message: string };

/* =========================================================
   COMPONENT
========================================================= */

export default function TeamInvitesTable({ users }: { users: UserInvite[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"resend" | "revoke" | null>(
    null,
  );
  const [localUsers, setLocalUsers] = useState(users);

  const run = useAction();

  const invites = localUsers.filter((u) => u.status === "INVITED");

  /* =========================================================
     RESEND
  ========================================================= */

  const handleResend = async (userId: string) => {
    setLoadingId(userId);
    setActionType("resend");

    const res = await run<ActionResponse>(() => resendInvite(userId));

    setLoadingId(null);

    // ✅ success handled silently (toast/global UI can handle if needed)
    if (res && res.success === false) {
      // error handled globally via useAction
    }
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
      // ✅ instant UI update
      setLocalUsers((prev) => prev.filter((u) => u.id !== userId));
    }
  };

  /* =========================================================
     UI
  ========================================================= */

  return (
    <div className="border border-neutral-800 rounded-xl overflow-hidden">
      {invites.length === 0 && (
        <div className="p-4 text-sm text-neutral-500">No pending invites.</div>
      )}

      {invites.map((user) => {
        const expiryDate = user.inviteExpiry
          ? new Date(user.inviteExpiry)
          : null;

        const isExpired =
          expiryDate && expiryDate.getTime() < new Date().getTime();

        const isLoading = loadingId === user.id;

        return (
          <div
            key={user.id}
            className="flex justify-between items-center p-4 border-b border-neutral-800"
          >
            <div>
              <p className="font-medium">{user.name}</p>
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
                className="bg-orange-500 text-black px-3 py-1 text-xs rounded disabled:opacity-50"
              >
                {isLoading && actionType === "resend" ? "Sending..." : "Resend"}
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleRevoke(user.id)}
                className="border border-red-500 text-red-500 px-3 py-1 text-xs rounded disabled:opacity-50"
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
  );
}
