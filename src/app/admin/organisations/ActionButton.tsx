"use client";

import { useFormStatus } from "react-dom";

export function ApproveButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full bg-black px-3 py-1.5 text-xs font-black text-white transition hover:bg-red-600 disabled:opacity-50"
    >
      {pending ? "Approving..." : "Approve"}
    </button>
  );
}

export function RejectButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-full border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-black text-red-700 transition hover:bg-red-600 hover:text-white disabled:opacity-50"
    >
      {pending ? "Rejecting..." : "Reject"}
    </button>
  );
}
