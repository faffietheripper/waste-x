"use client";

import { useState } from "react";
import { resendInvite, revokeInvite } from "@/app/home/team-dashboard/actions";

export default function TeamInvitesTable({ users }: { users: any[] }) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"resend" | "revoke" | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [localUsers, setLocalUsers] = useState(users);

  const invites = localUsers.filter((u) => u.status === "INVITED");

  const handleResend = async (userId: string) => {
    setLoadingId(userId);
    setActionType("resend");
    setMessage(null);

    const res = await resendInvite(userId);

    setLoadingId(null);

    if (res.success) {
      setMessage("Invite resent successfully.");
    } else {
      setMessage(res.message);
    }
  };

  const handleRevoke = async (userId: string) => {
    setLoadingId(userId);
    setActionType("revoke");
    setMessage(null);

    const res = await revokeInvite(userId);

    setLoadingId(null);

    if (res.success) {
      setMessage("Invite revoked.");

      // 🔥 remove from UI instantly
      setLocalUsers((prev) => prev.filter((u) => u.id !== userId));
    } else {
      setMessage(res.message);
    }
  };

  return (
    <div className="border border-neutral-800">
      {/* GLOBAL MESSAGE */}
      {message && (
        <div className="p-3 text-sm text-green-400 border-b border-neutral-800">
          {message}
        </div>
      )}

      {invites.map((user) => {
        const isExpired =
          user.inviteExpiry && new Date(user.inviteExpiry) < new Date();

        const isLoading = loadingId === user.id;

        return (
          <div
            key={user.id}
            className="flex justify-between items-center p-4 border-b border-neutral-800"
          >
            <div>
              <p>{user.name}</p>
              <p className="text-sm text-neutral-500">{user.email}</p>

              <p
                className={`text-xs mt-1 ${
                  isExpired ? "text-red-500" : "text-yellow-500"
                }`}
              >
                {isExpired
                  ? "Invite expired"
                  : user.inviteExpiry &&
                    `Expires: ${new Date(user.inviteExpiry).toLocaleDateString(
                      "en-GB",
                      {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      },
                    )}`}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                disabled={isLoading}
                onClick={() => handleResend(user.id)}
                className="bg-orange-500 text-black px-3 py-1 text-xs disabled:opacity-50"
              >
                {isLoading && actionType === "resend" ? "Sending..." : "Resend"}
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleRevoke(user.id)}
                className="border border-red-500 text-red-500 px-3 py-1 text-xs disabled:opacity-50"
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
