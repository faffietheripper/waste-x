"use client";

import { resendInvite } from "@/app/setup-account/actions";
import { getInviteStatus } from "@/util/inviteStatus";

export default function TeamMembersTable({ users }: { users: any[] }) {
  const handleResend = async (id: string) => {
    const res = await resendInvite(id);

    if (res.success) {
      alert("Invite resent");
    } else {
      alert(res.message);
    }
  };

  return (
    <div className="border border-neutral-800">
      {users.map((user) => {
        const status = getInviteStatus(user);

        return (
          <div
            key={user.id}
            className="flex justify-between items-center p-4 border-b border-neutral-900"
          >
            <div>
              <p className="text-sm">{user.name}</p>
              <p className="text-xs text-neutral-500">{user.email}</p>
            </div>

            <div className="flex items-center gap-4">
              {/* STATUS */}
              <span
                className={`text-xs px-2 py-1 border ${
                  status === "ACTIVE"
                    ? "border-green-500 text-green-500"
                    : status === "EXPIRED"
                      ? "border-red-500 text-red-500"
                      : "border-orange-500 text-orange-500"
                }`}
              >
                {status}
              </span>

              {/* ACTION */}
              {status !== "ACTIVE" && (
                <button
                  onClick={() => handleResend(user.id)}
                  className="text-xs text-orange-500 hover:underline"
                >
                  Resend
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
