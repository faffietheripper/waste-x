"use client";

import { useState, useTransition } from "react";

import { sendRegEmail } from "@/util/sendRegEmail";

import { resendTeamInviteAction } from "../actions";

export default function InviteActionsClient({
  userId,
}: {
  userId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function resend() {
    startTransition(async () => {
      setMessage(null);

      const result = await resendTeamInviteAction(userId);

      if (!result.success) {
        setMessage(result.message);
        return;
      }

      const emailResult = await sendRegEmail({
        name: result.name,
        email: result.email,
        token: result.token,
      });

      setMessage(
        emailResult.success
          ? "Invite resent."
          : emailResult.message ?? "Invite token refreshed but email failed.",
      );
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={resend}
        disabled={pending}
        className="rounded-full bg-black px-3 py-2 text-xs font-semibold text-white transition hover:bg-orange-500 hover:text-black disabled:opacity-50"
      >
        {pending ? "Sending..." : "Resend"}
      </button>

      {message ? (
        <span className="max-w-40 text-[10px] leading-4 text-black/45">
          {message}
        </span>
      ) : null}
    </div>
  );
}
